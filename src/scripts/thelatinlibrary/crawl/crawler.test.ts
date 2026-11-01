import fs from "fs";
import os from "os";
import path from "path";
import {
  crawlLatinLibrary,
  RateLimitedFetcher,
  resolveInternalHtmlLink,
  USER_AGENT,
} from "@/scripts/thelatinlibrary/crawl/crawler";

describe("crawler", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("enforces a 2,000 ms minimum delay between requests using Jest fake timers", async () => {
    jest.useFakeTimers();
    const calls: string[] = [];
    const mockFetch = jest.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response("<html><body><p>ok</p></body></html>", {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const fetcher = new RateLimitedFetcher(2000, mockFetch);

    // First request fires immediately.
    const p1 = fetcher.fetch("https://www.thelatinlibrary.com/index.html");
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    await p1;

    // Second request must wait 2,000 ms before firing.
    let secondDone = false;
    const p2 = fetcher
      .fetch("https://www.thelatinlibrary.com/christian.html")
      .then(() => {
        secondDone = true;
      });

    jest.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(secondDone).toBe(false);

    jest.advanceTimersByTime(1);
    await p2;
    expect(calls).toHaveLength(2);
    expect(secondDone).toBe(true);
  });

  it("sends the MorcusNet User-Agent header containing https://morcus.net on every request", async () => {
    const receivedHeaders: Record<string, string>[] = [];
    const mockFetch = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        receivedHeaders.push((init?.headers as Record<string, string>) ?? {});
        return new Response("<html><body><p>ok</p></body></html>", {
          status: 200,
        });
      }
    ) as unknown as typeof fetch;

    const fetcher = new RateLimitedFetcher(0, mockFetch);
    await fetcher.fetch("https://www.thelatinlibrary.com/index.html");
    await fetcher.fetch("https://www.thelatinlibrary.com/misc.html");

    expect(receivedHeaders).toHaveLength(2);
    for (const h of receivedHeaders) {
      expect(h["User-Agent"]).toBe(USER_AGENT);
      expect(h["User-Agent"]).toContain("https://morcus.net");
    }
  });

  it("does not overwrite retrieved in .meta.json when SHA-256 is unchanged on --refresh", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-crawl-test-"));
    try {
      const htmlBytes = Buffer.from(
        "<html><body><h1>Test</h1><p>Gallia est omnis divisa.</p></body></html>",
        "utf8"
      );
      const rawFile = path.join(tmpRoot, "raw", "test.html");
      fs.mkdirSync(path.dirname(rawFile), { recursive: true });
      fs.writeFileSync(rawFile, htmlBytes);

      const { computeSha256 } = await import(
        "@/scripts/thelatinlibrary/crawl/crawler"
      );
      const sha256 = computeSha256(htmlBytes);
      const originalDate = "2025-01-15";
      fs.writeFileSync(
        `${rawFile}.meta.json`,
        JSON.stringify(
          {
            url: "https://www.thelatinlibrary.com/test.html",
            retrieved: originalDate,
            sha256,
          },
          null,
          2
        ) + "\n"
      );

      const mockFetch = jest.fn(async () => {
        return new Response(htmlBytes, { status: 200 });
      }) as unknown as typeof fetch;

      const summary = await crawlLatinLibrary({
        rootDir: tmpRoot,
        seedPaths: ["test.html"],
        refresh: true,
        delayMs: 0,
        fetchFn: mockFetch,
      });

      expect(summary.unchangedCount).toBe(1);
      const metaAfter = JSON.parse(
        fs.readFileSync(`${rawFile}.meta.json`, "utf8")
      );
      expect(metaAfter.retrieved).toBe(originalDate);
      expect(metaAfter.sha256).toBe(sha256);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("preserves raw ISO-8859-1 bytes verbatim and records dead links in failedPaths", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-crawl-latin1-"));
    try {
      // ISO-8859-1 bytes for "é" (0xe9) and "à" (0xe0)
      const latin1Html = Buffer.from(
        '<html><body><p>Caf\xe9 \xe0 Paris</p><a href="missing.html">dead</a></body></html>',
        "latin1"
      );
      const mockFetch = jest.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("latin1.html")) {
          return new Response(latin1Html, { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      }) as unknown as typeof fetch;

      const summary = await crawlLatinLibrary({
        rootDir: tmpRoot,
        seedPaths: ["latin1.html"],
        delayMs: 0,
        fetchFn: mockFetch,
      });

      expect(summary.fetchedCount).toBe(1);
      expect(summary.failedCount).toBe(1);
      expect(summary.failedPaths["missing.html"]).toBe("HTTP 404");

      const savedBytes = fs.readFileSync(
        path.join(tmpRoot, "raw", "latin1.html")
      );
      expect(Buffer.compare(savedBytes, latin1Html)).toBe(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("normalizes internal links and ignores external links", () => {
    expect(resolveInternalHtmlLink("justin/1.html", "2.html#sec1")).toBe(
      "justin/2.html"
    );
    expect(resolveInternalHtmlLink("justin/1.html", "../index.html")).toBe(
      "index.html"
    );
    expect(
      resolveInternalHtmlLink(
        "index.html",
        "https://www.thelatinlibrary.com/vergil/aen1.shtml"
      )
    ).toBe("vergil/aen1.shtml");
    expect(
      resolveInternalHtmlLink("index.html", "https://example.com/foo.html")
    ).toBeNull();
    expect(
      resolveInternalHtmlLink("index.html", "mailto:foo@bar.com")
    ).toBeNull();
  });
});
