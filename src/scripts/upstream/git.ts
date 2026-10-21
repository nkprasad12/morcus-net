/** Small synchronous git helpers for the upstream tooling. */

import { spawnSync } from "child_process";
import { canonicalRepo } from "@/scripts/upstream/lock";

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Runs `git -C <dir> <args>` and never throws. */
export function tryGit(dir: string, args: string[]): GitResult {
  const result = spawnSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    // Never block on a credential prompt; fail instead.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

/** Runs `git -C <dir> <args>` and returns stdout, throwing on failure. */
export function git(dir: string, args: string[]): string {
  const result = tryGit(dir, args);
  if (!result.ok) {
    throw new Error(
      `git ${args.join(" ")} (in ${dir}) failed: ${result.stderr}`
    );
  }
  return result.stdout;
}

export function hasCommit(dir: string, sha: string): boolean {
  return tryGit(dir, ["cat-file", "-e", `${sha}^{commit}`]).ok;
}

export function isAncestor(dir: string, ancestor: string, of: string): boolean {
  return tryGit(dir, ["merge-base", "--is-ancestor", ancestor, of]).ok;
}

/** The current branch, or `undefined` for a detached HEAD. */
export function currentBranch(dir: string): string | undefined {
  const result = tryGit(dir, ["symbolic-ref", "-q", "--short", "HEAD"]);
  return result.ok && result.stdout.length > 0 ? result.stdout : undefined;
}

/** Whether tracked files have uncommitted changes. Untracked files don't count. */
export function isDirty(dir: string): boolean {
  return git(dir, ["status", "--porcelain", "--untracked-files=no"]) !== "";
}

/** How many commits in `rev` are on no remote-tracking branch and no tag. */
export function countLocalOnlyCommits(dir: string, rev: string): number {
  return Number(
    git(dir, ["rev-list", "--count", rev, "--not", "--remotes", "--tags"])
  );
}

export function countCommits(dir: string, range: string): number {
  return Number(git(dir, ["rev-list", "--count", range]));
}

/** The name of the remote in `dir` whose URL is `repoUrl`, if any. */
export function findRemote(dir: string, repoUrl: string): string | undefined {
  const wanted = canonicalRepo(repoUrl);
  const remotes = tryGit(dir, ["remote"]).stdout.split("\n").filter(Boolean);
  // Prefer `origin` when several remotes match.
  remotes.sort((a, b) => Number(b === "origin") - Number(a === "origin"));
  return remotes.find((remote) => {
    const url = tryGit(dir, ["remote", "get-url", remote]).stdout;
    return url.length > 0 && canonicalRepo(url) === wanted;
  });
}

/** The branch `refs/remotes/<remote>/HEAD` points at, if known. */
export function remoteDefaultBranch(
  dir: string,
  remote: string
): string | undefined {
  const result = tryGit(dir, [
    "symbolic-ref",
    "-q",
    "--short",
    `refs/remotes/${remote}/HEAD`,
  ]);
  return result.ok ? result.stdout.replace(`${remote}/`, "") : undefined;
}

/**
 * Makes `sha` available in `dir`, fetching from `remote` if needed. Returns
 * whether it is available.
 */
export function ensureCommit(
  dir: string,
  remote: string,
  sha: string
): boolean {
  if (hasCommit(dir, sha)) return true;
  tryGit(dir, ["fetch", "-q", remote, "--tags"]);
  if (hasCommit(dir, sha)) return true;
  tryGit(dir, ["fetch", "-q", remote, sha]);
  return hasCommit(dir, sha);
}

export type ContentCheck =
  | { kind: "same" }
  | { kind: "descendant" }
  | { kind: "contains" }
  | { kind: "drops"; diffstat: string }
  | { kind: "conflicts" };

/**
 * Whether `newPin` still has everything `oldPin` had: would merging `oldPin`
 * into `newPin` change anything? Unlike an ancestry check, this passes when
 * upstream squash- or rebase-merged our commits, since their changes are
 * already there under other SHAs. Both commits must be available in `dir`.
 */
export function checkContainsContent(
  dir: string,
  oldPin: string,
  newPin: string
): ContentCheck {
  if (oldPin === newPin) return { kind: "same" };
  if (isAncestor(dir, oldPin, newPin)) return { kind: "descendant" };
  // Exits 1 (and prints the tree first, then conflict info) on conflicts.
  const merged = tryGit(dir, ["merge-tree", "--write-tree", newPin, oldPin]);
  if (!merged.ok) {
    if (/usage|unknown option/i.test(merged.stderr)) {
      throw new Error("`git merge-tree --write-tree` needs git 2.38 or newer.");
    }
    return { kind: "conflicts" };
  }
  const mergedTree = merged.stdout.split("\n")[0];
  if (mergedTree === git(dir, ["rev-parse", `${newPin}^{tree}`])) {
    return { kind: "contains" };
  }
  return {
    kind: "drops",
    diffstat: git(dir, ["diff", "--stat", newPin, mergedTree]),
  };
}
