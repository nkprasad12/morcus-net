/**
 * @jest-environment jsdom
 */

import { callApi } from "@/web/utils/rpc/client_rpc";
import { FusedAutocompleteFetcher } from "./fused_autocomplete_fetcher";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

afterEach(() => {
  mockCallApi.mockReset();
});

function setApiResult(result: Record<string, string[]> | Error) {
  if (result instanceof Error) {
    mockCallApi.mockRejectedValue(result);
  } else {
    mockCallApi.mockImplementation((_, request) => {
      const prefix = request.query;
      const finalResult: Record<string, string[]> = {};
      for (const dict in result) {
        finalResult[dict] = result[dict].filter((w) => w.startsWith(prefix));
      }
      return Promise.resolve(finalResult);
    });
  }
}

const LS_LIST = ["ab", "abago", "insunt", "jam"];
const SH_LIST = ["away", "now", "inside"];
const ALL_DICTS = { LS: LS_LIST, SH: SH_LIST };

describe("FusedAutoCompleteFetcher", () => {
  test("get returns singleton", () => {
    expect(FusedAutocompleteFetcher.get()).toBe(FusedAutocompleteFetcher.get());
  });

  it("returns empty list on fetch error", async () => {
    setApiResult(new Error(""));
    const request = { query: "a", dicts: ["LS"] };

    const result = await new FusedAutocompleteFetcher().getOptions(request);

    expect(result).toEqual({ LS: [] });
  });

  it("rejects on empty input", async () => {
    setApiResult(ALL_DICTS);
    const request = { query: "", dicts: ["LS"] };

    const result = new FusedAutocompleteFetcher().getOptions(request);

    expect(result).rejects.toThrow();
  });

  it("rejects on too long input", async () => {
    setApiResult(ALL_DICTS);
    const request = { query: "ab", dicts: ["LS"] };

    const result = new FusedAutocompleteFetcher().getOptions(request);

    expect(result).rejects.toThrow();
  });

  it("returns single results on request", async () => {
    setApiResult(ALL_DICTS);
    const request = { query: "a", dicts: ["LS"] };

    const result = await new FusedAutocompleteFetcher().getOptions(request);

    expect(result).toEqual({ LS: ["ab", "abago"] });
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns unknown dict results on request", async () => {
    setApiResult(ALL_DICTS);
    const request = { query: "a", dicts: ["FC"] };

    const result = await new FusedAutocompleteFetcher().getOptions(request);

    expect(result).toEqual({ FC: [] });
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns all requested results on request", async () => {
    setApiResult(ALL_DICTS);
    const request = { query: "a", dicts: ["LS", "SH"] };

    const result = await new FusedAutocompleteFetcher().getOptions(request);

    expect(result).toEqual({ LS: ["ab", "abago"], SH: ["away"] });
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("avoids duplication on bunched requests", async () => {
    setApiResult(ALL_DICTS);
    const cache = new FusedAutocompleteFetcher();

    const aPromise = cache.getOptions({ query: "a", dicts: ["LS"] });
    const a2Promise = cache.getOptions({ query: "a", dicts: ["LS"] });
    const a3Promise = cache.getOptions({ query: "a", dicts: ["LS"] });
    await Promise.all([aPromise, a2Promise, a3Promise]);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(aPromise).resolves.toEqual({ LS: ["ab", "abago"] });
    expect(a2Promise).resolves.toEqual({ LS: ["ab", "abago"] });
    expect(a3Promise).resolves.toEqual({ LS: ["ab", "abago"] });
  });

  it("caches results on subsequent requests", async () => {
    setApiResult(ALL_DICTS);
    const cache = new FusedAutocompleteFetcher();

    await cache.getOptions({ query: "a", dicts: ["LS"] });
    mockCallApi.mockClear();

    const result = await cache.getOptions({ query: "a", dicts: ["LS"] });
    expect(result).toEqual({ LS: ["ab", "abago"] });
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("does not cache response not ok", async () => {
    setApiResult(new Error());
    const cache = new FusedAutocompleteFetcher();
    await cache.getOptions({ query: "a", dicts: ["LS"] });

    mockCallApi.mockClear();
    setApiResult(ALL_DICTS);
    const result = await cache.getOptions({ query: "a", dicts: ["LS"] });

    expect(result).toEqual({ LS: ["ab", "abago"] });
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("only requests missing data", async () => {
    setApiResult(ALL_DICTS);
    const cache = new FusedAutocompleteFetcher();
    await cache.getOptions({ query: "a", dicts: ["LS"] });

    mockCallApi.mockClear();
    const result = await cache.getOptions({ query: "a", dicts: ["LS", "SH"] });

    expect(result).toEqual({ LS: ["ab", "abago"], SH: ["away"] });
    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toEqual({ query: "a", dicts: ["SH"] });
  });
});
