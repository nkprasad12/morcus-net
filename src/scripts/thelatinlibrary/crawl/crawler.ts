import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type {
  RawPageMeta,
  SnapshotManifest,
  SnapshotPageEntry,
} from "@/common/thelatinlibrary/snapshot_types";
import {
  decodeRawPageBytes,
  extractRawPageText,
  normalizePagePath,
  scanPageProvenance,
} from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

export const BASE_URL = "https://www.thelatinlibrary.com/";
export const USER_AGENT =
  "MorcusNet/1.0 (+https://morcus.net; Latin philology snapshot)";
export const MIN_REQUEST_DELAY_MS = 2000;
/** Each HTTP request is aborted after this long. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** Responses larger than this are rejected (the largest page is ~3 MB). */
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
/** Attempts per page (the first try plus retries on 5xx, 429 and timeouts). */
export const MAX_FETCH_ATTEMPTS = 3;
/** Longest `Retry-After` the crawler is willing to wait before a retry. */
export const MAX_RETRY_AFTER_MS = 5 * 60_000;
/** Wait before retrying a 429/503 that carries no usable `Retry-After`. */
export const DEFAULT_RETRY_AFTER_MS = 30_000;

export const HUB_INDEX_PAGES = [
  "index.html",
  "christian.html",
  "medieval.html",
  "neo.html",
  "misc.html",
  "ius.html",
  "bible.html",
] as const;

const HUB_SET: ReadonlySet<string> = new Set(HUB_INDEX_PAGES);

export function isHubIndexPage(pagePath: string): boolean {
  return HUB_SET.has(pagePath);
}

/** Content types accepted as HTML. A missing `Content-Type` is accepted too. */
const HTML_CONTENT_TYPES = new Set(["text/html", "application/xhtml+xml"]);

export interface CrawlState {
  visitedPaths: string[];
  failedPaths: Record<string, string>;
}

export interface CrawlerOptions {
  rootDir: string;
  seedPaths?: readonly string[];
  refresh?: boolean;
  maxPages?: number;
  delayMs?: number;
  fetchFn?: typeof fetch;
  /**
   * Never touch the network: walk the links of pages already in `raw/` and
   * record pages that aren't there as missing. Used to rebuild the link graph
   * (author and hub pages) from an existing snapshot.
   */
  offline?: boolean;
  /** Injectable sleep, for tests of `Retry-After` handling. */
  sleepFn?: (ms: number) => Promise<void>;
  onProgress?: (msg: string) => void;
}

export interface CrawlSummary {
  fetchedCount: number;
  skippedCount: number;
  unchangedCount: number;
  failedCount: number;
  /** Pages skipped because robots.txt disallows them. */
  robotsDisallowed: string[];
  /** Offline mode only: linked pages that aren't in `raw/`. */
  missingOffline: string[];
  failedPaths: Record<string, string>;
}

export interface CrawlResult {
  summary: CrawlSummary;
  links: LinkGraph;
}

/**
 * The sidecar written next to each crawled page (`raw/<page>.meta.json`): the
 * shared `RawPageMeta` plus the HTTP details needed for conditional requests
 * and decoding.
 */
export interface CrawlPageMeta extends RawPageMeta {
  etag?: string;
  lastModified?: string;
  /** `charset` parameter of the HTTP `Content-Type` header, lowercased. */
  httpCharset?: string;
}

/**
 * Where each page was first linked from during a crawl.
 *
 * - `authorPage`: the first non-hub page that linked to it (the author index
 *   page for a work page), recorded the first time the page is queued.
 * - `hubPage`: the hub index page that linked directly to it. `index.html`
 *   (the classical list) is replaced by a more specific hub that also links
 *   it (e.g. `medieval.html`).
 */
export class LinkGraph {
  readonly authorPage = new Map<string, string>();
  readonly hubPage = new Map<string, string>();

  recordFirstLink(target: string, fromPage: string): void {
    if (!isHubIndexPage(fromPage) && !this.authorPage.has(target)) {
      this.authorPage.set(target, fromPage);
    }
  }

