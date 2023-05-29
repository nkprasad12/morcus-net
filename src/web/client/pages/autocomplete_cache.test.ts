/**
 * @jest-environment jsdom
 */

import { AutocompleteCache } from "./autocomplete_cache";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

function replaceFetch(
  ok: boolean = true,
  error: boolean = false,
  options: string[] = ["ab", "abago", "insunt", "jam"]
) {
  const mockFetch = error
    ? jest.fn((_) => Promise.reject())
    : jest.fn((request: string) => {
        const parts = request.split("/");
        return Promise.resolve({
          text: () =>
            Promise.resolve(
              JSON.stringify(
                options.filter((option) =>
                  option.startsWith(parts[parts.length - 1])
                )
              )
            ),
          ok: ok,
          request: request,
        });
      });
  // @ts-ignore
  global.fetch = mockFetch;
  return mockFetch;
}

describe("AutocompleteCache", () => {
  test("get returns singleton", () => {
    expect(AutocompleteCache.get()).toBe(AutocompleteCache.get());
  });

  it("returns empty list on fetch error", async () => {
    replaceFetch(false, true);
    const result = await new AutocompleteCache().getOptions("a");
    expect(result).toHaveLength(0);
  });

  it("returns empty list on response not ok", async () => {
    const mockFetch = replaceFetch(false, false);

    const result = await new AutocompleteCache().getOptions("a");

    expect(result).toHaveLength(0);
    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it("returns empty list on empty input", async () => {
    const mockFetch = replaceFetch();

    const result = await new AutocompleteCache().getOptions("");

    expect(result).toHaveLength(0);
    expect(mockFetch.mock.calls).toHaveLength(0);
  });

  it("returns results on request", async () => {
    const mockFetch = replaceFetch();

    const result = await new AutocompleteCache().getOptions("a");

    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it("caches results on subsequent requests", async () => {
    const mockFetch = replaceFetch();
    const cache = new AutocompleteCache();

    await cache.getOptions("a");
    mockFetch.mockClear();

    const result = await cache.getOptions("a");
    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockFetch.mock.calls).toHaveLength(0);
  });

  it("does not cache response not ok", async () => {
    replaceFetch(false, false);
    const cache = new AutocompleteCache();
    await cache.getOptions("a");

    const mockFetch = replaceFetch();
    const result = await cache.getOptions("a");

    expect(result).toStrictEqual(["ab", "abago"]);
    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it("returns expected substrings", async () => {
    const mockFetch = replaceFetch();

    const result = await new AutocompleteCache().getOptions("aba");

    expect(result).toStrictEqual(["abago"]);
    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it("fetches alternate character completions", async () => {
    const mockFetch = replaceFetch();

    await new AutocompleteCache().getOptions("i");

    const calls = mockFetch.mock.calls.map((call) => call[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0].endsWith("/i"));
    expect(calls[1].endsWith("/j"));
  });

  it("displays correct options with special start character", async () => {
    replaceFetch();
    const result = await new AutocompleteCache().getOptions("i");
    expect(result).toStrictEqual(["insunt", "jam"]);
  });

  it("displays correct options with internal character", async () => {
    replaceFetch();
    const result = await new AutocompleteCache().getOptions("insv");
    expect(result).toStrictEqual(["insunt"]);
  });
});
