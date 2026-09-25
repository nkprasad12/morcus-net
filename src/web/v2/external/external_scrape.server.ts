/**
 * Server-side cache in front of the scraper for `/v2/externalReader?url=`.
 *
 * A `?url=` link is shareable, so one import can be opened by many readers,
 * and every reload and `?q=` lookup (for No-JS readers) re-requests the page.
 * The cache keeps that from turning into repeated fetches of the source site:
 * - successes are kept for a TTL in a small LRU;
 * - concurrent requests for the same URL share one fetch;
 * - failures are not cached, so a transient error doesn't stick.
 */

import {
  FetchLimitError,
  UnsafeUrlError,
  withDefaultScheme,
} from "@/web/scraping/safe_fetch";

export const DEFAULT_SCRAPE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_SCRAPE_MAX_ENTRIES = 32;

export type Scraper = (url: string) => Promise<string>;

export interface ScrapeCacheOptions {
  scrape: Scraper;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface Entry {
  text: string;
  expiresAt: number;
}

export class ScrapeCache {
  private readonly scrape: Scraper;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  /** Insertion order doubles as recency: hits are re-inserted at the end. */
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(options: ScrapeCacheOptions) {
    this.scrape = options.scrape;
    this.ttlMs = options.ttlMs ?? DEFAULT_SCRAPE_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_SCRAPE_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  /** The page's text, from the cache when fresh. Rejects like the scraper. */
  get(url: string): Promise<string> {
    const key = scrapeCacheKey(url);
    const hit = this.entries.get(key);
    if (hit !== undefined) {
      this.entries.delete(key);
      if (hit.expiresAt > this.now()) {
        this.entries.set(key, hit);
        return Promise.resolve(hit.text);
      }
    }
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;

    const request = this.scrape(url)
      .then((text) => {
        this.store(key, text);
        return text;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, request);
    return request;
  }

  get size(): number {
    return this.entries.size;
  }

  private store(key: string, text: string): void {
    this.entries.set(key, { text, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * `example.com/a` and `https://example.com/a` are the same import. The
 * fragment never reaches the server, so it's dropped too.
 */
export function scrapeCacheKey(url: string): string {
  const withScheme = withDefaultScheme(url.trim());
  try {
    const parsed = new URL(withScheme);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return withScheme;
  }
}

/** Why an import failed, in terms a reader can act on. */
export interface ScrapeFailure {
  /** HTTP status for the error page. */
  status: number;
  message: string;
}

/**
 * Maps a scrape rejection to a user-facing message. Only messages written for
 * users (the fetch guard's) are shown verbatim; anything else is summarized,
 * so internal errors never reach the page.
 */
export function describeScrapeFailure(err: unknown): ScrapeFailure {
  if (err instanceof UnsafeUrlError) {
    return {
      status: 400,
      message: `That address can't be imported. ${err.message}.`,
    };
  }
  if (err instanceof FetchLimitError) {
    return {
      status: 502,
      message: `Couldn't import that page. ${err.message}.`,
    };
  }
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String(err.code)
      : "";
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"].includes(code)) {
    return {
      status: 502,
      message: "Couldn't reach that site. Check the address and try again.",
    };
  }
  return {
    status: 422,
    message:
      "Couldn't read the text on that page. Its layout may not be supported yet.",
  };
}
