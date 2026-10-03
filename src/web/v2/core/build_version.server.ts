import type { Request, Response } from "express";

/**
 * `Cache-Control` for a response that never changes at its URL: content-hashed
 * assets, or API responses whose URL carries the build version. One year is
 * the conventional maximum; longer buys nothing.
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * The commit this server was built from, or `undefined` for a dev build.
 *
 * `start_server.ts` sets `COMMIT_ID` (trimmed) at startup. Read it through
 * this function rather than `process.env` directly, so every caller treats an
 * unset or empty value the same way. `override` is for tests.
 */
export function getBuildVersion(override?: string): string | undefined {
  return (override ?? process.env.COMMIT_ID) || undefined;
}

/**
 * Sets `Cache-Control` for a response whose URL may carry the build version
 * as `?v=<commit>`. Only the *current* version is cached as immutable: a tab
 * left open across a deploy still asks for `?v=<old>`, and caching today's
 * response under that key forever would be wrong. Anything else revalidates.
 */
export function setVersionedCacheControl(
  req: Request,
  res: Response,
  buildVersion: string | undefined = getBuildVersion()
): void {
  const isCurrent = buildVersion !== undefined && req.query.v === buildVersion;
  res.setHeader(
    "Cache-Control",
    isCurrent ? IMMUTABLE_CACHE_CONTROL : "no-cache"
  );
}
