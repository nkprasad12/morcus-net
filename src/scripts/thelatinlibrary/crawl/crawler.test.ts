import fs from "fs";
import os from "os";
import path from "path";
import {
  buildManifestFromRaw,
  charsetOfContentType,
  computeSha256,
  crawlLatinLibrary,
  isAllowedByRobots,
  parseRetryAfterMs,
  parseRobotsTxt,
  RateLimitedFetcher,
  repairRawSidecars,
  resolveInternalHtmlLink,
  USER_AGENT,
} from "@/scripts/thelatinlibrary/crawl/crawler";

const HTML_HEADERS = { "content-type": "text/html" };

function makeTmpRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeRawPage(
  root: string,
  page: string,
  html: string,
  meta?: Record<string, string>
): Buffer {
  const bytes = Buffer.from(html, "utf8");
  const file = path.join(root, "raw", page);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  if (meta !== undefined) {
    fs.writeFileSync(
      `${file}.meta.json`,
      JSON.stringify({ sha256: computeSha256(bytes), ...meta })
    );
  }
  return bytes;
}

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

      const { summary } = await crawlLatinLibrary({
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

      const { summary } = await crawlLatinLibrary({
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
  it("retries pages that failed in an earlier run when resuming", async () => {
    const root = makeTmpRoot("ll-crawl-resume-");
    try {
      let healthy = false;
      const mockFetch = jest.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("robots.txt")) return new Response("", { status: 404 });
        if (!healthy) return new Response("down", { status: 500 });
        return new Response("<html><body><p>ok</p></body></html>", {
          status: 200,
          headers: HTML_HEADERS,
        });
      }) as unknown as typeof fetch;

      const first = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: ["a.html"],
        delayMs: 0,
        fetchFn: mockFetch,
      });
      expect(first.summary.failedPaths).toEqual({ "a.html": "HTTP 500" });

      healthy = true;
      const second = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: [],
        delayMs: 0,
        fetchFn: mockFetch,
      });
      expect(second.summary.fetchedCount).toBe(1);
      expect(second.summary.failedPaths).toEqual({});
      expect(fs.existsSync(path.join(root, "raw", "a.html"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("waits for Retry-After on 429 and then retries", async () => {
    const root = makeTmpRoot("ll-crawl-429-");
    try {
      let calls = 0;
      const mockFetch = jest.fn(async (url: string | URL | Request) => {
        if (String(url).endsWith("robots.txt")) {
          return new Response("", { status: 404 });
        }
        calls++;
        return calls === 1
          ? new Response("slow down", {
              status: 429,
              headers: { "retry-after": "7" },
            })
          : new Response("<html><body>ok</body></html>", {
              status: 200,
              headers: HTML_HEADERS,
            });
      }) as unknown as typeof fetch;
      const sleeps: number[] = [];

      const { summary } = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: ["a.html"],
        delayMs: 0,
        fetchFn: mockFetch,
        sleepFn: async (ms) => {
          sleeps.push(ms);
        },
      });
      expect(sleeps).toEqual([7000]);
      expect(summary.fetchedCount).toBe(1);
      expect(summary.failedCount).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips pages disallowed by robots.txt", async () => {
    const root = makeTmpRoot("ll-crawl-robots-");
    try {
      const fetched: string[] = [];
      const mockFetch = jest.fn(async (url: string | URL | Request) => {
        const u = String(url);
        fetched.push(u);
        if (u.endsWith("robots.txt")) {
          return new Response("User-agent: *\nDisallow: /private/\n", {
            status: 200,
          });
        }
        return new Response("<html><body>ok</body></html>", {
          status: 200,
          headers: HTML_HEADERS,
        });
      }) as unknown as typeof fetch;

      const { summary } = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: ["private/x.html", "public.html"],
        delayMs: 0,
        fetchFn: mockFetch,
      });
      expect(summary.robotsDisallowed).toEqual(["private/x.html"]);
      expect(fetched.some((u) => u.includes("private"))).toBe(false);
      expect(summary.fetchedCount).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects off-site redirects, non-HTML responses and oversized bodies, and records the HTTP charset", async () => {
    const root = makeTmpRoot("ll-crawl-checks-");
    try {
      const mockFetch = jest.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.endsWith("robots.txt")) return new Response("", { status: 404 });
        if (u.endsWith("moved.html")) {
          const r = new Response("<html></html>", {
            status: 200,
            headers: HTML_HEADERS,
          });
          Object.defineProperty(r, "redirected", { value: true });
          Object.defineProperty(r, "url", {
            value: "https://example.com/elsewhere.html",
          });
          return r;
        }
        if (u.endsWith("image.html")) {
          return new Response("PNG", {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }
        if (u.endsWith("huge.html")) {
          return new Response("x", {
            status: 200,
            headers: { ...HTML_HEADERS, "content-length": "999999999" },
          });
        }
        return new Response(Buffer.from("<p>Caf\xe9</p>", "latin1"), {
          status: 200,
          headers: { "content-type": "text/html; charset=ISO-8859-1" },
        });
      }) as unknown as typeof fetch;

      const { summary } = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: ["moved.html", "image.html", "huge.html", "latin.html"],
        delayMs: 0,
        fetchFn: mockFetch,
      });
      expect(summary.failedPaths["moved.html"]).toContain("off-site");
      expect(summary.failedPaths["image.html"]).toContain("image/png");
      expect(summary.failedPaths["huge.html"]).toContain("too large");
      const meta = JSON.parse(
        fs.readFileSync(path.join(root, "raw", "latin.html.meta.json"), "utf8")
      );
      expect(meta.httpCharset).toBe("iso-8859-1");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("records hub and author pages, and rebuilds them offline from raw/", async () => {
    const root = makeTmpRoot("ll-crawl-offline-");
    try {
      const meta = { url: "u", retrieved: "2026-01-01" };
      writeRawPage(root, "index.html", '<a href="medieval.html">M</a>', meta);
      writeRawPage(root, "medieval.html", '<a href="abbo.html">Abbo</a>', meta);
      writeRawPage(root, "abbo.html", '<a href="abbo/1.html">I</a>', meta);
      writeRawPage(root, "abbo/1.html", "<p>Textus</p>", meta);
      const fetchFn = jest.fn() as unknown as typeof fetch;

      const { summary, links } = await crawlLatinLibrary({
        rootDir: root,
        seedPaths: ["index.html", "medieval.html"],
        offline: true,
        fetchFn,
      });
      expect(fetchFn).not.toHaveBeenCalled();
      expect(summary.skippedCount).toBe(4);
      expect(links.hubPage.get("abbo.html")).toBe("medieval.html");
      expect(links.authorPage.get("abbo/1.html")).toBe("abbo.html");
      expect(links.authorPage.has("abbo.html")).toBe(false);
      expect(fs.existsSync(path.join(root, ".crawl_state.json"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds the manifest without writing sidecars or inventing dates", () => {
    const root = makeTmpRoot("ll-manifest-pure-");
    try {
      writeRawPage(root, "good.html", "<h1>Good</h1>", {
        url: "https://www.thelatinlibrary.com/good.html",
        retrieved: "2025-05-05",
      });
      writeRawPage(root, "nometa.html", "<p>x</p>");
      const before = fs.readdirSync(path.join(root, "raw")).sort();

      const { manifest, sidecarProblems } = buildManifestFromRaw(root, {
        previous: { "good.html": { checks: ["kept"] } as never },
      });
      expect(fs.readdirSync(path.join(root, "raw")).sort()).toEqual(before);
      expect(Object.keys(manifest)).toEqual(["good.html"]);
      expect(manifest["good.html"].retrieved).toBe("2025-05-05");
      expect(manifest["good.html"].title).toBe("Good");
      expect(manifest["good.html"].checks).toEqual(["kept"]);
      expect(sidecarProblems).toEqual([
        { page: "nometa.html", problem: "missing" },
      ]);

      expect(repairRawSidecars(root).unrepaired).toEqual(sidecarProblems);
      const { repaired } = repairRawSidecars(root, {
        retrievedForMissing: "2026-02-02",
      });
      expect(repaired).toEqual(sidecarProblems);
      expect(buildManifestFromRaw(root).manifest["nometa.html"].retrieved).toBe(
        "2026-02-02"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses robots.txt, Retry-After and Content-Type charsets", () => {
    const rules = parseRobotsTxt(
      "User-agent: other\nDisallow: /\n\nUser-agent: *\nDisallow: /a/\nAllow: /a/ok.html\nCrawl-delay: 5\n"
    );
    expect(rules.crawlDelayMs).toBe(5000);
    expect(isAllowedByRobots(rules, "a/no.html")).toBe(false);
    expect(isAllowedByRobots(rules, "a/ok.html")).toBe(true);
    expect(isAllowedByRobots(rules, "b.html")).toBe(true);

    expect(parseRetryAfterMs("12")).toBe(12000);
    expect(
      parseRetryAfterMs(
        "Wed, 21 Oct 2015 07:28:10 GMT",
        Date.UTC(2015, 9, 21, 7, 28, 0)
      )
    ).toBe(10000);
    expect(parseRetryAfterMs(null)).toBeUndefined();

    expect(charsetOfContentType('text/html; charset="UTF-8"')).toBe("utf-8");
    expect(charsetOfContentType("text/html")).toBeUndefined();
  });
});
