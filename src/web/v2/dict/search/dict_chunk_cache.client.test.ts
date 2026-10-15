/**
 * @jest-environment jsdom
 */
import { createDictChunkCache } from "@/web/v2/dict/search/dict_chunk_cache.client";

describe("createDictChunkCache", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("fetches /api/completions?prefix=... and caches the chunk on success", async () => {
    const cache = createDictChunkCache();
    const mockResponse = {
      "L&S": ["amabilis", "amator"],
      GAF: ["ămābĭlis", "ămātŏr"],
    };

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as unknown as Response);
    global.fetch = fetchMock;

    const data1 = await cache.load("am");
    expect(data1).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/completions?prefix=am");
    expect(cache.has("am")).toBe(true);

    const data2 = await cache.load("am");
    expect(data2).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("fetches the build-versioned URL when the page has a version", async () => {
    document.documentElement.dataset.version = "abc123";
    try {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response);
      global.fetch = fetchMock;

      await createDictChunkCache().load("am");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/completions?prefix=am&v=abc123"
      );
    } finally {
      delete document.documentElement.dataset.version;
    }
  });

  test("rejects on network or HTTP error without caching the failure", async () => {
    const cache = createDictChunkCache();

    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));
    await expect(cache.load("err")).rejects.toThrow("Network failure");
    expect(cache.has("err")).toBe(false);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    await expect(cache.load("bad")).rejects.toThrow("HTTP 500");
    expect(cache.has("bad")).toBe(false);
  });
});