  recordLink(target: string, fromPage: string): void {
    if (!isHubIndexPage(fromPage) || target === fromPage) return;
    const existing = this.hubPage.get(target);
    if (
      existing === undefined ||
      (existing === "index.html" && fromPage !== "index.html")
    ) {
      this.hubPage.set(target, fromPage);
    }
  }
}

/**
 * Resolves a link `href` found on `currentPagePath` to a normalized relative
 * `.html`/`.shtml` path under `www.thelatinlibrary.com`, or `null` if external
 * or non-HTML.
 */
export function resolveInternalHtmlLink(
  currentPagePath: string,
  href: string
): string | null {
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("javascript:")
  ) {
    return null;
  }

  let rawPath: string;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.hostname !== "www.thelatinlibrary.com" &&
        parsed.hostname !== "thelatinlibrary.com"
      ) {
        return null;
      }
      rawPath = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    const withoutFragment = trimmed.split("#")[0].split("?")[0];
    if (!withoutFragment) {
      return null;
    }
    if (withoutFragment.startsWith("/")) {
      rawPath = withoutFragment;
    } else {
      const baseDir = path.posix.dirname(normalizePagePath(currentPagePath));
      rawPath =
        baseDir === "." ? withoutFragment : `${baseDir}/${withoutFragment}`;
    }
  }

  const cleanPath = rawPath.split("#")[0].split("?")[0];
  const normalized = path.posix.normalize(cleanPath).replace(/^\/+/, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    !/\.s?html?$/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

/**
 * Rate-limited HTTP fetcher enforcing at least `delayMs` (default 2,000 ms)
 * between every request, sending the MorcusNet `User-Agent`, and aborting
 * each request after `timeoutMs`.
 */
export class RateLimitedFetcher {
  private lastRequestAt = 0;
  private delayMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    delayMs: number = MIN_REQUEST_DELAY_MS,
    fetchFn: typeof fetch = fetch,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ) {
    this.delayMs = delayMs;
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  /** Raises the minimum delay (e.g. to honour a robots.txt `Crawl-delay`). */
  raiseDelay(delayMs: number): void {
    this.delayMs = Math.max(this.delayMs, delayMs);
  }

  async fetch(
    url: string,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (this.lastRequestAt > 0 && elapsed < this.delayMs) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.delayMs - elapsed)
      );
    }
    this.lastRequestAt = Date.now();
    return this.fetchFn(url, {
      headers: {
        "User-Agent": USER_AGENT,
        ...extraHeaders,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

export function computeSha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Rules from robots.txt that apply to the crawler. */
export interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs?: number;
}

/**
 * Parses robots.txt, keeping the group for `MorcusNet` if there is one and
 * the `*` group otherwise. Paths are compared by prefix; the longest matching
 * rule wins, and `Allow` wins ties.
 */
export function parseRobotsTxt(text: string): RobotsRules {
  interface Group {
    agents: string[];
    disallow: string[];
    allow: string[];
    crawlDelayMs?: number;
  }
  const groups: Group[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (current === undefined || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current === undefined) continue;
    if (field === "disallow" && value) current.disallow.push(value);
    else if (field === "allow" && value) current.allow.push(value);
    else if (field === "crawl-delay" && Number.isFinite(Number(value))) {
      current.crawlDelayMs = Number(value) * 1000;
    }
  }
  const ours =
    groups.find((g) => g.agents.some((a) => a !== "*" && /morcus/.test(a))) ??
    groups.find((g) => g.agents.includes("*"));
  return ours === undefined
    ? { disallow: [], allow: [] }
    : {
        disallow: ours.disallow,
        allow: ours.allow,
        ...(ours.crawlDelayMs !== undefined
          ? { crawlDelayMs: ours.crawlDelayMs }
          : {}),
      };
}

/** Whether `pagePath` (relative, no leading slash) may be crawled. */
export function isAllowedByRobots(
  rules: RobotsRules,
  pagePath: string
): boolean {
  const urlPath = "/" + pagePath;
  const longest = (prefixes: string[]) =>
    Math.max(
      -1,
      ...prefixes.filter((p) => urlPath.startsWith(p)).map((p) => p.length)
    );
  return longest(rules.allow) >= longest(rules.disallow);
}

async function fetchRobotsRules(
  fetcher: RateLimitedFetcher
): Promise<RobotsRules> {
  const response = await fetcher.fetch(BASE_URL + "robots.txt");
  if (response.ok) return parseRobotsTxt(await response.text());
  if (response.status >= 400 && response.status < 500) {
    return { disallow: [], allow: [] };
  }
  throw new Error(
    `robots.txt returned HTTP ${response.status}; not crawling without it.`
  );
}

/** Lowercased `charset` parameter of a `Content-Type` header, if any. */
export function charsetOfContentType(
  contentType: string | null
): string | undefined {
  if (contentType === null) return undefined;
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m === null ? undefined : m[1].toLowerCase();
}

/**
 * Milliseconds to wait according to a `Retry-After` header (seconds or an
 * HTTP date), or `undefined` if absent or unparseable.
 */
export function parseRetryAfterMs(
  header: string | null,
  now: number = Date.now()
): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Reads a response body, failing once it exceeds `maxBytes`. */
async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`response too large (${declared} bytes)`);
  }
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`response too large (over ${maxBytes} bytes)`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function loadCrawlState(statePath: string): CrawlState {
  if (!fs.existsSync(statePath)) {
    return { visitedPaths: [], failedPaths: {} };
  }
  try {
    const parsed: CrawlState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      visitedPaths: Array.isArray(parsed.visitedPaths)
        ? parsed.visitedPaths
        : [],
      failedPaths:
        parsed.failedPaths && typeof parsed.failedPaths === "object"
          ? parsed.failedPaths
          : {},
    };
  } catch {
    return { visitedPaths: [], failedPaths: {} };
  }
}

