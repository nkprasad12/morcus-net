import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type {
  RawPageMeta,
  SnapshotManifest,
  SnapshotPageEntry,
} from "@/common/thelatinlibrary/snapshot_types";
import {
  decodeHtmlBytes,
  extractRawPageText,
  normalizePagePath,
  scanPageProvenance,
} from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

export const BASE_URL = "https://www.thelatinlibrary.com/";
export const USER_AGENT =
  "MorcusNet/1.0 (+https://morcus.net; Latin philology snapshot)";
export const MIN_REQUEST_DELAY_MS = 2000;

export const HUB_INDEX_PAGES = [
  "index.html",
  "christian.html",
  "medieval.html",
  "neo.html",
  "misc.html",
  "ius.html",
  "bible.html",
] as const;

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
  onProgress?: (msg: string) => void;
}

export interface CrawlSummary {
  fetchedCount: number;
  skippedCount: number;
  unchangedCount: number;
  failedCount: number;
  totalRawPages: number;
  failedPaths: Record<string, string>;
}

interface ExtendedRawPageMeta extends RawPageMeta {
  etag?: string;
  lastModified?: string;
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
 * between every request and sending the required MorcusNet `User-Agent`.
 */
export class RateLimitedFetcher {
  private lastRequestAt = 0;
  private readonly delayMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    delayMs: number = MIN_REQUEST_DELAY_MS,
    fetchFn: typeof fetch = fetch
  ) {
    this.delayMs = delayMs;
    this.fetchFn = fetchFn;
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
    });
  }
}

export function computeSha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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

/**
 * Crawls `https://www.thelatinlibrary.com/` into `rootDir/raw/`, writing
 * verbatim bytes and `.meta.json` sidecars, and builds `rootDir/manifest.json`.
 */
