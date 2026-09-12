/**
 * @jest-environment jsdom
 */
import { DictChunkCache } from "@/web/v2/dict/dict_chunk_cache.client";

describe("DictChunkCache", () => {
  let cache: DictChunkCache;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    cache = new DictChunkCache(3); // Small capacity for LRU tests
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cache.clear();
  });

  test("stores and retrieves chunks synchronously", () => {
    expect(cache.hasPrefix("am")).toBe(false);
    expect(cache.getChunks("am")).toBeUndefined();

    const sampleChunks = { "L&S": ["amabilis", "amator"] };
    cache.setChunks("am", sampleChunks);

    expect(cache.hasPrefix("am")).toBe(true);
    expect(cache.hasPrefix("AM")).toBe(true); // Case-insensitive
    expect(cache.getChunks("am")).toEqual(sampleChunks);
    expect(cache.size).toBe(1);
  });

  test("evicts least recently used prefix when max capacity is reached", () => {
    cache.setChunks("aa", { "L&S": ["aa"] });
    cache.setChunks("bb", { "L&S": ["bb"] });
    cache.setChunks("cc", { "L&S": ["cc"] });

    expect(cache.size).toBe(3);

    // Access "aa" to mark it as recently used
    expect(cache.getChunks("aa")).toBeDefined();

    // Adding "dd" should evict "bb" (the oldest unused)
    cache.setChunks("dd", { "L&S": ["dd"] });

    expect(cache.hasPrefix("bb")).toBe(false);
    expect(cache.hasPrefix("aa")).toBe(true);
    expect(cache.hasPrefix("cc")).toBe(true);
    expect(cache.hasPrefix("dd")).toBe(true);
  });

  test("loadPrefix fetches chunk and caches it on success", async () => {
    const mockResponse = {
      "L&S": ["amabilis", "amator"],
      GAF: ["ămābĭlis", "ămātŏr"],
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);
    global.fetch = fetchMock;

    const data1 = await cache.loadPrefix("am");
    expect(data1).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/v2/api/completions?prefix=am");
    expect(cache.hasPrefix("am")).toBe(true);

    // Second call should return directly from memory without invoking fetch again
    const data2 = await cache.loadPrefix("am");
    expect(data2).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("coalesces concurrent in-flight requests for the same prefix", async () => {
    let resolveFetch: (val: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = jest.fn().mockReturnValue(pendingPromise);
    global.fetch = fetchMock;

    // Trigger two calls concurrently before the first one resolves
    const p1 = cache.loadPrefix("co");
    const p2 = cache.loadPrefix("co");

    expect(cache.inFlightCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Resolve network request
    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ "L&S": ["coactio"] }),
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toEqual({ "L&S": ["coactio"] });
    expect(res2).toEqual({ "L&S": ["coactio"] });
    expect(cache.inFlightCount).toBe(0);
    expect(cache.hasPrefix("co")).toBe(true);
  });

  test("handles fetch failure gracefully without leaving in-flight state", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("Network failure"));
    global.fetch = fetchMock;

    const res = await cache.loadPrefix("err");
    expect(res).toEqual({});
    expect(cache.inFlightCount).toBe(0);
    expect(cache.hasPrefix("err")).toBe(false);
  });

  test("handles non-ok HTTP responses gracefully", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    global.fetch = fetchMock;

    const res = await cache.loadPrefix("bad");
    expect(res).toEqual({});
    expect(cache.inFlightCount).toBe(0);
    expect(cache.hasPrefix("bad")).toBe(false);
  });

  test("clear resets memory cache and in-flight tracking", () => {
    cache.setChunks("am", { "L&S": ["am"] });
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hasPrefix("am")).toBe(false);
    expect(cache.inFlightCount).toBe(0);
  });
});