function saveCrawlState(statePath: string, state: CrawlState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

function readMeta(metaFilePath: string): CrawlPageMeta | null {
  try {
    return JSON.parse(fs.readFileSync(metaFilePath, "utf8"));
  } catch {
    return null;
  }
}

type FetchOutcome =
  | { kind: "ok"; response: Response }
  | { kind: "failed"; reason: string };

/**
 * Crawls `https://www.thelatinlibrary.com/` into `rootDir/raw/`, writing
 * verbatim bytes and `.meta.json` sidecars. Returns a summary and the link
 * graph; building `manifest.json` is left to the caller.
 *
 * Pages that failed in an earlier run are retried: they are never marked
 * visited, and are queued again on resume.
 */
export async function crawlLatinLibrary(
  options: CrawlerOptions
): Promise<CrawlResult> {
  const {
    rootDir,
    seedPaths = HUB_INDEX_PAGES,
    refresh = false,
    maxPages = Infinity,
    delayMs = MIN_REQUEST_DELAY_MS,
    fetchFn = fetch,
    offline = false,
    sleepFn = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
    onProgress,
  } = options;

  const rawDir = path.join(rootDir, "raw");
  const statePath = path.join(rootDir, ".crawl_state.json");
  const state: CrawlState =
    refresh || offline
      ? { visitedPaths: [], failedPaths: {} }
      : loadCrawlState(statePath);
  const persistState = (visited: ReadonlySet<string>) => {
    if (offline) return;
    state.visitedPaths = [...visited];
    saveCrawlState(statePath, state);
  };

  const visited = new Set<string>(state.visitedPaths.map(normalizePagePath));
  const queued = new Set<string>();
  const queue: string[] = [];
  const links = new LinkGraph();
  const robotsDisallowed: string[] = [];
  const missingOffline: string[] = [];

  const enqueue = (p: string, fromPage?: string) => {
    const norm = normalizePagePath(p);
    if (!norm) return;
    if (fromPage !== undefined) links.recordLink(norm, fromPage);
    if (queued.has(norm)) return;
    queued.add(norm);
    queue.push(norm);
    if (fromPage !== undefined) links.recordFirstLink(norm, fromPage);
  };

  for (const seed of seedPaths) {
    enqueue(seed);
  }
  for (const failed of Object.keys(state.failedPaths)) {
    enqueue(failed);
  }

  const fetcher = new RateLimitedFetcher(delayMs, fetchFn);
  let robots: RobotsRules = { disallow: [], allow: [] };
  if (!offline) {
    fs.mkdirSync(rawDir, { recursive: true });
    robots = await fetchRobotsRules(fetcher);
    if (robots.crawlDelayMs !== undefined) {
      fetcher.raiseDelay(robots.crawlDelayMs);
    }
  }

  let fetchedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  const fail = (pagePath: string, reason: string) => {
    state.failedPaths[pagePath] = reason;
    persistState(visited);
    onProgress?.(`FAILED ${pagePath}: ${reason}`);
  };

  const fetchWithRetries = async (
    url: string,
    extraHeaders: Record<string, string>
  ): Promise<FetchOutcome> => {
    let lastError = "Network error";
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      const isLast = attempt === MAX_FETCH_ATTEMPTS;
      let response: Response;
      try {
        response = await fetcher.fetch(url, extraHeaders);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
      if (response.status === 429 || response.status === 503) {
        lastError = `HTTP ${response.status}`;
        const waitMs =
          parseRetryAfterMs(response.headers.get("retry-after")) ??
          DEFAULT_RETRY_AFTER_MS;
        if (isLast || waitMs > MAX_RETRY_AFTER_MS) break;
        onProgress?.(
          `HTTP ${response.status} for ${url}; waiting ${waitMs} ms`
        );
        await sleepFn(waitMs);
        continue;
      }
      if (response.status >= 500) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      return { kind: "ok", response };
    }
    return { kind: "failed", reason: lastError };
  };

  while (queue.length > 0 && fetchedCount < maxPages) {
    const pagePath = queue.shift()!;
    const rawFilePath = path.join(rawDir, pagePath);
    const metaFilePath = `${rawFilePath}.meta.json`;
    const hasValidOnDisk =
      fs.existsSync(rawFilePath) && fs.existsSync(metaFilePath);

    let htmlBytes: Buffer | null = null;
    let httpCharset: string | undefined;

    if (offline || (!refresh && (visited.has(pagePath) || hasValidOnDisk))) {
      if (fs.existsSync(rawFilePath)) {
        skippedCount++;
        htmlBytes = fs.readFileSync(rawFilePath);
        httpCharset = readMeta(metaFilePath)?.httpCharset;
        visited.add(pagePath);
      } else if (offline) {
        missingOffline.push(pagePath);
      } else {
        skippedCount++;
      }
    } else if (!isAllowedByRobots(robots, pagePath)) {
      robotsDisallowed.push(pagePath);
      continue;
    } else {
      const url = BASE_URL + pagePath;
      const extraHeaders: Record<string, string> = {};
      const existingMeta = hasValidOnDisk ? readMeta(metaFilePath) : null;
      if (existingMeta?.etag) {
        extraHeaders["If-None-Match"] = existingMeta.etag;
      }
      if (existingMeta?.lastModified) {
        extraHeaders["If-Modified-Since"] = existingMeta.lastModified;
      }

      const outcome = await fetchWithRetries(url, extraHeaders);
      if (outcome.kind === "failed") {
        fail(pagePath, outcome.reason);
        continue;
      }
      const response = outcome.response;

      if (response.redirected && response.url) {
        const target = resolveInternalHtmlLink(pagePath, response.url);
        if (target === null) {
          fail(pagePath, `redirected off-site to ${response.url}`);
          continue;
        }
        if (target !== pagePath) {
          fail(pagePath, `redirected to ${target}`);
          enqueue(target, pagePath);
          continue;
        }
      }

      if (response.status === 304 && hasValidOnDisk) {
        unchangedCount++;
        fetchedCount++;
        htmlBytes = fs.readFileSync(rawFilePath);
        httpCharset = existingMeta?.httpCharset;
        delete state.failedPaths[pagePath];
        visited.add(pagePath);
      } else if (!response.ok) {
        fail(pagePath, `HTTP ${response.status}`);
        continue;
      } else {
        const contentType = response.headers.get("content-type");
        const mediaType = contentType?.split(";")[0].trim().toLowerCase();
        if (mediaType && !HTML_CONTENT_TYPES.has(mediaType)) {
          fail(pagePath, `unexpected Content-Type ${mediaType}`);
          continue;
        }
        let bytes: Buffer;
        try {
          bytes = await readBodyCapped(response, MAX_RESPONSE_BYTES);
        } catch (err) {
          fail(pagePath, err instanceof Error ? err.message : String(err));
          continue;
        }
        const sha256 = computeSha256(bytes);
        httpCharset = charsetOfContentType(contentType);

        if (existingMeta !== null && existingMeta.sha256 === sha256) {
          // Unchanged bytes: keep the sidecar (and its `retrieved` date).
          unchangedCount++;
        } else {
          fs.mkdirSync(path.dirname(rawFilePath), { recursive: true });
          fs.writeFileSync(rawFilePath, bytes);
          const nextMeta: CrawlPageMeta = {
            url,
            retrieved: new Date().toISOString().slice(0, 10),
            sha256,
          };
          const etag = response.headers.get("etag");
          const lastMod = response.headers.get("last-modified");
          if (etag) nextMeta.etag = etag;
          if (lastMod) nextMeta.lastModified = lastMod;
          if (httpCharset) nextMeta.httpCharset = httpCharset;
          fs.writeFileSync(
            metaFilePath,
            JSON.stringify(nextMeta, null, 2) + "\n"
          );
        }
        fetchedCount++;
        htmlBytes = bytes;
        delete state.failedPaths[pagePath];
        visited.add(pagePath);
        if (fetchedCount % 25 === 0) {
          persistState(visited);
          onProgress?.(
            `Fetched ${fetchedCount} (skipped ${skippedCount}, queued ${queue.length})`
          );
        }
      }
    }

    if (htmlBytes !== null) {
      const { links: hrefs } = extractRawPageText(
        decodeRawPageBytes(htmlBytes, httpCharset)
      );
      for (const href of hrefs) {
        const target = resolveInternalHtmlLink(pagePath, href);
        if (target !== null) {
          enqueue(target, pagePath);
        }
      }
    }
  }

  persistState(visited);

  return {
    summary: {
      fetchedCount,
      skippedCount,
      unchangedCount,
      failedCount: Object.keys(state.failedPaths).length,
      robotsDisallowed,
      missingOffline,
      failedPaths: state.failedPaths,
    },
    links,
  };
}

/** Lists every `.html`/`.shtml` page under `rootDir/raw/`, sorted. */
export function listRawPages(rootDir: string): string[] {
  const rawDir = path.join(rootDir, "raw");
  const allFiles: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        !entry.name.endsWith(".meta.json") &&
        /\.s?html?$/i.test(entry.name)
      ) {
        allFiles.push(path.relative(rawDir, full).split(path.sep).join("/"));
      }
    }
  };
  walk(rawDir);
  return allFiles.sort();
}

