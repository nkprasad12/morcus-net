/**
 * Pre-rendered, pre-compressed static pages.
 *
 * A few UI V2 documents are a function of nothing but the build: the About
 * and Library pages, the Macronizer and External Reader landings, the default
 * Corpus landing, and the dictionary landing for a visitor with default
 * settings (standalone, at the site root, and embedded in the reader's
 * iframe). The build renders them once (`static_pages_seed.server.ts`),
 * compresses them at Brotli q10 and gzip 6, and stores them in
 * `build/pages.db`. The server answers a matching request with a point lookup
 * and no render or compression; anything else takes the dynamic path exactly
 * as before.
 *
 * Correctness rests on two things:
 *
 * - **Keys.** Each route derives a key from the request state that reaches
 *   its HTML, and returns no key for a request that must render dynamically
 *   (a query, a non-default cookie, guest mode, ...). The build step and the
 *   route share the key function, so they can't disagree about what a key
 *   covers.
 * - **The epoch.** A page's only build-specific inputs are `getBuildVersion()`
 *   (`data-version` on `<html>`) and the hashed asset hrefs from
 *   `manifest.json`. The store records the epoch it was built under and is
 *   ignored unless it equals the server's. A dev server's version carries a
 *   per-process nonce, so dev never serves a seed.
 *
 * Why no runtime cache: an in-memory tier only pays off on repeated requests
 * within one server process, and with modest traffic and frequent deploys
 * most keys would be rendered once and discarded. Compression levels follow
 * measurements on these pages: q11 adds 0–2% over q10 for 3–4x the time,
 * q6–q9 gain nothing over q5 (and q9 allocates ~32 MiB regardless of input),
 * and gzip 9 is within 1% of gzip 6 for up to 1.7x the CPU.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { Request, Response } from "express";
import { getV2BuildDir } from "@/bundler/client_build_contract";
import { envVar } from "@/common/env_vars";
import { ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { getBuildVersion } from "@/web/ui/core/server/build_version.server";
import {
  sendPrecompressed,
  toPrecompressedRow,
  type PrecompressedRow,
} from "@/web/ui/core/server/precompressed_json.server";
import { requestTimer } from "@/web/ui/core/server/telemetry.server";

const MANIFEST_FILE = "manifest.json";
/**
 * Everything from the client build that reaches a page: the hashed hrefs
 * (`manifest.json`) and the inlined `critical.*` (fixed names, not in the
 * manifest). Each is digested if present.
 */
const EPOCH_BUILD_FILES = [MANIFEST_FILE, "critical.css", "critical.js"];
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

/** Opened read-only; `undefined` entries fall through to the renderer. */
export interface StaticPageStore {
  /** The epoch the store was built under (see {@link staticPagesEpoch}). */
  readonly epoch: string;
  get(key: string): PrecompressedRow | undefined;
  close(): void;
}

/** `build/pages.db` unless `STATIC_PAGES_DB_PATH` says otherwise. */
export function staticPagesDbPath(): string {
  return envVar("STATIC_PAGES_DB_PATH");
}

/**
 * The epoch a static page is valid for: the build version and a digest of
 * the client build's page inputs (the asset manifest, plus `critical.css`
 * and `critical.js`, which are inlined into every page but have fixed names,
 * so the manifest alone wouldn't see them change). `undefined` when the
 * version or the manifest is missing (no commit id, or the client bundle
 * isn't built), in which case nothing is seeded or served.
 *
 * In a real build the commit already changes with any source change; the
 * digest matters when it doesn't (a local Docker build's constant
 * `SOURCE_VERSION`), and as a guard against serving pages from one bundle
 * with another's hrefs.
 */
export function staticPagesEpoch(): string | undefined {
  const version = getBuildVersion();
  if (version === undefined) return undefined;
  const buildDir = getV2BuildDir();
  if (!fs.existsSync(path.join(buildDir, MANIFEST_FILE))) return undefined;
  const hash = crypto.createHash("sha1");
  for (const name of EPOCH_BUILD_FILES) {
    const file = path.join(buildDir, name);
    hash.update(name);
    hash.update(fs.existsSync(file) ? fs.readFileSync(file) : "");
  }
  return `${version}|${hash.digest("hex")}`;
}

/** Compresses one page for the store: Brotli q10 and gzip 6. */
export function compressStaticPage(html: string): PrecompressedRow {
  const raw = Buffer.from(html, "utf8");
  return {
    br: zlib.brotliCompressSync(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 10,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.byteLength,
      },
    }),
    gzip: zlib.gzipSync(raw, { level: 6 }),
    rawLen: raw.byteLength,
  };
}

