/**
 * `./morcus.sh upstream pin` and `upstream tag`: the only ways pins change.
 *
 * Pinning checks, for each source, that the new commit:
 * - is on the source's repo (not just a local clone),
 * - still has everything the current pin had ({@link checkContainsContent}),
 *   unless `--allow-drop`. This guards against switching to a commit that
 *   doesn't build on the current pin. When the new commit does build on it,
 *   later changes (including reverts) count as intended, so they're only
 *   shown in the summary below, and
 * - doesn't bring in a surprising number of commits (asks above a threshold).
 *
 * It then pushes a `morcus-pin/<sha>` tag so the commit stays reachable whatever
 * happens to its branch, and rewrites the lock file. Nothing changes unless
 * every requested source passes.
 */

import { createInterface } from "readline/promises";
import chalk from "chalk";
import {
  githubSshUrl,
  pinTag,
  readUpstreamLock,
  UPSTREAM_LOCK_FILE,
  writeUpstreamLock,
  type UpstreamSource,
} from "@/scripts/upstream/lock";
import {
  caseMismatchHint,
  defaultMorcusDir,
  locateClone,
} from "@/scripts/upstream/clones";
import {
  checkContainsContent,
  countCommits,
  ensureCommit,
  findRemote,
  git,
  isAncestor,
  tryGit,
} from "@/scripts/upstream/git";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Above this many new commits, `pin` asks before continuing. */
export const CONFIRM_ABOVE_COMMITS = 5;

export interface PinRequest {
  name: string;
  /** A branch, tag or SHA; unset means the source's tracked branch. */
  ref?: string;
}

/** Parses `<source>[@<ref>]`. */
export function parsePinRequest(arg: string): PinRequest {
  const at = arg.indexOf("@");
  if (at < 0) return { name: arg };
  const ref = arg.slice(at + 1);
  if (ref === "") throw new Error(`Missing ref after '@' in '${arg}'`);
  return { name: arg.slice(0, at), ref };
}

export interface PinOptions {
  allowDrop?: boolean;
  /** Skip the confirmation for large changes. */
  yes?: boolean;
  /** Check everything, but push no tags and leave the lock file alone. */
  dryRun?: boolean;
  lockPath?: string;
  env?: NodeJS.ProcessEnv;
  morcusDir?: string;
  /** Asks a yes/no question; defaults to a terminal prompt. */
  confirm?: (question: string) => Promise<boolean>;
}

interface CloneContext {
  dir: string;
  remote: string;
}

/** The clone and the remote for `source`'s repo, fetched. Throws if absent. */
function cloneContext(
  name: string,
  source: UpstreamSource,
  options: PinOptions
): CloneContext {
  const location = locateClone(
    name,
    source,
    options.env ?? process.env,
    options.morcusDir ?? defaultMorcusDir()
  );
  if (location.kind !== "clone") {
    throw new Error(
      `${name}: no local clone (${location.path})${caseMismatchHint(location)}; run set_up_or_update.sh first`
    );
  }
  const remote = findRemote(location.dir, source.repo);
  if (remote === undefined) {
    throw new Error(
      `${name}: ${location.dir} has no remote for ${source.repo}; add one with \`git remote add\``
    );
  }
  // `--prune` drops remote-tracking branches deleted on the remote, so a
  // commit only on a deleted branch doesn't count as "on the remote". It
  // doesn't touch local branches or tags.
  const fetched = tryGit(location.dir, [
    "fetch",
    "-q",
    "--prune",
    remote,
    "--tags",
  ]);
  if (!fetched.ok) {
    throw new Error(`${name}: couldn't fetch ${remote}: ${fetched.stderr}`);
  }
  return { dir: location.dir, remote };
}

function remoteHasTag(dir: string, remote: string, commit: string): boolean {
  const out = tryGit(dir, ["ls-remote", remote, `refs/tags/${pinTag(commit)}`]);
  return out.ok && out.stdout.split(/\s/)[0] === commit;
}

