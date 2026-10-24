/**
 * Local clones of the upstream data repos: where they are, how they compare
 * to the pins, and moving them to the pins without touching local work.
 *
 * `upstream sync` owns one branch per clone, {@link PINNED_BRANCH}. It only
 * moves a clone when nothing local could be lost: the clone is on that branch,
 * the tracked branch, the remote's default branch or a detached HEAD; it has
 * no uncommitted changes; and none of its commits exist only locally. Anything
 * else is reported and left alone.
 */

import { existsSync, realpathSync } from "fs";
import path from "path";
import chalk from "chalk";
import {
  readUpstreamLock,
  type UpstreamLock,
  type UpstreamSource,
} from "@/scripts/upstream/lock";
import {
  countCommits,
  countLocalOnlyCommits,
  currentBranch,
  ensureCommit,
  findRemote,
  git,
  hasCommit,
  isDirty,
  remoteDefaultBranch,
  tryGit,
} from "@/scripts/upstream/git";

/** The local branch that `upstream sync` creates and moves to each pin. */
export const PINNED_BRANCH = "morcus-pinned";

/** The directory holding morcus-net and the data clones (`set_up_or_update.sh`). */
export function defaultMorcusDir(): string {
  return path.dirname(process.cwd());
}

export type CloneLocation =
  | {
      kind: "clone";
      dir: string;
      /** The env var points somewhere other than the default clone. */
      custom: boolean;
      /** The env var isn't set; this is the default clone. */
      envUnset: boolean;
    }
  | { kind: "missing"; path: string }
  | { kind: "not-a-clone"; path: string };

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

function realOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** The clone whose root is exactly `dir`, if any. */
function gitRoot(dir: string): string | undefined {
  const result = tryGit(dir, ["rev-parse", "--show-toplevel"]);
  return result.ok && samePath(result.stdout, dir) ? result.stdout : undefined;
}

/**
 * The clone containing `dir`, if any, unless that "clone" also contains the
 * morcus directory (e.g. a dotfiles repo in the home directory), which would
 * make a loose file look like it's in a clone.
 */
function enclosingGitRoot(dir: string, morcusDir: string): string | undefined {
  const result = tryGit(dir, ["rev-parse", "--show-toplevel"]);
  if (!result.ok) return undefined;
  const fromRoot = path.relative(
    realOrResolved(result.stdout),
    realOrResolved(morcusDir)
  );
  const containsMorcusDir =
    !fromRoot.startsWith("..") && !path.isAbsolute(fromRoot);
  return containsMorcusDir ? undefined : result.stdout;
}

/** Finds the clone that local builds use for `source`. */
export function locateClone(
  name: string,
  source: UpstreamSource,
  env: NodeJS.ProcessEnv = process.env,
  morcusDir: string = defaultMorcusDir()
): CloneLocation {
  const defaultDir = path.join(morcusDir, name);
  const envValue = env[source.env];
  if (envValue === undefined || envValue === "") {
    if (existsSync(defaultDir) && gitRoot(defaultDir) !== undefined) {
      return { kind: "clone", dir: defaultDir, custom: false, envUnset: true };
    }
    return { kind: "missing", path: defaultDir };
  }
  const file = source.file;
  // Usually the env var is `<clone>/<file>` (or the clone itself), so the
  // clone's root is known exactly. If it points at some other file, find the
  // clone that contains it instead.
  const expected =
    file === undefined
      ? envValue
      : envValue.endsWith(`/${file}`)
      ? envValue.slice(0, envValue.length - file.length - 1)
      : undefined;
  const root = expected ?? path.dirname(envValue);
  if (!existsSync(root)) {
    return { kind: "missing", path: envValue };
  }
  const dir =
    expected !== undefined ? gitRoot(root) : enclosingGitRoot(root, morcusDir);
  if (dir === undefined) {
    return { kind: "not-a-clone", path: envValue };
  }
  return {
    kind: "clone",
    dir,
    custom: !existsSync(defaultDir) || !samePath(dir, defaultDir),
    envUnset: false,
  };
}

export interface CloneState {
  dir: string;
  custom: boolean;
  branch: string | undefined;
  dirty: boolean;
  /** Whether the pinned commit is in the clone at all. */
  pinAvailable: boolean;
  /** Commits in HEAD but not the pin, and vice versa (if the pin is available). */
  ahead: number;
  behind: number;
}

export type CloneStatus =
  | { name: string; location: Exclude<CloneLocation, { kind: "clone" }> }
  | {
      name: string;
      location: CloneLocation & { kind: "clone" };
      state: CloneState;
    };

