/**
 * Helpers for the upstream tests: a throwaway "remote" (bare repo) plus a
 * working clone of it, so the tests exercise real git.
 */

import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

export function sh(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** Writes `files` and commits them; returns the new commit. */
export function commit(
  dir: string,
  message: string,
  files: Record<string, string>
): string {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", message);
  return sh(dir, "rev-parse", "HEAD");
}

export interface Sandbox {
  /** Plays the role of the directory holding morcus-net and the clones. */
  morcusDir: string;
  /** The bare "GitHub" repo; also the source's `repo` URL. */
  remote: string;
  /** A second working copy, for pushing changes "upstream". */
  upstream: string;
  /** The first commit on `main`. */
  base: string;
  cleanup: () => void;
}

/** A bare remote with one commit on `main`, and a scratch working copy. */
export function makeSandbox(): Sandbox {
  const root = mkdtempSync(path.join(tmpdir(), "upstream-test-"));
  const morcusDir = path.join(root, "morcus");
  const remote = path.join(root, "remote.git");
  const upstream = path.join(root, "upstream");
  sh(root, "init", "-q", "--bare", "-b", "main", remote);
  sh(root, "clone", "-q", remote, upstream);
  sh(upstream, "checkout", "-q", "-b", "main");
  const base = commit(upstream, "base", { "data.txt": "a\nb\nc\n" });
  sh(upstream, "push", "-q", "origin", "main");
  mkdirSync(morcusDir);
  return {
    morcusDir,
    remote,
    upstream,
    base,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Clones the sandbox remote to `<morcusDir>/<name>`; returns the clone dir. */
export function cloneInto(sandbox: Sandbox, name: string): string {
  const dir = path.join(sandbox.morcusDir, name);
  sh(sandbox.morcusDir, "clone", "-q", sandbox.remote, dir);
  return dir;
}
