import { KeyedFetchCache } from "@/web/v2/core/nav/keyed_fetch_cache.client";

describe("KeyedFetchCache", () => {
  test("stores and retrieves entries synchronously, including null values", () => {
    const cache = new KeyedFetchCache<string | null>({
      fetch: async () => "loaded",
    });

    expect(cache.has("a")).toBe(false);
    expect(cache.get("a")).toBeUndefined();

    cache.set("a", "alpha");
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe("alpha");

    cache.set("nil", null);
    expect(cache.has("nil")).toBe(true);
    expect(cache.get("nil")).toBeNull();
  });

  test("evicts least-recently-used entry when maxEntries is reached", () => {
    const cache = new KeyedFetchCache<string>({
      fetch: async (k) => k,
      maxEntries: 3,
    });

    cache.set("aa", "1");
    cache.set("bb", "2");
    cache.set("cc", "3");

    // Touch "aa" to mark it as recently used
    expect(cache.get("aa")).toBe("1");

    // Adding "dd" should evict "bb" (oldest unused)
    cache.set("dd", "4");
    expect(cache.has("bb")).toBe(false);
    expect(cache.has("aa")).toBe(true);
    expect(cache.has("cc")).toBe(true);
    expect(cache.has("dd")).toBe(true);

    // Updating an existing key refreshes its LRU position without evicting
    cache.set("aa", "1-updated");
    cache.set("ee", "5");
    expect(cache.has("cc")).toBe(false);
    expect(cache.get("aa")).toBe("1-updated");
  });

  test("load() fetches on miss, caches resolved value, and hits memory on repeat", async () => {
    const fetchFn = jest.fn(async (key: string, version: string) => {
      return `${key}@${version}`;
    });
    const cache = new KeyedFetchCache<string, string>({ fetch: fetchFn });

    const first = await cache.load("am", "v1");
    expect(first).toBe("am@v1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("am", "v1");
    expect(cache.has("am")).toBe(true);

    const second = await cache.load("am", "v1");
    expect(second).toBe("am@v1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("coalesces concurrent in-flight requests for the same key", async () => {
    let resolveFetch!: (val: string) => void;
    const fetchFn = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const cache = new KeyedFetchCache<string>({ fetch: fetchFn });

    const p1 = cache.load("co");
    const p2 = cache.load("co");

    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFetch("coactio");
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBe("coactio");
    expect(res2).toBe("coactio");
    expect(cache.has("co")).toBe(true);
  });

  test("does not cache rejected fetches and allows subsequent retry", async () => {
    let attempts = 0;
    const fetchFn = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network down");
      return "recovered";
    });
    const cache = new KeyedFetchCache<string>({ fetch: fetchFn });

    await expect(cache.load("err")).rejects.toThrow("network down");
    expect(cache.has("err")).toBe(false);

    await expect(cache.load("err")).resolves.toBe("recovered");
    expect(cache.has("err")).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("caches null when loader catches and resolves null (negative caching)", async () => {
    const fetchFn = jest.fn(async (): Promise<string[] | null> => null);
    const cache = new KeyedFetchCache<string[] | null>({ fetch: fetchFn });

    await expect(cache.load("x")).resolves.toBeNull();
    expect(cache.has("x")).toBe(true);

    // Second load hits cached null without re-fetching
    await expect(cache.load("x")).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
