/**
 * @jest-environment jsdom
 */

import { AutocompleteCache } from "@/web/client/pages/dictionary/autocomplete_cache";

import { callApi } from "@/web/utils/rpc/client_rpc";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

afterEach(() => {
  mockCallApi.mockReset();
});

function setApiResult(result: string[] | Error) {
  if (result instanceof Error) {
    mockCallApi.mockRejectedValue(result);
  } else {
    mockCallApi.mockImplementation((_, prefix) =>
      Promise.resolve(result.filter((word) => word.startsWith(prefix)))
    );
  }
}

const WORD_LIST = ["ab", "abago", "insunt", "jam"];

describe("AutocompleteCache", () => {
  test("get returns singleton", () => {
    expect(AutocompleteCache.get()).toBe(AutocompleteCache.get());
  });

  it("returns empty list on fetch error", async () => {
    setApiResult(new Error(""));
    const result = await new AutocompleteCache().getOptions("a");
    expect(result).toHaveLength(0);
  });

  it("returns empty list on empty input", async () => {
    setApiResult(WORD_LIST);

    const result = await new AutocompleteCache().getOptions("");

    expect(result).toHaveLength(0);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("returns results on request", async () => {
    setApiResult(WORD_LIST);

    const result = await new AutocompleteCache().getOptions("a");

    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("avoids duplication on bunched requests", async () => {
    setApiResult(WORD_LIST);
    const cache = new AutocompleteCache();

    const aPromise = cache.getOptions("a");
    const abPromise = cache.getOptions("ab");
    const abaPromise = cache.getOptions("aba");
    await Promise.all([aPromise, abPromise, abaPromise]);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(aPromise).resolves.toStrictEqual(["ab", "abago"]);
    expect(abPromise).resolves.toStrictEqual(["ab", "abago"]);
    expect(abaPromise).resolves.toStrictEqual(["abago"]);
  });

  it("caches results on subsequent requests", async () => {
    setApiResult(WORD_LIST);
    const cache = new AutocompleteCache();

    await cache.getOptions("a");
    mockCallApi.mockClear();

    const result = await cache.getOptions("a");
    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("does not cache response not ok", async () => {
    setApiResult(new Error());
    const cache = new AutocompleteCache();
    await cache.getOptions("a");

    mockCallApi.mockClear();
    setApiResult(WORD_LIST);
    const result = await cache.getOptions("a");

    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns expected substrings", async () => {
    setApiResult(WORD_LIST);

    const result = await new AutocompleteCache().getOptions("aba");

    expect(result).toStrictEqual(["abago"]);
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("fetches alternate character completions", async () => {
    setApiResult(WORD_LIST);

    await new AutocompleteCache().getOptions("i");

    const calls = mockCallApi.mock.calls.map((call) => call[1]);
    expect(calls).toHaveLength(2);
    expect(calls[0].endsWith("/i"));
    expect(calls[1].endsWith("/j"));
  });

  it("displays correct options with special start character", async () => {
    setApiResult(WORD_LIST);
    const result = await new AutocompleteCache().getOptions("i");
    expect(result).toStrictEqual(["insunt", "jam"]);
  });

  it("displays correct options with internal character", async () => {
    setApiResult(WORD_LIST);
    const result = await new AutocompleteCache().getOptions("insv");
    expect(result).toStrictEqual(["insunt"]);
  });
});