/** A page whose `.meta.json` sidecar is missing, unreadable, or stale. */
export interface SidecarProblem {
  page: string;
  problem: "missing" | "malformed" | "sha256 mismatch";
}

export interface BuildManifestOptions {
  /** The existing `manifest.json`, whose `checks` and `workId` are kept. */
  previous?: SnapshotManifest;
  /**
   * Link graph from a crawl (live or offline). Its author pages replace the
   * previous manifest's; pages it doesn't cover keep their previous values.
   */
  links?: LinkGraph;
}

export interface BuildManifestResult {
  manifest: SnapshotManifest;
  /** Sidecar problems; entries for these pages are omitted from `manifest`. */
  sidecarProblems: SidecarProblem[];
}

/**
 * Builds the `SnapshotManifest` for every page under `rootDir/raw/` from the
 * page bytes and their `.meta.json` sidecars. Pure apart from reading files:
 * it never writes sidecars and never makes up a retrieval date. Pages with a
 * missing, malformed or stale sidecar are reported in `sidecarProblems`
 * instead (fix them with `repairRawSidecars`).
 */
export function buildManifestFromRaw(
  rootDir: string,
  options: BuildManifestOptions = {}
): BuildManifestResult {
  const { previous = {}, links } = options;
  const rawDir = path.join(rootDir, "raw");
  const manifest: SnapshotManifest = {};
  const sidecarProblems: SidecarProblem[] = [];

  for (const relPath of listRawPages(rootDir)) {
    const rawFilePath = path.join(rawDir, relPath);
    const metaFilePath = `${rawFilePath}.meta.json`;
    const bytes = fs.readFileSync(rawFilePath);
    const sha256 = computeSha256(bytes);

    if (!fs.existsSync(metaFilePath)) {
      sidecarProblems.push({ page: relPath, problem: "missing" });
      continue;
    }
    const meta = readMeta(metaFilePath);
    if (meta === null || !meta.url || !meta.retrieved) {
      sidecarProblems.push({ page: relPath, problem: "malformed" });
      continue;
    }
    if (meta.sha256 !== sha256) {
      sidecarProblems.push({ page: relPath, problem: "sha256 mismatch" });
      continue;
    }

    const extracted = extractRawPageText(
      decodeRawPageBytes(bytes, meta.httpCharset)
    );
    const scan = scanPageProvenance(relPath, extracted.blocks);
    const prev = previous[relPath];
    const authorPage = links?.authorPage.get(relPath) ?? prev?.authorPage;
    const hubPage = links?.hubPage.get(relPath) ?? prev?.hubPage;

    const entry: SnapshotPageEntry = {
      url: meta.url,
      retrieved: meta.retrieved,
      sha256,
      path: relPath,
      ...(extracted.title !== undefined ? { title: extracted.title } : {}),
      ...(authorPage !== undefined ? { authorPage } : {}),
      ...(hubPage !== undefined ? { hubPage } : {}),
      ...(prev?.workId !== undefined ? { workId: prev.workId } : {}),
      provenance: scan.provenance,
      provenanceClassification: scan.provenanceClassification,
      provenanceStatements: scan.provenanceStatements,
      statedEdition: scan.statedEdition,
      excluded: scan.excluded,
      ...(scan.exclusionReason !== undefined
        ? { exclusionReason: scan.exclusionReason }
        : {}),
      ...(prev?.checks !== undefined ? { checks: prev.checks } : {}),
    };
    manifest[relPath] = entry;
  }

  return { manifest, sidecarProblems };
}

