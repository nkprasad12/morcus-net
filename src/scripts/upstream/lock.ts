/**
 * The upstream data lock file: which commit of each ancillary data repo
 * (dictionaries, library texts) builds use.
 *
 * Prod builds fetch exactly the pinned commits (see `prod_build_steps.ts`), so
 * the same morcus-net commit always builds the same data. Local builds read
 * whatever is checked out at each source's `env` path. See `README.md` in this
 * directory for the workflow.
 */

import { readFileSync, writeFileSync } from "fs";
import { envVar } from "@/common/env_vars";

/** Relative to the repo root, which every script runs from. */
export const UPSTREAM_LOCK_FILE = "upstream_sources.lock.json";

/** Every pin has a tag with this prefix on its repo, which keeps it reachable. */
export const PIN_TAG_PREFIX = "morcus-pin/";

export interface UpstreamSource {
  /** The clone URL, e.g. `https://github.com/nkprasad12/lexica.git`. */
  repo: string;
  /** The branch that `upstream pin <source>` (with no ref) pins to. */
  branch: string;
  /** The full commit SHA that builds use. */
  commit: string;
  /** The env var that points local builds at the clone, or `file` in it. */
  env: string;
  /** The file in the repo that `env` points at; unset if it's the root. */
  file?: string;
}

export interface UpstreamLock {
  "//"?: string | string[];
  sources: Record<string, UpstreamSource>;
}

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)\.git$/;
const ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function isFullSha(value: string): boolean {
  return COMMIT_PATTERN.test(value);
}

export function pinTag(commit: string): string {
  return `${PIN_TAG_PREFIX}${commit}`;
}

/** Throws if `lock` is malformed. */
export function validateUpstreamLock(lock: UpstreamLock): void {
  const sources = lock?.sources;
  if (typeof sources !== "object" || sources === null) {
    throw new Error(`${UPSTREAM_LOCK_FILE}: missing "sources"`);
  }
  const envs = new Set<string>();
  for (const [name, source] of Object.entries(sources)) {
    if (typeof source.repo !== "string" || source.repo.length === 0) {
      throw new Error(`${name}: missing repo`);
    }
    if (typeof source.branch !== "string" || source.branch.length === 0) {
      throw new Error(`${name}: missing branch`);
    }
    if (!isFullSha(source.commit ?? "")) {
      throw new Error(`${name}: commit must be a full 40-character SHA`);
    }
    if (!ENV_PATTERN.test(source.env ?? "")) {
      throw new Error(`${name}: env must be an env var name`);
    }
    if (envs.has(source.env)) {
      throw new Error(`${name}: env ${source.env} is used twice`);
    }
    envs.add(source.env);
    if (source.file !== undefined && typeof source.file !== "string") {
      throw new Error(`${name}: file must be a string`);
    }
  }
}

export function readUpstreamLock(path = UPSTREAM_LOCK_FILE): UpstreamLock {
  const lock: UpstreamLock = JSON.parse(readFileSync(path, "utf8"));
  validateUpstreamLock(lock);
  return lock;
}

export function writeUpstreamLock(
  lock: UpstreamLock,
  path = UPSTREAM_LOCK_FILE
): void {
  validateUpstreamLock(lock);
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n");
}

let cachedLock: UpstreamLock | undefined = undefined;

/** The pinned source called `name` in the lock file. */
export function upstreamSource(name: string): UpstreamSource {
  cachedLock = cachedLock ?? readUpstreamLock();
  const source = cachedLock.sources[name];
  if (source === undefined) {
    throw new Error(`No upstream source "${name}" in ${UPSTREAM_LOCK_FILE}`);
  }
  return source;
}

export function isGitHubRepo(url: string): boolean {
  return GITHUB_REPO_PATTERN.test(url);
}

/** The URL of `path` in `source` at its pinned commit. */
export function rawFileUrl(source: UpstreamSource, path: string): string {
  const match = GITHUB_REPO_PATTERN.exec(source.repo);
  if (match === null) {
    throw new Error(`Not a GitHub repo: ${source.repo}`);
  }
  const [, owner, repo] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${source.commit}/${path}`;
}

/** The URL of `path` in the source called `name`, at its pinned commit. */
export function pinnedFileUrl(name: string, path: string): string {
  return rawFileUrl(upstreamSource(name), path);
}

/**
 * The prod build download for a single-file source: its `file` at the pinned
 * commit, saved where its `env` var points.
 */
export function pinnedDownload(name: string): { url: string; path: string } {
  const source = upstreamSource(name);
  if (source.file === undefined) {
    throw new Error(`Upstream source "${name}" has no single file to download`);
  }
  return { url: rawFileUrl(source, source.file), path: envVar(source.env) };
}

/**
 * The SSH URL for a GitHub https URL (`git@github.com:owner/repo.git`), or
 * `undefined` for anything else. Clones made over https often have no
 * credentials for pushing, while SSH keys usually work.
 */
export function githubSshUrl(url: string): string | undefined {
  const match = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(
    url.trim()
  );
  return match === null
    ? undefined
    : `git@github.com:${match[1]}/${match[2]}.git`;
}

/**
 * `owner/repo` (lowercased) for a GitHub URL in https, ssh or scp form, so
 * that remotes can be matched however they were cloned. Other URLs (e.g.
 * local paths in tests) are returned unchanged.
 */
export function canonicalRepo(url: string): string {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(
      url.trim()
    );
  return match === null ? url.trim() : `${match[1]}/${match[2]}`.toLowerCase();
}