function isOnRemote(dir: string, remote: string, commit: string): boolean {
  const branches = git(dir, [
    "for-each-ref",
    "--count=1",
    "--contains",
    commit,
    `refs/remotes/${remote}/`,
  ]);
  return branches !== "" || remoteHasTag(dir, remote, commit);
}

function revParse(dir: string, rev: string): string | undefined {
  const result = tryGit(dir, [
    "rev-parse",
    "--verify",
    "-q",
    `${rev}^{commit}`,
  ]);
  return result.ok ? result.stdout : undefined;
}

export interface ResolvedRef {
  commit: string;
  /** Set when the choice between a local and a remote branch may surprise. */
  warning?: string;
}

/**
 * The commit `ref` names: a local branch, tag or SHA, or a branch on `remote`.
 * With no `ref`, it's the tracked branch on the remote; local branches aren't
 * consulted. When a local branch and the remote's branch of the same name
 * differ, the newer one wins if one contains the other: a stale local `main`
 * doesn't pin an old commit, and unpushed local commits get the "isn't on the
 * remote" error. Picking the remote's branch comes with a warning, since the
 * local branch may be behind on purpose (e.g. after a `git reset`).
 */
export function resolveRef(
  dir: string,
  remote: string,
  source: UpstreamSource,
  ref: string | undefined
): ResolvedRef {
  const name = ref ?? source.branch;
  const local = ref === undefined ? undefined : revParse(dir, ref);
  const remoteBranch = revParse(dir, `refs/remotes/${remote}/${name}`);
  if (
    local !== undefined &&
    remoteBranch !== undefined &&
    local !== remoteBranch
  ) {
    if (isAncestor(dir, local, remoteBranch)) {
      const behind = countCommits(dir, `${local}..${remoteBranch}`);
      return {
        commit: remoteBranch,
        warning:
          `used '${remote}/${name}' (${remoteBranch.slice(0, 7)}): local ` +
          `'${name}' (${local.slice(0, 7)}) is ${behind} behind it. Pin ` +
          `${local.slice(0, 7)} explicitly if you meant the local one.`,
      };
    }
    if (isAncestor(dir, remoteBranch, local)) return { commit: local };
    throw new Error(
      `local '${name}' and '${remote}/${name}' have diverged; pin a SHA instead`
    );
  }
  const resolved = local ?? remoteBranch;
  if (resolved === undefined) {
    throw new Error(`can't resolve '${name}' in ${dir}`);
  }
  return { commit: resolved };
}

interface PinPlan {
  name: string;
  source: UpstreamSource;
  context: CloneContext;
  oldCommit: string;
  newCommit: string;
  /** Commits in the new pin but not the old one, and vice versa. */
  newCommits: number;
  droppedCommits: number;
  log: string;
  droppedLog: string;
  shortstat: string;
  notes: string[];
}