export function cloneState(
  dir: string,
  custom: boolean,
  pin: string
): CloneState {
  const pinAvailable = hasCommit(dir, pin);
  return {
    dir,
    custom,
    branch: currentBranch(dir),
    dirty: isDirty(dir),
    pinAvailable,
    ahead: pinAvailable ? countCommits(dir, `${pin}..HEAD`) : 0,
    behind: pinAvailable ? countCommits(dir, `HEAD..${pin}`) : 0,
  };
}

/** The status of every source's clone. Offline: never fetches. */
export function cloneStatuses(
  lock: UpstreamLock = readUpstreamLock(),
  env: NodeJS.ProcessEnv = process.env,
  morcusDir: string = defaultMorcusDir()
): CloneStatus[] {
  return Object.entries(lock.sources).map(([name, source]) => {
    const location = locateClone(name, source, env, morcusDir);
    if (location.kind !== "clone") return { name, location };
    return {
      name,
      location,
      state: cloneState(location.dir, location.custom, source.commit),
    };
  });
}

/** Whether a clone has exactly the pinned data checked out. */
export function isAtPin(status: CloneStatus): boolean {
  return (
    "state" in status &&
    status.state.pinAvailable &&
    status.state.ahead === 0 &&
    status.state.behind === 0 &&
    !status.state.dirty
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A one-line description of `status`, without the source name. */
export function describeStatus(status: CloneStatus): string {
  if (!("state" in status)) {
    return status.location.kind === "missing"
      ? `missing (${status.location.path}); run set_up_or_update.sh`
      : `not a git clone (${status.location.path}); remove its env var from .env and rerun set_up_or_update.sh to manage it`;
  }
  const { state } = status;
  const parts: string[] = [];
  if (!state.pinAvailable) {
    parts.push("pin not fetched; run `./morcus.sh upstream sync`");
  } else if (state.ahead === 0 && state.behind === 0) {
    parts.push("at pin");
  } else {
    const relation = [
      state.ahead > 0 ? `${state.ahead} ahead of` : "",
      state.behind > 0 ? `${state.behind} behind` : "",
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`${relation} pin`);
  }
  parts.push(state.branch === undefined ? "detached" : `on '${state.branch}'`);
  if (state.dirty) parts.push("uncommitted changes");
  if (state.custom) parts.push(`custom path ${state.dir}`);
  if (status.location.envUnset) parts.push("env var not set");
  return parts.join(", ");
}

export interface SyncInputs {
  branch: string | undefined;
  /** Branches sync may move off: see the module comment. */
  managedBranches: ReadonlySet<string>;
  dirty: boolean;
  headIsPin: boolean;
  /** Commits in HEAD that exist only locally. */
  localOnlyInHead: number;
  /** Commits on the existing {@link PINNED_BRANCH} that exist only locally. */
  localOnlyInPinnedBranch: number;
}

export type SyncDecision =
  | { action: "none" }
  | { action: "move" }
  | { action: "leave"; reason: string };

/** What `upstream sync` does with a clone. Never loses local work. */
export function decideSync(inputs: SyncInputs): SyncDecision {
  if (inputs.headIsPin && inputs.branch === PINNED_BRANCH) {
    return { action: "none" };
  }
  if (
    inputs.branch !== undefined &&
    !inputs.managedBranches.has(inputs.branch)
  ) {
    return { action: "leave", reason: `on your branch '${inputs.branch}'` };
  }
  if (inputs.dirty) {
    return { action: "leave", reason: "has uncommitted changes" };
  }
  if (inputs.localOnlyInHead > 0) {
    return {
      action: "leave",
      reason: `has ${plural(
        inputs.localOnlyInHead,
        "commit"
      )} that exist only locally`,
    };
  }
  if (inputs.localOnlyInPinnedBranch > 0) {
    return {
      action: "leave",
      reason: `'${PINNED_BRANCH}' has ${plural(
        inputs.localOnlyInPinnedBranch,
        "commit"
      )} that exist only locally`,
    };
  }
  return { action: "move" };
}

export interface SyncResult {
  name: string;
  outcome: "ok" | "moved" | "left" | "error";
  message: string;
}

/** Moves one clone to its pin if that's safe; see {@link decideSync}. */
export function syncClone(
  name: string,
  source: UpstreamSource,
  env: NodeJS.ProcessEnv = process.env,
  morcusDir: string = defaultMorcusDir()
): SyncResult {
  const location = locateClone(name, source, env, morcusDir);
  if (location.kind !== "clone") {
    // Not ours to fix here; `set_up_or_update.sh` creates the clones.
    return {
      name,
      outcome: "left",
      message: describeStatus({ name, location }),
    };
  }
  const { dir } = location;
  const pin = source.commit;
  const short = pin.slice(0, 7);
  const remote = findRemote(dir, source.repo) ?? source.repo;
  if (!ensureCommit(dir, remote, pin)) {
    return {
      name,
      outcome: "error",
      message: `pin ${short} isn't available (fetch from ${remote} failed)`,
    };
  }
  if (location.custom) {
    const state = cloneState(dir, true, pin);
    const description = describeStatus({ name, location, state });
    return { name, outcome: "left", message: `${description}; not managed` };
  }
  const branch = currentBranch(dir);
  const managed = new Set([PINNED_BRANCH, source.branch]);
  const remoteName = findRemote(dir, source.repo);
  const defaultBranch =
    remoteName === undefined ? undefined : remoteDefaultBranch(dir, remoteName);
  if (defaultBranch !== undefined) managed.add(defaultBranch);
  const pinnedBranchExists = tryGit(dir, [
    "rev-parse",
    "--verify",
    "-q",
    `refs/heads/${PINNED_BRANCH}`,
  ]).ok;
  const decision = decideSync({
    branch,
    managedBranches: managed,
    dirty: isDirty(dir),
    headIsPin: git(dir, ["rev-parse", "HEAD"]) === pin,
    localOnlyInHead: countLocalOnlyCommits(dir, "HEAD"),
    localOnlyInPinnedBranch:
      pinnedBranchExists && branch !== PINNED_BRANCH
        ? countLocalOnlyCommits(dir, `refs/heads/${PINNED_BRANCH}`)
        : 0,
  });
  if (decision.action === "none") {
    const dirty = isDirty(dir) ? ", with uncommitted changes" : "";
    return { name, outcome: "ok", message: `at pin ${short}${dirty}` };
  }
  if (decision.action === "leave") {
    const state = cloneState(dir, false, pin);
    return {
      name,
      outcome: "left",
      message: `${decision.reason}; leaving it (${describeStatus({
        name,
        location,
        state,
      })})`,
    };
  }
  const moved = tryGit(dir, ["checkout", "-q", "-B", PINNED_BRANCH, pin]);
  if (!moved.ok) {
    return {
      name,
      outcome: "error",
      message: `couldn't check out ${short}: ${moved.stderr}`,
    };
  }
  return {
    name,
    outcome: "moved",
    message: `moved '${PINNED_BRANCH}' to pin ${short}`,
  };
}

/** `./morcus.sh upstream sync`. Returns false if any clone had an error. */
export function syncAll(names: string[] = []): boolean {
  const lock = readUpstreamLock();
  const targets = names.length > 0 ? names : Object.keys(lock.sources);
  let ok = true;
  for (const name of targets) {
    const source = lock.sources[name];
    if (source === undefined) {
      console.log(chalk.red(`${name}: no such source`));
      ok = false;
      continue;
    }
    const result = syncClone(name, source);
    const color =
      result.outcome === "error"
        ? chalk.red
        : result.outcome === "left"
        ? chalk.yellow
        : chalk.green;
    console.log(color(`${name.padEnd(24)}${result.message}`));
    ok &&= result.outcome !== "error";
  }
  return ok;
}

/** `./morcus.sh upstream status`. Offline. */
export function printStatus(): void {
  for (const status of cloneStatuses()) {
    const color = isAtPin(status) ? chalk.green : chalk.yellow;
    console.log(color(`${status.name.padEnd(24)}${describeStatus(status)}`));
  }
}

/**
 * Warns when local data differs from the pins that prod builds use. Offline
 * and never throws: a local build shouldn't fail over a warning.
 */
export function warnOnUpstreamDrift(): void {
  try {
    const drifted = cloneStatuses().filter((status) => !isAtPin(status));
    if (drifted.length === 0) return;
    console.log(
      chalk.yellow(
        "Local data differs from the pinned upstream sources that prod builds use:"
      )
    );
    for (const status of drifted) {
      console.log(chalk.yellow(`  ${status.name}: ${describeStatus(status)}`));
    }
    console.log(
      chalk.yellow(
        "See `./morcus.sh upstream status` and src/scripts/upstream/README.md."
      )
    );
  } catch (err) {
    console.log(chalk.yellow(`Couldn't check upstream data clones: ${err}`));
  }
}
