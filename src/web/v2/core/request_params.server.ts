import type { Request } from "express";

/**
 * Normalizes an unknown query parameter value to a string or array of strings.
 * Discards objects, numbers, and non-string array elements.
 */
export function toStringOrArray(val: unknown): string | string[] | undefined {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && val.every((item) => typeof item === "string")) {
    return val;
  }
  return undefined;
}

/**
 * Safely extracts a trimmed string from an unknown query or path parameter.
 * Returns `fallback` (default empty string) if the parameter is missing or not a string.
 */
export function readStringParam(val: unknown, fallback = ""): string {
  if (typeof val === "string") {
    return val.trim();
  }
  return fallback;
}

/**
 * Checks whether the incoming HTTP request is requesting an HTML fragment partial
 * via `format=partial` query param or the client's `X-Requested-With: fetch` header.
 */
export function isPartialRequest(req: Request): boolean {
  return (
    req.query.format === "partial" ||
    req.headers["x-requested-with"] === "fetch"
  );
}

/**
 * Checks whether the incoming request is rendered within an embedded context
 * (such as the reader's dictionary iframe) via explicit query flag, Sec-Fetch-Dest,
 * or Referer header.
 */
export function isEmbeddedRequest(req: Request): boolean {
  return (
    req.query.embedded === "1" ||
    req.headers["sec-fetch-dest"] === "iframe" ||
    req.headers.referer?.includes("embedded=1") === true
  );
}

export interface ReadLimitOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Parses and clamps a numeric `limit` query parameter within positive bounds.
 */
export function readLimit(
  req: Request,
  options: ReadLimitOptions = {}
): number {
  const { defaultLimit = 25, maxLimit = 50000 } = options;
  const raw = req.query.limit;
  const rawStr = typeof raw === "string" ? raw : undefined;
  const parsed = rawStr ? parseInt(rawStr, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, maxLimit)
    : defaultLimit;
}

export interface DictQueryParams {
  dictParam?: string | string[] | null;
  bitmaskParam?: string | null;
  inParam?: string | string[] | null;
}

/**
 * Collects competing dictionary parameters out of a request query (`d`, `dict`, `in`).
 * `d` is a scalar bitmask by construction; if it repeats, the last value wins.
 */
export function readDictParam(req: Request): DictQueryParams {
  const rawD = toStringOrArray(req.query.d);
  const bitmaskParam = Array.isArray(rawD)
    ? rawD[rawD.length - 1] ?? null
    : rawD ?? null;
  return {
    dictParam: toStringOrArray(req.query.dict),
    bitmaskParam,
    inParam: toStringOrArray(req.query.in),
  };
}