function planPin(
  request: PinRequest,
  source: UpstreamSource,
  options: PinOptions
): PinPlan {
  const { name } = request;
  const context = cloneContext(name, source, options);
  const { dir, remote } = context;
  let resolved: ResolvedRef;
  try {
    resolved = resolveRef(dir, remote, source, request.ref);
  } catch (err) {
    throw new Error(`${name}: ${errorMessage(err)}`);
  }
  const newCommit = resolved.commit;
  const notes = resolved.warning === undefined ? [] : [resolved.warning];
  const short = newCommit.slice(0, 7);
  if (!isOnRemote(dir, remote, newCommit)) {
    throw new Error(
      `${name}: ${short} isn't on ${remote} (${source.repo}); push it to a branch first`
    );
  }
  const oldCommit = source.commit;
  if (!ensureCommit(dir, remote, oldCommit)) {
    throw new Error(
      `${name}: can't fetch the current pin ${oldCommit.slice(0, 7)}`
    );
  }
  const check = checkContainsContent(dir, oldCommit, newCommit);
  if (check.kind === "drops" || check.kind === "conflicts") {
    const detail =
      check.kind === "drops"
        ? `it lacks these changes from the current pin:\n${check.diffstat}`
        : "merging the current pin into it conflicts, so it may lack changes the current pin has";
    if (!options.allowDrop) {
      throw new Error(
        `${name}: ${short} would drop data: ${detail}\n` +
          "Pin a commit that includes them (e.g. merge them in), or pass --allow-drop if dropping is intended."
      );
    }
    notes.push(`drops data from the current pin (--allow-drop): ${detail}`);
  } else if (check.kind === "contains") {
    notes.push(
      "doesn't descend from the current pin, but already has all of its changes (e.g. upstream squash- or rebase-merged them)"
    );
  }
  const added = `${oldCommit}..${newCommit}`;
  const dropped = `${newCommit}..${oldCommit}`;
  const log = (range: string) =>
    git(dir, ["log", "--oneline", "--no-decorate", "-n", "20", range]);
  return {
    name,
    source,
    context,
    oldCommit,
    newCommit,
    newCommits: countCommits(dir, added),
    droppedCommits: countCommits(dir, dropped),
    log: log(added),
    droppedLog: log(dropped),
    shortstat: git(dir, ["diff", "--shortstat", oldCommit, newCommit]),
    notes,
  };
}

async function terminalConfirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N]: `)).trim());
  } finally {
    rl.close();
  }
}

function describePlan(plan: PinPlan): string {
  const from = plan.oldCommit.slice(0, 7);
  const to = plan.newCommit.slice(0, 7);
  if (plan.oldCommit === plan.newCommit) {
    return `${plan.name}: unchanged at ${to}`;
  }
  const counts =
    plan.droppedCommits > 0
      ? `+${plan.newCommits} / -${plan.droppedCommits} commits`
      : `+${plan.newCommits} commits`;
  const lines = [
    `${plan.name}: ${from} -> ${to} (${counts}${
      plan.shortstat ? `; ${plan.shortstat.trim()}` : ""
    })`,
  ];
  for (const note of plan.notes) lines.push(`  Note: ${note}`);
  const listCommits = (log: string, total: number, prefix: string) => {
    for (const line of log.split("\n").filter(Boolean)) {
      lines.push(`    ${prefix} ${line}`);
    }
    if (total > 20) lines.push(`    ${prefix} ...`);
  };
  listCommits(plan.log, plan.newCommits, "+");
  // Replaced commits, e.g. a PR branch that upstream squash-merged, or a
  // rollback with --allow-drop.
  listCommits(plan.droppedLog, plan.droppedCommits, "-");
  return lines.join("\n");
}

function pushTag(name: string, context: CloneContext, commit: string): void {
  const { dir, remote } = context;
  if (remoteHasTag(dir, remote, commit)) return;
  const tag = pinTag(commit);
  const refspec = `${commit}:refs/tags/${tag}`;
  const pushed = tryGit(dir, ["push", "-q", remote, refspec]);
  if (pushed.ok) return;
  // Clones made over https (as `set_up_or_update.sh` does) often can't push
  // without a credential helper, so try the same repo over SSH.
  const sshUrl = githubSshUrl(
    tryGit(dir, ["remote", "get-url", remote]).stdout
  );
  if (sshUrl !== undefined) {
    const overSsh = tryGit(dir, ["push", "-q", sshUrl, refspec]);
    if (overSsh.ok) return;
    throw new Error(
      `${name}: couldn't push tag ${tag} to ${remote} (${pushed.stderr}) or ${sshUrl} (${overSsh.stderr})`
    );
  }
  throw new Error(
    `${name}: couldn't push tag ${tag} to ${remote}: ${pushed.stderr}`
  );
}

/**
 * `./morcus.sh upstream pin`. Returns whether the pins were (or, with
 * `dryRun`, would be) updated.
 */
