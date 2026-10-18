import { existsSync, readFileSync } from "fs";
import type { Request, Response } from "express";

/**
 * `Cache-Control` for a response that never changes at its URL: content-hashed
 * assets, or API responses whose URL carries the build version. One year is
 * the conventional maximum; longer buys nothing.
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Set by `./morcus.sh web` on the server it starts. Each start of a dev server
 * then gets its own build version (see {@link getBuildVersion}).
 */
export const DEV_SERVER_ENV = "MORCUS_DEV_SERVER";

/** Set by `start_server.ts` from {@link loadBuildId}. */
export const BUILD_ID_ENV = "BUILD_ID";

/** Written by the last step of a production build (`build_provenance.ts`). */
export const BUILD_PROVENANCE_FILE = "build/morcusnet.build.json";

/** The contents of {@link BUILD_PROVENANCE_FILE}. */
export interface BuildProvenance {
  /** The morcus-net commit, as in `morcusnet.commit.txt`. */
  readonly commit: string;
  /**
   * Every external input the build fetched, keyed by URL: `blob:<sha1>` (the
   * git blob ID of a downloaded file) or `commit:<sha1>` (a cloned repo's
   * HEAD), so each can be looked up in its upstream repository.
   */
  readonly inputs: Readonly<Record<string, string>>;
  /** A short hash over `commit` and `inputs`; see `computeBuildId`. */
  readonly buildId: string;
}

/**
 * The build ID from a provenance file, or `undefined` when there is no file,
 * it is malformed, or it was written for a different commit (a leftover from
 * an earlier build). Never throws: without it the server falls back to the
 * commit.
 */
export function loadBuildId(
  commit: string | undefined,
  path: string = BUILD_PROVENANCE_FILE
): string | undefined {
  if (commit === undefined || !existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "commit" in parsed &&
      "buildId" in parsed &&
      parsed.commit === commit &&
      typeof parsed.buildId === "string" &&
      parsed.buildId.length > 0
    ) {
      return parsed.buildId;
    }
    console.warn(`Ignoring ${path}: not written for commit ${commit}.`);
  } catch (err) {
    console.warn(`Ignoring unreadable ${path}:`, err);
  }
  return undefined;
}

/** Distinguishes one server process from another; see {@link getBuildVersion}. */
const PROCESS_NONCE = Date.now().toString(36);

/**
 * The commit this server was built from, or `undefined` for a build without
 * git metadata. For display and reports; cache keys use
 * {@link getBuildVersion}, which can differ.
 *
 * `start_server.ts` sets `COMMIT_ID` (trimmed) at startup. Read it through
 * this function rather than `process.env` directly, so every caller treats an
 * unset or empty value the same way. `override` is for tests.
 */
export function getCommitId(override?: string): string | undefined {
  return (override ?? process.env.COMMIT_ID) || undefined;
}

/**
 * The version that `?v=` URLs are cached under, or `undefined` when there is
 * none (no caching). Opaque: compare it, never parse it.
 *
 * In production this is the build ID (`BUILD_ID_ENV`), which also covers the
 * upstream data the build downloaded, so rebuilding the same commit against
 * newer data is a new version. Without one it is the commit
 * ({@link getCommitId}). A dev server (`DEV_SERVER_ENV`) adds a per-process
 * nonce: uncommitted server changes need a restart to take effect, and the
 * restart must not serve markup the browser cached from the previous process.
 * `override` is for tests.
 */
export function getBuildVersion(override?: string): string | undefined {
  if (override !== undefined) return override || undefined;
  const base = process.env[BUILD_ID_ENV] || getCommitId();
  if (base === undefined) return undefined;
  return process.env[DEV_SERVER_ENV] ? `${base}-dev.${PROCESS_NONCE}` : base;
}

interface VersionedCacheOptions {
  /**
   * `public` (default) lets shared caches store the response; `private`
   * keeps it in the browser. Use `private` for HTML partials.
   */
  readonly scope?: "public" | "private";
  /** Overrides {@link getBuildVersion} (tests). */
  readonly buildVersion?: string;
}

/**
 * Sets `Cache-Control` for a response whose URL may carry the build version
 * as `?v=<version>`. Only the *current* version is cached as immutable: a tab
 * left open across a deploy still asks for `?v=<old>`, and caching today's
 * response under that key forever would be wrong. Anything else revalidates.
 *
 * Call it only on the success path, once the body is known to be good, and
 * only for responses that depend on nothing but the URL (no cookies).
 */
export function setVersionedCacheControl(
  req: Request,
  res: Response,
  options: VersionedCacheOptions = {}
): void {
  const buildVersion = getBuildVersion(options.buildVersion);
  const isCurrent = buildVersion !== undefined && req.query.v === buildVersion;
  const scope = options.scope ?? "public";
  res.setHeader(
    "Cache-Control",
    isCurrent ? `${scope}, max-age=31536000, immutable` : "no-cache"
  );
}