export interface RepairSidecarsOptions {
  /**
   * `retrieved` date (`YYYY-MM-DD`) for pages with a missing or malformed
   * sidecar. Without it those pages are left alone and reported.
   */
  retrievedForMissing?: string;
}

/**
 * Repairs `.meta.json` sidecars under `rootDir/raw/`: updates a stale
 * `sha256` (keeping the recorded `retrieved` date), and writes missing or
 * malformed sidecars only when the caller supplies the retrieval date.
 * Returns the problems it fixed and those it couldn't.
 */
export function repairRawSidecars(
  rootDir: string,
  options: RepairSidecarsOptions = {}
): { repaired: SidecarProblem[]; unrepaired: SidecarProblem[] } {
  const rawDir = path.join(rootDir, "raw");
  const repaired: SidecarProblem[] = [];
  const unrepaired: SidecarProblem[] = [];
  for (const relPath of listRawPages(rootDir)) {
    const rawFilePath = path.join(rawDir, relPath);
    const metaFilePath = `${rawFilePath}.meta.json`;
    const sha256 = computeSha256(fs.readFileSync(rawFilePath));
    const exists = fs.existsSync(metaFilePath);
    const meta = exists ? readMeta(metaFilePath) : null;
    if (meta !== null && meta.url && meta.retrieved) {
      if (meta.sha256 !== sha256) {
        meta.sha256 = sha256;
        fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2) + "\n");
        repaired.push({ page: relPath, problem: "sha256 mismatch" });
      }
      continue;
    }
    const problem: SidecarProblem = {
      page: relPath,
      problem: exists ? "malformed" : "missing",
    };
    if (options.retrievedForMissing === undefined) {
      unrepaired.push(problem);
      continue;
    }
    const nextMeta: CrawlPageMeta = {
      url: meta?.url || BASE_URL + relPath,
      retrieved: options.retrievedForMissing,
      sha256,
    };
    fs.writeFileSync(metaFilePath, JSON.stringify(nextMeta, null, 2) + "\n");
    repaired.push(problem);
  }
  return { repaired, unrepaired };
}