export async function pinSources(
  requests: PinRequest[],
  options: PinOptions = {}
): Promise<boolean> {
  const lockPath = options.lockPath ?? UPSTREAM_LOCK_FILE;
  const lock = readUpstreamLock(lockPath);
  const plans: PinPlan[] = [];
  const errors: string[] = [];
  for (const request of requests) {
    const source = lock.sources[request.name];
    if (source === undefined) {
      errors.push(`${request.name}: no such source in ${lockPath}`);
      continue;
    }
    try {
      plans.push(planPin(request, source, options));
    } catch (err) {
      errors.push(errorMessage(err));
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.log(chalk.red(error));
    console.log(chalk.red("Nothing was changed."));
    return false;
  }

  for (const plan of plans) console.log(describePlan(plan));
  const large = plans.filter((p) => p.newCommits > CONFIRM_ABOVE_COMMITS);
  if (large.length > 0 && !options.yes) {
    const confirm = options.confirm ?? terminalConfirm;
    const names = large.map((p) => p.name).join(", ");
    const question =
      `${names}: more than ${CONFIRM_ABOVE_COMMITS} new commits. Did the fix ` +
      "branch start somewhere other than the current pin? Continue?";
    if (!(await confirm(question))) {
      console.log(chalk.red("Nothing was changed (pass --yes to skip this)."));
      return false;
    }
  }

  if (options.dryRun) {
    console.log(
      chalk.blue("Dry run: no tags pushed and the lock file is unchanged.")
    );
    return true;
  }
  try {
    for (const plan of plans) pushTag(plan.name, plan.context, plan.newCommit);
  } catch (err) {
    console.log(chalk.red(errorMessage(err)));
    console.log(chalk.red("The lock file is unchanged."));
    return false;
  }
  for (const plan of plans) {
    lock.sources[plan.name].commit = plan.newCommit;
  }
  writeUpstreamLock(lock, lockPath);

  const changed = plans.filter((p) => p.oldCommit !== p.newCommit);
  if (changed.length > 0) {
    const title = `Pin ${changed
      .map((p) => `${p.name} to ${p.newCommit.slice(0, 7)}`)
      .join(", ")}`;
    console.log(
      chalk.green(`\nUpdated ${lockPath}. Suggested commit message:\n`)
    );
    console.log(`${title}\n\n${changed.map(describePlan).join("\n\n")}\n`);
  }
  return true;
}

/**
 * `./morcus.sh upstream tag`: pushes any missing `morcus-pin/<sha>` tags for
 * the current pins. Returns whether every pin is tagged (or would be).
 */
export function tagPins(names: string[], options: PinOptions = {}): boolean {
  const lock = readUpstreamLock(options.lockPath ?? UPSTREAM_LOCK_FILE);
  const targets = names.length > 0 ? names : Object.keys(lock.sources);
  let ok = true;
  for (const name of targets) {
    const source = lock.sources[name];
    try {
      if (source === undefined) throw new Error(`${name}: no such source`);
      const context = cloneContext(name, source, options);
      const tag = pinTag(source.commit);
      if (remoteHasTag(context.dir, context.remote, source.commit)) {
        console.log(chalk.green(`${name.padEnd(24)}already tagged`));
        continue;
      }
      if (!ensureCommit(context.dir, context.remote, source.commit)) {
        throw new Error(`${name}: can't fetch ${source.commit.slice(0, 7)}`);
      }
      if (!isOnRemote(context.dir, context.remote, source.commit)) {
        throw new Error(
          `${name}: ${source.commit.slice(0, 7)} isn't on ${
            context.remote
          }; push it first`
        );
      }
      if (options.dryRun) {
        console.log(chalk.blue(`${name.padEnd(24)}would push ${tag}`));
        continue;
      }
      pushTag(name, context, source.commit);
      console.log(chalk.green(`${name.padEnd(24)}pushed ${tag}`));
    } catch (err) {
      console.log(chalk.red(errorMessage(err)));
      ok = false;
    }
  }
  return ok;
}