/**
 * Writes `pages` (key -> HTML) to a SQLite database at `destination`, tagged
 * with `epoch`. Replaces any existing file.
 */
export function saveStaticPagesDb(
  destination: string,
  epoch: string,
  pages: ReadonlyMap<string, string>
): void {
  const dir = path.dirname(destination);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${destination}${suffix}`;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
  const db = SqliteDb.create(destination);
  // `ReadOnlyDb.getDatabase` asks for WAL on open, which fails on a read-only
  // database that isn't in WAL mode already.
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT NOT NULL); " +
      "CREATE TABLE pages (" +
      "key TEXT PRIMARY KEY ASC, " +
      "br BLOB NOT NULL, " +
      "gzip BLOB NOT NULL, " +
      "rawLen INTEGER NOT NULL" +
      ");"
  );
  const insertMeta = db.prepare("INSERT INTO meta (name, value) VALUES (?, ?)");
  const insertPage = db.prepare(
    "INSERT INTO pages (key, br, gzip, rawLen) VALUES (?, ?, ?, ?)"
  );
  const insertAll = db.transaction(() => {
    insertMeta.run("epoch", epoch);
    for (const [key, html] of pages) {
      const row = compressStaticPage(html);
      insertPage.run(key, row.br, row.gzip, row.rawLen);
    }
  });
  insertAll();
  db.close();
}

function readEpoch(db: ReturnType<typeof ReadOnlyDb.getDatabase>): string {
  const row: unknown = db
    .prepare("SELECT value FROM meta WHERE name = 'epoch'")
    .get();
  return typeof row === "object" &&
    row !== null &&
    "value" in row &&
    typeof row.value === "string"
    ? row.value
    : "";
}

/**
 * Opens the static pages database for point lookups, or returns `undefined`
 * (with a log line) if it is missing or was built under a different epoch
 * than this server's.
 *
 * `expectedEpoch` defaults to {@link staticPagesEpoch}; a server with no
 * epoch (dev without a commit id, or no bundle) never opens a store.
 */
export function openStaticPagesDb(
  dbPath: string = staticPagesDbPath(),
  expectedEpoch: string | undefined = staticPagesEpoch()
): StaticPageStore | undefined {
  if (!fs.existsSync(dbPath)) {
    return undefined;
  }
  if (expectedEpoch === undefined) {
    console.log(`Ignoring ${dbPath}: this server has no build epoch.`);
    return undefined;
  }
  // Nothing below may throw out: a bad store must cost the renderer path,
  // not the server start.
  let opened: ReturnType<typeof openForLookup>;
  try {
    opened = openForLookup(dbPath);
  } catch (err) {
    console.error(`Ignoring ${dbPath}: unreadable.`, err);
    return undefined;
  }
  const { db, epoch, selectByKey } = opened;
  if (epoch !== expectedEpoch) {
    db.close();
    console.log(
      `Ignoring ${dbPath}: built for epoch ${epoch}, server is ${expectedEpoch}.`
    );
    return undefined;
  }
  return {
    epoch,
    get(key: string): PrecompressedRow | undefined {
      return toPrecompressedRow(selectByKey.get(key));
    },
    close(): void {
      db.close();
    },
  };
}

/** Opens `dbPath` and prepares its lookup, closing it again if that fails. */
function openForLookup(dbPath: string) {
  const db = ReadOnlyDb.getDatabase(dbPath);
  try {
    return {
      db,
      epoch: readEpoch(db),
      selectByKey: db.prepare(
        "SELECT br, gzip, rawLen FROM pages WHERE key = ?"
      ),
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/** Phase mark on the request's telemetry row for a page served from the store. */
export const STATIC_PAGE_MARK = "staticPage";

/**
 * Sends the page for `key` from `store` if both exist, else renders and
 * sends it. With no store or no key this is exactly `res.send(await render())`.
 *
 * Only `GET` and `HEAD` consult the store, and only a handler that has
 * decided the response is an ordinary 200 page should call this: redirects,
 * cookies, errors and partials are decided before, by the route.
 */
export async function sendStaticPageOr(
  req: Request,
  res: Response,
  store: StaticPageStore | undefined,
  key: string | undefined,
  render: () => string | Promise<string>
): Promise<void> {
  if (
    store !== undefined &&
    key !== undefined &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    const row = store.get(key);
    if (row !== undefined) {
      requestTimer(res).mark(STATIC_PAGE_MARK);
      sendPrecompressed(req, res, row, HTML_CONTENT_TYPE);
      return;
    }
  }
  res.send(await render());
}