export async function crawlLatinLibrary(
  options: CrawlerOptions
): Promise<CrawlSummary> {
  const {
    rootDir,
    seedPaths = HUB_INDEX_PAGES,
    refresh = false,
    maxPages = Infinity,
    delayMs = MIN_REQUEST_DELAY_MS,
    fetchFn = fetch,
    onProgress,
  } = options;

  const rawDir = path.join(rootDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const statePath = path.join(rootDir, ".crawl_state.json");
  const state = refresh
    ? { visitedPaths: [], failedPaths: {} }
    : loadCrawlState(statePath);

  const visited = new Set<string>(state.visitedPaths.map(normalizePagePath));
  const queued = new Set<string>();
  const queue: string[] = [];
  const discoveredAuthorPage = new Map<string, string>();

  const enqueue = (p: string, fromPage?: string) => {
    const norm = normalizePagePath(p);
    if (!norm || queued.has(norm)) {
      return;
    }
    queued.add(norm);
    queue.push(norm);
    if (
      fromPage &&
      !HUB_INDEX_PAGES.some((p) => p === fromPage) &&
      !discoveredAuthorPage.has(norm)
    ) {
      discoveredAuthorPage.set(norm, fromPage);
    }
  };

  for (const seed of seedPaths) {
    enqueue(seed);
  }

  const fetcher = new RateLimitedFetcher(delayMs, fetchFn);
  let fetchedCount = 0;
  let skippedCount = 0;
  let unchangedCount = 0;

  while (queue.length > 0 && fetchedCount < maxPages) {
    const pagePath = queue.shift()!;
    const rawFilePath = path.join(rawDir, pagePath);
    const metaFilePath = `${rawFilePath}.meta.json`;
    const hasValidOnDisk =
      fs.existsSync(rawFilePath) && fs.existsSync(metaFilePath);

    let htmlBytes: Buffer | null = null;

    if (!refresh && (visited.has(pagePath) || hasValidOnDisk)) {
      skippedCount++;
      if (fs.existsSync(rawFilePath)) {
        htmlBytes = fs.readFileSync(rawFilePath);
      }
      visited.add(pagePath);
    } else {
      const url = BASE_URL + pagePath;
      const extraHeaders: Record<string, string> = {};
      let existingMeta: ExtendedRawPageMeta | null = null;
      if (hasValidOnDisk) {
        try {
          existingMeta = JSON.parse(fs.readFileSync(metaFilePath, "utf8"));
          if (existingMeta?.etag) {
            extraHeaders["If-None-Match"] = existingMeta.etag;
          }
          if (existingMeta?.lastModified) {
            extraHeaders["If-Modified-Since"] = existingMeta.lastModified;
          }
        } catch {
          existingMeta = null;
        }
      }

      let response: Response | null = null;
      let lastError: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetcher.fetch(url, extraHeaders);
          if (response.status >= 500 && attempt === 0) {
            lastError = `HTTP ${response.status}`;
            continue;
          }
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      if (response === null) {
        state.failedPaths[pagePath] = lastError ?? "Network error";
        visited.add(pagePath);
        saveCrawlState(statePath, state);
        continue;
      }

      if (response.status === 304 && hasValidOnDisk) {
        unchangedCount++;
        fetchedCount++;
        htmlBytes = fs.readFileSync(rawFilePath);
        visited.add(pagePath);
      } else if (!response.ok) {
        state.failedPaths[pagePath] = `HTTP ${response.status}`;
        visited.add(pagePath);
        saveCrawlState(statePath, state);
        onProgress?.(`FAILED ${pagePath}: HTTP ${response.status}`);
        continue;
      } else {
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = computeSha256(bytes);
        const today = new Date().toISOString().slice(0, 10);

        if (
          hasValidOnDisk &&
          existingMeta !== null &&
          existingMeta.sha256 === sha256
        ) {
          // Unchanged bytes: do not overwrite `retrieved` in .meta.json.
          unchangedCount++;
        } else {
          fs.mkdirSync(path.dirname(rawFilePath), { recursive: true });
          fs.writeFileSync(rawFilePath, bytes);
          const nextMeta: ExtendedRawPageMeta = {
            url,
            retrieved: today,
            sha256,
          };
          const etag = response.headers.get("etag");
          const lastMod = response.headers.get("last-modified");
          if (etag) nextMeta.etag = etag;
          if (lastMod) nextMeta.lastModified = lastMod;
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
          state.visitedPaths = [...visited];
          saveCrawlState(statePath, state);
          onProgress?.(
            `Fetched ${fetchedCount} (skipped ${skippedCount}, queued ${queue.length})`
          );
        }
      }
    }

    if (htmlBytes !== null) {
      try {
        const { links } = extractRawPageText(decodeHtmlBytes(htmlBytes));
        for (const href of links) {
          const target = resolveInternalHtmlLink(pagePath, href);
          if (target !== null) {
            enqueue(target, pagePath);
          }
        }
      } catch {
        // Non-HTML or malformed body; ignore link extraction.
      }
    }
  }

  state.visitedPaths = [...visited];
  saveCrawlState(statePath, state);

  const manifest = buildManifestFromRaw(rootDir, discoveredAuthorPage);
  fs.writeFileSync(
    path.join(rootDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  return {
    fetchedCount,
    skippedCount,
    unchangedCount,
    failedCount: Object.keys(state.failedPaths).length,
    totalRawPages: Object.keys(manifest).length,
    failedPaths: state.failedPaths,
  };
}

/**
 * Walks `rootDir/raw/` and builds a consolidated `SnapshotManifest`, preserving
 * existing `checks` and `workId` fields from any prior `manifest.json`.
 */
export function buildManifestFromRaw(
  rootDir: string,
  discoveredAuthorPage?: ReadonlyMap<string, string>
): SnapshotManifest {
  const rawDir = path.join(rootDir, "raw");
  const manifestPath = path.join(rootDir, "manifest.json");
  let existingManifest: SnapshotManifest = {};
  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      existingManifest = {};
    }
  }

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
  allFiles.sort();

  const manifest: SnapshotManifest = {};
  for (const relPath of allFiles) {
    const rawFilePath = path.join(rawDir, relPath);
    const metaFilePath = `${rawFilePath}.meta.json`;
    const bytes = fs.readFileSync(rawFilePath);
    const sha256 = computeSha256(bytes);

    let url = BASE_URL + relPath;
    let retrieved = new Date().toISOString().slice(0, 10);
    if (fs.existsSync(metaFilePath)) {
      try {
        const meta: RawPageMeta = JSON.parse(
          fs.readFileSync(metaFilePath, "utf8")
        );
        if (meta.url) url = meta.url;
        if (meta.retrieved) retrieved = meta.retrieved;
        if (meta.sha256 !== sha256) {
          meta.sha256 = sha256;
          fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2) + "\n");
        }
      } catch {
        // Rewrite malformed meta.json
        fs.writeFileSync(
          metaFilePath,
          JSON.stringify({ url, retrieved, sha256 }, null, 2) + "\n"
        );
      }
    } else {
      fs.writeFileSync(
        metaFilePath,
        JSON.stringify({ url, retrieved, sha256 }, null, 2) + "\n"
      );
    }

    let bodyText = "";
    let paragraphsText: string[] = [];
    let title: string | undefined;
    try {
      const extracted = extractRawPageText(decodeHtmlBytes(bytes));
      bodyText = extracted.bodyText;
      paragraphsText = extracted.paragraphsText;
      title = extracted.title;
    } catch {
      bodyText = decodeHtmlBytes(bytes);
    }

    const scan = scanPageProvenance(relPath, bodyText, paragraphsText);
    const prev = existingManifest[relPath];
    const authorPage = discoveredAuthorPage?.get(relPath) ?? prev?.authorPage;

    const entry: SnapshotPageEntry = {
      url,
      retrieved,
      sha256,
      path: relPath,
      ...(title !== undefined ? { title } : {}),
      ...(authorPage !== undefined ? { authorPage } : {}),
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

  return manifest;
}
