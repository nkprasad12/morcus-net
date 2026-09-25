import { FetchLimitError, UnsafeUrlError } from "@/web/scraping/safe_fetch";
import {
  ScrapeCache,
  describeScrapeFailure,
  scrapeCacheKey,
} from "@/web/v2/external/external_scrape.server";

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (err: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("scrapeCacheKey", () => {
  test("treats a missing scheme and a fragment as the same import", () => {
    expect(scrapeCacheKey("example.com/a#x")).toBe("https://example.com/a");
    expect(scrapeCacheKey(" https://example.com/a ")).toBe(
      "https://example.com/a"
    );
  });

  test("keeps unparseable input as-is rather than throwing", () => {
    expect(() => scrapeCacheKey("http://[bad")).not.toThrow();
  });
});

describe("ScrapeCache", () => {
  test("serves repeat requests from the cache until the TTL passes", async () => {
    let now = 0;
    const scrape = jest.fn(async (url: string) => `text of ${url}`);
    const cache = new ScrapeCache({ scrape, ttlMs: 1000, now: () => now });

    expect(await cache.get("example.com/a")).toBe("text of example.com/a");
    now = 999;
    expect(await cache.get("https://example.com/a")).toBe(
      "text of example.com/a"
    );
    expect(scrape).toHaveBeenCalledTimes(1);

    now = 1000;
    await cache.get("example.com/a");
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  test("shares one fetch between concurrent requests", async () => {
    const pending = deferred<string>();
    const scrape = jest.fn(() => pending.promise);
    const cache = new ScrapeCache({ scrape });

    const a = cache.get("example.com/a");
    const b = cache.get("example.com/a");
    pending.resolve("shared");

    expect(await a).toBe("shared");
    expect(await b).toBe("shared");
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  test("does not cache failures", async () => {
    const scrape = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValueOnce("ok");
    const cache = new ScrapeCache({ scrape });

    await expect(cache.get("example.com/a")).rejects.toThrow("flaky");
    expect(await cache.get("example.com/a")).toBe("ok");
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  test("evicts the least recently used entry beyond the limit", async () => {
    const scrape = jest.fn(async (url: string) => url);
    const cache = new ScrapeCache({ scrape, maxEntries: 2 });

    await cache.get("example.com/a");
    await cache.get("example.com/b");
    await cache.get("example.com/a"); // a is now the most recent
    await cache.get("example.com/c"); // evicts b
    expect(cache.size).toBe(2);

    scrape.mockClear();
    await cache.get("example.com/a");
    expect(scrape).not.toHaveBeenCalled();
    await cache.get("example.com/b");
    expect(scrape).toHaveBeenCalledTimes(1);
  });
});

describe("describeScrapeFailure", () => {
  test("shows the fetch guard's own messages", () => {
    expect(
      describeScrapeFailure(
        new UnsafeUrlError("Local addresses are not allowed")
      )
    ).toEqual({
      status: 400,
      message:
        "That address can't be imported. Local addresses are not allowed.",
    });
    expect(
      describeScrapeFailure(new FetchLimitError("Page is too large")).status
    ).toBe(502);
  });

  test("explains unreachable hosts", () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND x"), {
      code: "ENOTFOUND",
    });
    expect(describeScrapeFailure(err)).toEqual({
      status: 502,
      message: "Couldn't reach that site. Check the address and try again.",
    });
  });

  test("never echoes internal error messages", () => {
    const failure = describeScrapeFailure(
      new Error("Assertion failed at /srv/app/scraper.ts:42")
    );
    expect(failure.status).toBe(422);
    expect(failure.message).not.toContain("scraper.ts");
  });
});
