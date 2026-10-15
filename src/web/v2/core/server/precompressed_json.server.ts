import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { Request, Response } from "express";
import { ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import { recordUncompressedLength } from "@/web/v2/core/server/telemetry.server";

/**
 * A JSON response pre-compressed at build time with Brotli (`quality 10`) and
 * gzip (`level 9`), stored alongside its uncompressed byte length.
 */
export interface PrecompressedJsonRow {
  readonly br: Buffer;
  readonly gzip: Buffer;
  readonly rawLen: number;
}

/** Key-value lookup over pre-compressed JSON payloads. */
export interface PrecompressedJsonStore {
  get(key: string): PrecompressedJsonRow | undefined;
  close(): void;
}

/** Compresses a UTF-8 JSON string into `{ br, gzip, rawLen }` for SQLite storage. */
export function precompressJson(json: string): PrecompressedJsonRow {
  const raw = Buffer.from(json, "utf8");
  return {
    br: zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 10 },
    }),
    gzip: zlib.gzipSync(raw, { level: 9 }),
    rawLen: raw.byteLength,
  };
}

/**
 * Writes a `Map<key, jsonString>` to a SQLite database at `destination`,
 * pre-compressing each entry with Brotli (`quality 10`) and gzip (`level 9`).
 */
export function savePrecompressedJsonDb(
  destination: string,
  entries: ReadonlyMap<string, string>
): void {
  const start = performance.now();
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
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE chunks (" +
      "key TEXT PRIMARY KEY ASC, " +
      "br BLOB NOT NULL, " +
      "gzip BLOB NOT NULL, " +
      "rawLen INTEGER NOT NULL" +
      ");"
  );
  const insert = db.prepare(
    "INSERT INTO chunks (key, br, gzip, rawLen) VALUES (?, ?, ?, ?)"
  );
  const insertAll = db.transaction(() => {
    for (const [key, json] of entries) {
      const row = precompressJson(json);
      insert.run(key, row.br, row.gzip, row.rawLen);
    }
  });
  insertAll();
  db.close();
  console.debug(
    `Saved ${
      entries.size
    } pre-compressed JSON chunks to ${destination} in ${Math.round(
      performance.now() - start
    )} ms`
  );
}

function isPrecompressedRow(value: unknown): value is {
  br: Buffer | Uint8Array;
  gzip: Buffer | Uint8Array;
  rawLen: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "br" in value &&
    (Buffer.isBuffer(value.br) || value.br instanceof Uint8Array) &&
    "gzip" in value &&
    (Buffer.isBuffer(value.gzip) || value.gzip instanceof Uint8Array) &&
    "rawLen" in value &&
    typeof value.rawLen === "number"
  );
}

/**
 * Opens a pre-compressed JSON SQLite database for read-only point lookups, or
 * returns `undefined` if `dbPath` has not been built.
 */
export function openPrecompressedJsonDb(
  dbPath: string
): PrecompressedJsonStore | undefined {
  if (!fs.existsSync(dbPath)) {
    return undefined;
  }
  const db = ReadOnlyDb.getDatabase(dbPath);
  const selectByKey = db.prepare(
    "SELECT br, gzip, rawLen FROM chunks WHERE key = ?"
  );
  return {
    get(key: string): PrecompressedJsonRow | undefined {
      const row: unknown = selectByKey.get(key);
      if (!isPrecompressedRow(row)) {
        return undefined;
      }
      return {
        br: Buffer.isBuffer(row.br) ? row.br : Buffer.from(row.br),
        gzip: Buffer.isBuffer(row.gzip) ? row.gzip : Buffer.from(row.gzip),
        rawLen: row.rawLen,
      };
    },
    close(): void {
      db.close();
    },
  };
}

/**
 * Builds an in-memory `PrecompressedJsonStore` that lazily compresses entries
 * on first access (used when tests inject an in-memory map).
 */
export function createInMemoryPrecompressedStore(
  entries: ReadonlyMap<string, string>
): PrecompressedJsonStore {
  const cache = new Map<string, PrecompressedJsonRow>();
  return {
    get(key: string): PrecompressedJsonRow | undefined {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
      const json = entries.get(key);
      if (json === undefined) {
        return undefined;
      }
      const row = precompressJson(json);
      cache.set(key, row);
      return row;
    },
    close(): void {
      cache.clear();
    },
  };
}

/**
 * Sends a pre-compressed JSON payload, preferring Brotli over gzip as
 * `preCompressedMiddleware` (`web_server.ts`) does. If the client rejects both
 * (`Accept-Encoding: identity`), falls back to gunzipping `row.gzip`.
 */
export function sendPrecompressedJson(
  req: Request,
  res: Response,
  row: PrecompressedJsonRow
): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Vary", "Accept-Encoding");
  recordUncompressedLength(res, row.rawLen);

  if (req.acceptsEncodings("br") === "br") {
    res.setHeader("Content-Encoding", "br");
    res.setHeader(PRECOMPRESSED_HEADER, "1");
    res.send(row.br);
    return;
  }
  if (req.acceptsEncodings("gzip") === "gzip") {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader(PRECOMPRESSED_HEADER, "1");
    res.send(row.gzip);
    return;
  }
  res.send(zlib.gunzipSync(row.gzip));
}
