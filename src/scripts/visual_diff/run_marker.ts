/**
 * Run marker for visual runs: records what the code looked like when a
 * `./morcus.sh e2e --visual` run started, so `visual-baselines accept` can
 * refuse to accept screenshots taken from different code.
 *
 * The marker is written into Playwright's output directory (`test-results/`)
 * once the run finishes. Playwright empties that directory at the start of
 * every run, so a marker never outlives the results it describes, and an
 * interrupted run leaves none at all.
 *
 * The tree state is `HEAD` plus a hash of every file under {@link TREE_PATHSPEC}
 * that differs from `HEAD` (tracked changes and untracked files). It hashes
 * working-tree content, so staging or unstaging doesn't change it.
 */

import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const RUN_MARKER_FILE = ".visual-run.json";
const RUN_MARKER_VERSION = 1;

/** What can change a screenshot: the app (and its snapshots), and the config. */
export const TREE_PATHSPEC = ["src", "playwright.config.ts"];

export interface TreeState {
  /** `HEAD` commit, or null in a repository without commits. */
  head: string | null;
  /** Hash of the uncommitted changes under {@link TREE_PATHSPEC}. */
  treeHash: string;
}

export interface RunMarker extends TreeState {
  version: number;
  /** Identifies this run; used to key review state in the Inspector. */
  id: string;
  startedAt: string;
  finishedAt?: string;
  /** True if the tree changed while the run was in progress. */
  changedDuringRun?: boolean;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

function nulList(output: string): string[] {
  return output.split("\0").filter((p) => p.length > 0);
}

export function computeTreeState(repoRoot: string): TreeState {
  const root = git(["rev-parse", "--show-toplevel"], repoRoot).trim();
  let head: string | null = null;
  try {
    head = git(["rev-parse", "--verify", "--quiet", "HEAD"], root).trim();
  } catch {
    head = null;
  }
  const changed = new Set<string>(
    nulList(
      git(
        head === null
          ? ["ls-files", "-z", "--", ...TREE_PATHSPEC]
          : [
              "diff",
              "HEAD",
              "--name-only",
              "--no-renames",
              "-z",
              "--",
              ...TREE_PATHSPEC,
            ],
        root
      )
    )
  );
  for (const p of nulList(
    git(
      [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...TREE_PATHSPEC,
      ],
      root
    )
  )) {
    changed.add(p);
  }
  const hash = crypto.createHash("sha256");
  for (const rel of [...changed].sort()) {
    const abs = path.join(root, rel);
    let digest = "deleted";
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      digest = crypto
        .createHash("sha256")
        .update(fs.readFileSync(abs))
        .digest("hex");
    }
    hash.update(`${rel}\0${digest}\n`);
  }
  return { head, treeHash: hash.digest("hex") };
}

function sameTree(a: TreeState, b: TreeState): boolean {
  return a.head === b.head && a.treeHash === b.treeHash;
}

export function writeRunMarker(
  resultsDir: string,
  start: TreeState,
  startedAt: Date,
  end?: TreeState,
  finishedAt: Date = new Date()
): RunMarker {
  const marker: RunMarker = {
    version: RUN_MARKER_VERSION,
    id: crypto
      .createHash("sha256")
      .update(`${startedAt.toISOString()}\0${start.head}\0${start.treeHash}`)
      .digest("hex")
      .slice(0, 16),
    head: start.head,
    treeHash: start.treeHash,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ...(end !== undefined && !sameTree(start, end)
      ? { changedDuringRun: true }
      : {}),
  };
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, RUN_MARKER_FILE),
    JSON.stringify(marker, null, 2) + "\n"
  );
  return marker;
}

export function readRunMarker(resultsDir: string): RunMarker | undefined {
  const file = path.join(resultsDir, RUN_MARKER_FILE);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed: Record<string, unknown> | null = JSON.parse(
      fs.readFileSync(file, "utf-8")
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.version === RUN_MARKER_VERSION &&
      typeof parsed.id === "string" &&
      typeof parsed.treeHash === "string" &&
      typeof parsed.startedAt === "string" &&
      (parsed.head === null || typeof parsed.head === "string")
    ) {
      return {
        version: parsed.version,
        id: parsed.id,
        head: parsed.head,
        treeHash: parsed.treeHash,
        startedAt: parsed.startedAt,
        ...(typeof parsed.finishedAt === "string"
          ? { finishedAt: parsed.finishedAt }
          : {}),
        ...(parsed.changedDuringRun === true ? { changedDuringRun: true } : {}),
      };
    }
  } catch {
    // Treated as missing below.
  }
  return undefined;
}

export type RunCheck =
  | { ok: true; marker: RunMarker }
  | { ok: false; reason: string; marker?: RunMarker };

const RERUN_HINT =
  "Re-run `./morcus.sh e2e --visual --all` and review the new results, or pass --force.";

/**
 * Whether the screenshots in `resultsDir` were taken from the code that is
 * checked out now.
 */
export function checkRunMarker(resultsDir: string, repoRoot: string): RunCheck {
  const rel = path.relative(process.cwd(), resultsDir) || resultsDir;
  const marker = readRunMarker(resultsDir);
  if (marker === undefined) {
    return {
      ok: false,
      reason:
        `No run marker (${path.join(rel, RUN_MARKER_FILE)}), so there's no ` +
        "telling which code these screenshots came from. Markers are written " +
        "by `./morcus.sh e2e --visual` when a run finishes; plain " +
        `\`npx playwright test\` and interrupted runs leave none. ${RERUN_HINT}`,
    };
  }
  if (marker.changedDuringRun) {
    return {
      ok: false,
      marker,
      reason: `The code changed while the run (started ${marker.startedAt}) was in progress. ${RERUN_HINT}`,
    };
  }
  const now = computeTreeState(repoRoot);
  if (now.head !== marker.head) {
    return {
      ok: false,
      marker,
      reason:
        `HEAD moved since the run (${short(marker.head)} → ${short(
          now.head
        )}), so these screenshots may not match the code. ` + RERUN_HINT,
    };
  }
  if (now.treeHash !== marker.treeHash) {
    return {
      ok: false,
      marker,
      reason:
        `Uncommitted changes under ${TREE_PATHSPEC.join(
          ", "
        )} differ from when the run started (${marker.startedAt}), ` +
        `so these screenshots may not match the code. ${RERUN_HINT}`,
    };
  }
  return { ok: true, marker };
}

function short(commit: string | null): string {
  return commit === null ? "(no commit)" : commit.slice(0, 8);
}
