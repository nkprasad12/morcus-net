import zlib from "zlib";
import express from "express";
import request from "supertest";
import type { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import type { StaticPageLookup } from "@/web/ui/core/server/static_pages.server";
import { compressStaticPage } from "@/web/ui/core/server/static_pages.server";
import {
  createDictRoutes,
  defaultDictLandingState,
  dictLandingPageKey,
  renderDictLandingPage,
  withDictLandingOverrides,
} from "@/web/ui/dict/dict_routes.server";
import { renderDictPageHtml } from "@/web/ui/dict/dict_page.server";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  DEFAULT_LATEST_POST_URL,
  LatestPostPoller,
  WHATS_NEW_MAX_AGE_DAYS,
  isRecentPost,
  isValidIsoDate,
  latestPostFromEnv,
  parseLatestPost,
  type LatestPost,
  type LatestPostSource,
} from "@/web/ui/whats_new/whats_new.server";

const POST_JSON: LatestPost = {
  date: "2026-10-25",
  description: "A redesigned site.",
  url: "https://updates.morcus.net/2026/10/25/New-Release.html",
};

describe("isValidIsoDate", () => {
  test("accepts valid YYYY-MM-DD calendar dates", () => {
    expect(isValidIsoDate("2026-10-25")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  test("rejects non-ISO strings, rollover dates, and CSS breakout payloads", () => {
    expect(isValidIsoDate("Oct 25, 2026")).toBe(false);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate('2026-10-25"] { color: red } /*')).toBe(false);
  });
});

describe("parseLatestPost", () => {
  test("accepts the blog's latest.json shape", () => {
    expect(
      parseLatestPost({
        date: "2026-10-25",
        description: "A redesigned site.",
        url: "https://updates.morcus.net/2026/10/25/New-Release.html",
      })
    ).toEqual(POST_JSON);
  });

  test("drops a missing, blank or non-string description", () => {
    const expected = { date: POST_JSON.date, url: POST_JSON.url };
    expect(
      parseLatestPost({ date: POST_JSON.date, url: POST_JSON.url })
    ).toEqual(expected);
    expect(
      parseLatestPost({
        date: POST_JSON.date,
        url: POST_JSON.url,
        description: "  ",
      })
    ).toEqual(expected);
    expect(
      parseLatestPost({
        date: POST_JSON.date,
        url: POST_JSON.url,
        description: null,
      })
    ).toEqual(expected);
  });

  test("normalizes whitespace and caps the description's length", () => {
    const parsed = parseLatestPost({
      date: POST_JSON.date,
      url: POST_JSON.url,
      description: ` One\n  line ${"x".repeat(300)}`,
    });
    expect(parsed?.description?.startsWith("One line x")).toBe(true);
    expect(parsed?.description).toHaveLength(200);
    expect(parsed?.description?.endsWith("…")).toBe(true);
  });

  test.each([
    ["not an object", "2026-10-25"],
    ["null", null],
    ["a missing date", { url: POST_JSON.url }],
    ["a non-ISO date", { date: "Oct 25, 2026", url: POST_JSON.url }],
    ["an impossible date", { date: "2026-02-31", url: POST_JSON.url }],
    [
      "a CSS breakout date",
      { date: '2026-10-25"]{color:red}/*', url: POST_JSON.url },
    ],
    ["a missing url", { date: POST_JSON.date }],
    ["a relative url", { date: POST_JSON.date, url: "/2026/10/25/x.html" }],
    [
      "an http url",
      { date: POST_JSON.date, url: "http://updates.morcus.net/" },
    ],
    ["a javascript url", { date: POST_JSON.date, url: "javascript:alert(1)" }],
    [
      "an external https url",
      { date: POST_JSON.date, url: "https://evil.example/" },
    ],
  ])("rejects %s", (_name, raw) => {
    expect(parseLatestPost(raw)).toBeUndefined();
  });
});

describe("isRecentPost", () => {
  test("uses a 10-day announcement window", () => {
    expect(WHATS_NEW_MAX_AGE_DAYS).toBe(10);
    const postDate = Date.parse("2026-10-25T00:00:00Z");
    const dayMs = 24 * 60 * 60 * 1000;
    const atPublish = new Date(postDate);
    const atLimit = new Date(postDate + WHATS_NEW_MAX_AGE_DAYS * dayMs);
    const pastLimit = new Date(atLimit.getTime() + 1);
    const beforePublish = new Date(postDate - 1);

    expect(isRecentPost(POST_JSON, atPublish)).toBe(true);
    expect(isRecentPost(POST_JSON, atLimit)).toBe(true);
    expect(isRecentPost(POST_JSON, pastLimit)).toBe(false);
    expect(isRecentPost(POST_JSON, beforePublish)).toBe(false);
  });

  test("rejects posts with missing/blank descriptions or invalid dates", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(
      isRecentPost({ date: POST_JSON.date, url: POST_JSON.url }, now)
    ).toBe(false);
    expect(isRecentPost({ ...POST_JSON, description: "" }, now)).toBe(false);
    expect(isRecentPost({ ...POST_JSON, date: "invalid" }, now)).toBe(false);
  });
});

const NOW_RECENT = new Date("2026-10-28T12:00:00Z");
const NOW_EXPIRED = new Date("2026-11-10T00:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pollerWith(
  responses: Array<Response | Error>,
  opts: {
    now?: () => Date;
    onChange?: (post: LatestPost | null) => void;
  } = {}
) {
  const warnings: string[] = [];
  const fetchFn = jest.fn((): Promise<Response> => {
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const poller = new LatestPostPoller({
    fetchFn: fetchFn as unknown as typeof fetch,
    now: opts.now ?? (() => NOW_RECENT),
    warn: (message) => warnings.push(message),
    onChange: opts.onChange,
  });
  return { poller, fetchFn, warnings };
}

describe("LatestPostPoller", () => {
  test("returns null before its first fetch", () => {
    expect(pollerWith([]).poller.current()).toBeNull();
  });

  test("fetches the blog's latest.json by default and returns an active post within 10 days", async () => {
    const { poller, fetchFn } = pollerWith([jsonResponse(POST_JSON)]);
    await poller.refresh();
    expect(fetchFn).toHaveBeenCalledWith(
      DEFAULT_LATEST_POST_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(poller.current()).toEqual(POST_JSON);
    expect(poller.current(NOW_EXPIRED)).toBeNull();
  });

  test("returns null when the fetched post is expired (> 10 days) or lacks a description", async () => {
    const { poller: expiredPoller } = pollerWith([jsonResponse(POST_JSON)], {
      now: () => NOW_EXPIRED,
    });
    await expiredPoller.refresh();
    expect(expiredPoller.current()).toBeNull();

    const { poller: noDescPoller } = pollerWith([
      jsonResponse({ date: POST_JSON.date, url: POST_JSON.url }),
    ]);
    await noDescPoller.refresh();
    expect(noDescPoller.current()).toBeNull();
  });

  test("keeps the last good post when a later fetch fails", async () => {
    const { poller, warnings } = pollerWith([
      jsonResponse(POST_JSON),
      new Error("network down"),
      jsonResponse({}, 500),
      jsonResponse({ date: "nope" }),
    ]);
    await poller.refresh();
    await poller.refresh();
    await poller.refresh();
    await poller.refresh();
    expect(poller.current()).toEqual(POST_JSON);
    expect(warnings).toHaveLength(3);
  });

  test("replaces the post when a newer one is published and notifies onChange only on state transitions", async () => {
    let clock = NOW_RECENT;
    const newer: LatestPost = {
      ...POST_JSON,
      date: "2026-10-27",
      description: "Second release.",
    };
    const seen: Array<LatestPost | null> = [];
    const { poller } = pollerWith(
      [
        jsonResponse(POST_JSON),
        jsonResponse(POST_JSON),
        jsonResponse(newer),
        new Error("offline when post expires"),
      ],
      {
        now: () => clock,
        onChange: (p) => seen.push(p),
      }
    );
    await poller.refresh();
    await poller.refresh(); // Same post: no duplicate notification.
    await poller.refresh(); // Newer post: notifies.
    clock = NOW_EXPIRED;
    await poller.refresh(); // Expired post: notifies null even when fetch fails.
    expect(seen).toEqual([POST_JSON, newer, null]);
  });

  test("refreshes on an interval until stopped", () => {
    jest.useFakeTimers({ now: NOW_RECENT });
    try {
      const { poller, fetchFn } = pollerWith([
        jsonResponse(POST_JSON),
        jsonResponse(POST_JSON),
        jsonResponse(POST_JSON),
      ]);
      poller.start();
      poller.start(); // Idempotent: no second timer.
      expect(fetchFn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      poller.stop();
      jest.advanceTimersByTime(2 * 60 * 60 * 1000);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("catches and warns if an onChange listener throws without rejecting refresh()", async () => {
    const afterThrow: Array<LatestPost | null> = [];
    const { poller, warnings } = pollerWith([jsonResponse(POST_JSON)], {
      onChange: () => {
        throw new Error("boom in listener");
      },
    });
    poller.onChange((p) => afterThrow.push(p));

    await expect(poller.refresh()).resolves.toBeUndefined();
    expect(afterThrow).toEqual([POST_JSON]);
    expect(warnings).toEqual([
      expect.stringContaining(
        "What's New: listener failed: Error: boom in listener"
      ),
    ]);
  });

  test("latestPostFromEnv disables polling for 'off' or '' and defaults via envVar", () => {
    expect(latestPostFromEnv({ LATEST_POST_URL: "off" })).toBeUndefined();
    expect(latestPostFromEnv({ LATEST_POST_URL: "" })).toBeUndefined();
    expect(latestPostFromEnv({})).toBeInstanceOf(LatestPostPoller);
    expect(
      latestPostFromEnv({
        LATEST_POST_URL: "https://updates.morcus.net/custom.json",
      })
    ).toBeInstanceOf(LatestPostPoller);
  });
});

describe("What's New SSR markup and <head> pre-paint style", () => {
  test("renders #whats-new and the pre-paint <style> on empty non-embedded dictionary pages", () => {
    const html = renderDictPageHtml({ query: "", latestPost: POST_JSON });
    expect(html).toContain(
      `<style>html[data-wn-seen]:not([data-wn-seen="2026-10-25"]) #whats-new { display: block; }</style>`
    );
    expect(html).toContain(
      `<p class="whats-new" id="whats-new" data-wn-date="2026-10-25"><span class="wn-tag">New update</span> A redesigned site. <a href="https://updates.morcus.net/2026/10/25/New-Release.html" target="_blank" rel="noopener">Read more →</a></p>`
    );
    // Must not carry `[hidden]`, which `app.css` forces to `display: none !important`.
    expect(html).not.toMatch(/id="whats-new"[^>]*\bhidden\b/);
  });

  test("renders on the site root page too", () => {
    const html = renderDictPageHtml({
      query: "",
      servedAtRoot: true,
      latestPost: POST_JSON,
    });
    expect(html).toContain('id="whats-new"');
    expect(html).toContain(
      'html[data-wn-seen]:not([data-wn-seen="2026-10-25"])'
    );
  });

  test("escapes HTML special characters in description and url and rejects non-ISO dates", () => {
    const escaped = renderDictPageHtml({
      query: "",
      latestPost: {
        date: "2026-10-25",
        description: 'Fast <lookup> & "quotes"',
        url: 'https://updates.morcus.net/post?a=1&b="2"',
      },
    });
    expect(escaped).toContain(
      "</span> Fast &lt;lookup&gt; &amp; &quot;quotes&quot; <a "
    );
    expect(escaped).toContain(
      'href="https://updates.morcus.net/post?a=1&amp;b=&quot;2&quot;"'
    );

    const badDate = renderDictPageHtml({
      query: "",
      latestPost: {
        ...POST_JSON,
        date: '2026-10-25"] { color: red } /*',
      },
    });
    expect(badDate).not.toContain("whats-new");
    expect(badDate).not.toContain("data-wn-seen");
  });

  test("omits #whats-new and the <style> when latestPost is absent, null, or has no description", () => {
    for (const latestPost of [
      undefined,
      null,
      { date: "2026-10-25", url: POST_JSON.url },
      { date: "2026-10-25", description: "", url: POST_JSON.url },
    ]) {
      const html = renderDictPageHtml({ query: "", latestPost });
      expect(html).not.toContain("whats-new");
      expect(html).not.toContain("data-wn-seen");
    }
  });

  test("never renders on embedded pages, search results, Greek fallback, or ID lookups", () => {
    expect(
      renderDictPageHtml({ query: "", embedded: true, latestPost: POST_JSON })
    ).not.toContain("whats-new");
    expect(
      renderDictPageHtml({ query: "amo", latestPost: POST_JSON })
    ).not.toContain("whats-new");
    expect(
      renderDictPageHtml({ query: "λόγος", latestPost: POST_JSON })
    ).not.toContain("whats-new");
    expect(
      renderDictPageHtml({
        query: "n123",
        isIdSearch: true,
        latestPost: POST_JSON,
      })
    ).not.toContain("whats-new");
  });
});

describe("Dictionary routes & 2-key StaticPageLookup override", () => {
  const fusedDict = {
    getEntry: jest.fn().mockResolvedValue({}),
    getCompletions: jest.fn().mockResolvedValue({}),
  } as unknown as FusedDictionary;

  const rawBody = (
    res: request.Response,
    cb: (err: null, b: Buffer) => void
  ) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  };

  /**
   * The overlay compresses off the event loop, so the first lookup after a
   * post change still gets the baseline row; retry until `ok` (or give up).
   */
  async function eventually(
    fetch: () => Promise<request.Response>,
    ok: (res: request.Response) => boolean
  ): Promise<request.Response> {
    for (let i = 0; i < 100; i++) {
      const res = await fetch();
      if (ok(res)) return res;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("condition never held");
  }

  const brHtml = (res: request.Response) =>
    zlib.brotliDecompressSync(res.body as Buffer).toString("utf8");

  function makeBaselineStore(): StaticPageLookup {
    const map = new Map<string, ReturnType<typeof compressStaticPage>>();
    for (const view of [
      { isEmbedded: false, servedAtRoot: true },
      { isEmbedded: false, servedAtRoot: false },
      { isEmbedded: true, servedAtRoot: false },
    ]) {
      const state = defaultDictLandingState(view);
      map.set(
        dictLandingPageKey(state),
        compressStaticPage(renderDictLandingPage(state))
      );
    }
    return { get: (key) => map.get(key) };
  }

  test("overlays the 2 non-embedded default landing keys when a post is active, and clears on expiry", async () => {
    let active: LatestPost | null = POST_JSON;
    const listeners: Array<(post: LatestPost | null) => void> = [];
    const source: LatestPostSource = {
      current: () => active,
      onChange: (fn) => listeners.push(fn),
    };
    const baseStore = makeBaselineStore();
    const app = express().use(
      createDictRoutes(fusedDict, {
        staticPages: baseStore,
        latestPost: source,
      })
    );

    // 1. Active post: `/` and `/dicts` are served precompressed with `#whats-new`.
    for (const url of ["/", "/dicts"]) {
      const res = await eventually(
        () =>
          request(app)
            .get(url)
            .set("Accept-Encoding", "br")
            .buffer(true)
            .parse(rawBody),
        (r) => brHtml(r).includes('id="whats-new"')
      );
      expect(res.status).toBe(200);
      expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
      const html = brHtml(res);
      expect(html).toContain('data-wn-date="2026-10-25"');
    }

    // 2. Embedded landing (`/dicts?embedded=1`) is served from the baseline store without What's New.
    const embeddedRes = await request(app)
      .get("/dicts?embedded=1")
      .set("Accept-Encoding", "br")
      .buffer(true)
      .parse(rawBody);
    expect(embeddedRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    const embeddedHtml = zlib
      .brotliDecompressSync(embeddedRes.body as Buffer)
      .toString("utf8");
    expect(embeddedHtml).not.toContain("whats-new");

    // 3. Custom-cookie and non-plain landings render dynamically with the active post.
    const cookieRes = await request(app)
      .get("/dicts")
      .set("Cookie", `morcus_d=${encodeDictBitmask(["GAF"])}`);
    expect(
      cookieRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]
    ).toBeUndefined();
    expect(cookieRes.text).toContain('id="whats-new"');

    const scaledRes = await request(app).get("/dicts?scale=120");
    expect(
      scaledRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]
    ).toBeUndefined();
    expect(scaledRes.text).toContain('id="whats-new"');

    // 4. AJAX partial landing (`format=partial` and `X-Requested-With: fetch`)
    // never includes What's New and preserves versioned immutable Cache-Control.
    const prevCommitId = process.env.COMMIT_ID;
    process.env.COMMIT_ID = "test-commit-wn";
    try {
      const partialRes = await request(app).get(
        "/dicts?format=partial&v=test-commit-wn"
      );
      expect(partialRes.status).toBe(200);
      expect(partialRes.headers["cache-control"]).toBe(
        "private, max-age=31536000, immutable"
      );
      expect(partialRes.text).toContain('id="landing-welcome"');
      expect(partialRes.text).not.toContain("whats-new");

      const headerPartialRes = await request(app)
        .get("/dicts?v=test-commit-wn")
        .set("X-Requested-With", "fetch");
      expect(headerPartialRes.status).toBe(200);
      expect(headerPartialRes.headers["cache-control"]).toBe(
        "private, max-age=31536000, immutable"
      );
      expect(headerPartialRes.text).not.toContain("whats-new");
    } finally {
      if (prevCommitId === undefined) {
        delete process.env.COMMIT_ID;
      } else {
        process.env.COMMIT_ID = prevCommitId;
      }
    }

    // 5. Post expires: overrides clear and `/` and `/dicts` fall back to the baseline store.
    active = null;
    for (const fn of listeners) fn(null);

    const expiredRes = await request(app)
      .get("/dicts")
      .set("Accept-Encoding", "br")
      .buffer(true)
      .parse(rawBody);
    expect(expiredRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    const expiredHtml = zlib
      .brotliDecompressSync(expiredRes.body as Buffer)
      .toString("utf8");
    expect(expiredHtml).not.toContain("whats-new");
  });

  test("falls through to dynamic rendering when the underlying staticPages store has no entry (dev / no pages.db)", async () => {
    const emptyStore: StaticPageLookup = { get: () => undefined };
    const source: LatestPostSource = {
      current: () => POST_JSON,
    };
    const wrapped = withDictLandingOverrides(emptyStore, source);
    const rootKey = dictLandingPageKey(
      defaultDictLandingState({ isEmbedded: false, servedAtRoot: true })
    );
    expect(wrapped.get(rootKey)).toBeUndefined();

    const app = express().use(
      createDictRoutes(fusedDict, {
        staticPages: emptyStore,
        latestPost: source,
      })
    );
    const res = await request(app).get("/dicts");
    expect(res.status).toBe(200);
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    expect(res.text).toContain('id="whats-new"');
  });

  test("withDictLandingOverrides builds the overlay off the event loop and drops superseded builds", async () => {
    const baseStore = makeBaselineStore();
    const rootKey = dictLandingPageKey(
      defaultDictLandingState({ isEmbedded: false, servedAtRoot: true })
    );
    let active: LatestPost | null = POST_JSON;
    const overlay = withDictLandingOverrides(baseStore, {
      current: () => active,
    });

    // The lookup that notices the post starts the build and gets the baseline.
    expect(overlay.get(rootKey)).toBe(baseStore.get(rootKey));
    await overlay.settled();
    const built = overlay.get(rootKey);
    expect(built).not.toBe(baseStore.get(rootKey));
    expect(zlib.brotliDecompressSync(built!.br).toString("utf8")).toContain(
      'data-wn-date="2026-10-25"'
    );

    // A newer post keeps serving the old overlay until its build lands.
    active = { ...POST_JSON, date: "2026-10-27" };
    expect(overlay.get(rootKey)).toBe(built);
    // Superseded mid-build by "no post": cleared at once, and the late build
    // must not resurrect it.
    active = null;
    expect(overlay.get(rootKey)).toBe(baseStore.get(rootKey));
    await overlay.settled();
    expect(overlay.get(rootKey)).toBe(baseStore.get(rootKey));
  });

  test("withDictLandingOverrides returns staticPages untouched when latestPost is undefined", () => {
    const baseStore = makeBaselineStore();
    expect(withDictLandingOverrides(baseStore, undefined)).toBe(baseStore);
  });
});
