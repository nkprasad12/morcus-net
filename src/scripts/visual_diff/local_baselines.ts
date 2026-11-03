/**
 * Local visual baselines: the gitignored screenshot baseline store
 * (`.visual-baselines/local/`) and a 1-deep backup of the last update
 * (`.visual-baselines/previous/`).
 *
 * Screenshot baselines are kept locally rather than committed to git because
 * font rendering and subpixel antialiasing vary across developer machines and
 * CI environments, and committing hundreds of PNGs bloats the repository.
 *
 * Playwright compares directly against `.visual-baselines/local/` (see
 * `snapshotPathTemplate` in `playwright.config.ts`).
 *
 * Baselines are updated by:
 * - `./morcus.sh e2e --visual --all --update` ({@link snapshotBeforeUpdate} +
 *   {@link recordUpdateFromSnapshot})
 * - `./morcus.sh visual-baselines accept` or the Visual Diff Inspector's
 *   Accept button ({@link acceptFromActuals})
 *
 * Every update or accept that changes baselines saves the overwritten images
 * into `.visual-baselines/previous/`, so you can still inspect `before` vs
 * `after` (`./morcus.sh visual-diff --source previous`) or revert the update
 * (`./morcus.sh visual-baselines undo`).
 */

import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { scanResultActuals } from "@/scripts/visual_diff/playwright_results";
import { checkRunMarker } from "@/scripts/visual_diff/run_marker";
import type { StoreSummary } from "@/scripts/visual_diff/visual_diff_types";

export const DEFAULT_STORE_DIR = ".visual-baselines/local";
export const DEFAULT_PREVIOUS_DIR = ".visual-baselines/previous";
/** Read by `playwright.config.ts`: the directory to compare screenshots against. */
export const BASELINES_ENV = "MORCUS_VISUAL_BASELINES";

const MANIFEST_FILE = "manifest.json";
const MANIFEST_VERSION = 1;

export interface LocalEntry {
  /** SHA-256 of the stored PNG. */
  sha256: string;
  /** ISO timestamp of when the entry was accepted. */
  acceptedAt: string;
  /** `HEAD` when the entry was accepted, if known. Informational only. */
  acceptedAtCommit?: string;
}

export interface LocalManifest {
  version: number;
  entries: Record<string, LocalEntry>;
}

/**
 * Metadata for the 1-deep `.visual-baselines/previous/` backup, written
 * whenever an `--update` or `accept` adds or overwrites baselines.
 */
export interface PreviousBatch {
  version: number;
  updatedAt: string;
  /** Baselines that did not exist before the update (removed on undo). */
  added: string[];
  /** Baselines that were overwritten, with their previous manifest entries. */
  updated: Record<string, LocalEntry>;
}

export interface BaselinePaths {
  /** Gitignored local baseline store. */
  storeDir: string;
  /** 1-deep backup of the last update or accept. */
  previousDir: string;
}

export function defaultPaths(root: string = process.cwd()): BaselinePaths {
  return {
    storeDir: path.resolve(root, DEFAULT_STORE_DIR),
    previousDir: path.resolve(root, DEFAULT_PREVIOUS_DIR),
  };
}

// ---------------------------------------------------------------------------
// Hashing and manifest I/O
// ---------------------------------------------------------------------------

function sha256(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readIfExists(file: string): Buffer | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isLocalEntry(x: unknown): x is LocalEntry {
  return (
    isRecord(x) &&
    typeof x.sha256 === "string" &&
    typeof x.acceptedAt === "string" &&
    (x.acceptedAtCommit === undefined || typeof x.acceptedAtCommit === "string")
  );
}

export function readManifest(paths: BaselinePaths): LocalManifest {
  const raw = readIfExists(path.join(paths.storeDir, MANIFEST_FILE));
  if (raw === undefined) {
    return { version: MANIFEST_VERSION, entries: {} };
  }
  const parsed: unknown = JSON.parse(raw.toString("utf-8"));
  if (!isRecord(parsed) || parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported local baseline manifest in ${paths.storeDir}; expected version ${MANIFEST_VERSION}.`
    );
  }
  const entries: Record<string, LocalEntry> = {};
  for (const [name, entry] of Object.entries(
    isRecord(parsed.entries) ? parsed.entries : {}
  )) {
    if (!isLocalEntry(entry)) {
      throw new Error(`Malformed local baseline entry for ${name}.`);
    }
    entries[name] = {
      sha256: entry.sha256,
      acceptedAt: entry.acceptedAt,
      ...(entry.acceptedAtCommit === undefined
        ? {}
        : { acceptedAtCommit: entry.acceptedAtCommit }),
    };
  }
  return { version: MANIFEST_VERSION, entries };
}

export function writeManifest(paths: BaselinePaths, manifest: LocalManifest) {
  fs.mkdirSync(paths.storeDir, { recursive: true });
  const sorted: Record<string, LocalEntry> = {};
  for (const name of Object.keys(manifest.entries).sort()) {
    const e = manifest.entries[name];
    sorted[name] = {
      sha256: e.sha256,
      acceptedAt: e.acceptedAt,
      ...(e.acceptedAtCommit === undefined
        ? {}
        : { acceptedAtCommit: e.acceptedAtCommit }),
    };
  }
  fs.writeFileSync(
    path.join(paths.storeDir, MANIFEST_FILE),
    JSON.stringify({ version: MANIFEST_VERSION, entries: sorted }, null, 2) +
      "\n"
  );
}

export function readPreviousBatch(
  paths: BaselinePaths
): PreviousBatch | undefined {
  const raw = readIfExists(path.join(paths.previousDir, MANIFEST_FILE));
  if (raw === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.toString("utf-8"));
    if (
      !isRecord(parsed) ||
      parsed.version !== MANIFEST_VERSION ||
      typeof parsed.updatedAt !== "string" ||
      !Array.isArray(parsed.added) ||
      !parsed.added.every((n): n is string => typeof n === "string") ||
      !isRecord(parsed.updated)
    ) {
      return undefined;
    }
    const updated: Record<string, LocalEntry> = {};
    for (const [name, entry] of Object.entries(parsed.updated)) {
      if (!isLocalEntry(entry)) return undefined;
      updated[name] = {
        sha256: entry.sha256,
        acceptedAt: entry.acceptedAt,
        ...(entry.acceptedAtCommit === undefined
          ? {}
          : { acceptedAtCommit: entry.acceptedAtCommit }),
      };
    }
    return {
      version: MANIFEST_VERSION,
      updatedAt: parsed.updatedAt,
      added: [...parsed.added].sort(),
      updated,
    };
  } catch {
    return undefined;
  }
}

function writePreviousBackup(
  paths: BaselinePaths,
  now: Date,
  added: readonly string[],
  updated: ReadonlyMap<string, { png: Buffer; entry: LocalEntry }>
) {
  fs.rmSync(paths.previousDir, { recursive: true, force: true });
  fs.mkdirSync(paths.previousDir, { recursive: true });
  const updatedEntries: Record<string, LocalEntry> = {};
  for (const name of [...updated.keys()].sort()) {
    const item = updated.get(name)!;
    fs.writeFileSync(path.join(paths.previousDir, name), item.png);
    updatedEntries[name] = item.entry;
  }
  const batch: PreviousBatch = {
    version: MANIFEST_VERSION,
    updatedAt: now.toISOString(),
    added: [...added].sort(),
    updated: updatedEntries,
  };
  fs.writeFileSync(
    path.join(paths.previousDir, MANIFEST_FILE),
    JSON.stringify(batch, null, 2) + "\n"
  );
}

function listPngs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();
}

function currentCommit(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface Resolution {
  /** Local entries present on disk. */
  valid: string[];
  /** Manifest entries whose PNG is missing from the store; ignored. */
  missing: string[];
}

export function resolveLocal(
  paths: BaselinePaths,
  manifest: LocalManifest = readManifest(paths)
): Resolution {
  const result: Resolution = { valid: [], missing: [] };
  for (const name of Object.keys(manifest.entries).sort()) {
    if (!fs.existsSync(path.join(paths.storeDir, name))) {
      result.missing.push(name);
    } else {
      result.valid.push(name);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface UpdateResult {
  /** New local entries (first local version of a snapshot). */
  added: string[];
  /** Local entries replaced with a newer image. */
  updated: string[];
  /** Existing local entries whose image did not change. */
  unchanged: string[];
}

/** Pre-update snapshot of `.visual-baselines/local/`, for {@link recordUpdateFromSnapshot}. */
export type BeforeUpdateSnapshot = Map<
  string,
  { png: Buffer; entry: LocalEntry }
>;

/**
 * Captures the current contents of `.visual-baselines/local/` in memory before
 * running Playwright with `--update-snapshots`, so {@link recordUpdateFromSnapshot}
 * can see what changed and populate `.visual-baselines/previous/`.
 */
export function snapshotBeforeUpdate(
  paths: BaselinePaths,
  now: Date = new Date()
): BeforeUpdateSnapshot {
  const manifest = readManifest(paths);
  const snapshot: BeforeUpdateSnapshot = new Map();
  for (const name of listPngs(paths.storeDir)) {
    const png = fs.readFileSync(path.join(paths.storeDir, name));
    const entry = manifest.entries[name] ?? {
      sha256: sha256(png),
      acceptedAt: now.toISOString(),
    };
    snapshot.set(name, { png, entry });
  }
  return snapshot;
}

/**
 * Records changes written to `.visual-baselines/local/` by Playwright's
 * `--update-snapshots`: updates `manifest.json` and backs up overwritten
 * baselines to `.visual-baselines/previous/`.
 */
export function recordUpdateFromSnapshot(
  paths: BaselinePaths,
  before: BeforeUpdateSnapshot,
  now: Date = new Date(),
  repoRoot: string = process.cwd()
): UpdateResult {
  const manifest = readManifest(paths);
  const commit = currentCommit(repoRoot);
  const result: UpdateResult = { added: [], updated: [], unchanged: [] };
  const updatedBackup = new Map<string, { png: Buffer; entry: LocalEntry }>();

  for (const name of listPngs(paths.storeDir)) {
    const content = fs.readFileSync(path.join(paths.storeDir, name));
    const hash = sha256(content);
    const prev = before.get(name);

    if (prev === undefined) {
      manifest.entries[name] = {
        sha256: hash,
        acceptedAt: now.toISOString(),
        ...(commit === undefined ? {} : { acceptedAtCommit: commit }),
      };
      result.added.push(name);
    } else if (!prev.png.equals(content)) {
      updatedBackup.set(name, prev);
      manifest.entries[name] = {
        sha256: hash,
        acceptedAt: now.toISOString(),
        ...(commit === undefined ? {} : { acceptedAtCommit: commit }),
      };
      result.updated.push(name);
    } else {
      manifest.entries[name] = prev.entry;
      result.unchanged.push(name);
    }
  }
  writeManifest(paths, manifest);
  if (result.added.length > 0 || result.updated.length > 0) {
    writePreviousBackup(paths, now, result.added, updatedBackup);
  }
  return result;
}

export type ActualsAcceptResult = UpdateResult;

export interface AcceptFromActualsOptions {
  now?: Date;
  /** Accept even if the run marker is missing or the code changed since. */
  force?: boolean;
  /** Repository to compare against the run marker (default: the cwd). */
  repoRoot?: string;
  /** Snapshot suffix used to map actuals to baseline names (default: this OS). */
  platform?: string;
}

/** Thrown when `accept` refuses to run, with the reason as the message. */
export class AcceptRefusedError extends Error {}

/**
 * Accepts the named snapshots straight from Playwright's `*-actual.png` files
 * in `resultsDir`, as left by a failing `e2e --visual` run, without running
 * the suite again.
 *
 * Names are baseline file names (`<scenario>-<js>-<theme>-<project>-<os>.png`).
 * There is no "accept everything": a flaky failure must never be accepted
 * just because it happened to be in `test-results/`.
 *
 * Unless `force` is set, refuses if the run marker (`run_marker.ts`) is
 * missing or the code changed since the run.
 *
 * Overwritten baselines are backed up to `.visual-baselines/previous/`.
 */
export function acceptFromActuals(
  paths: BaselinePaths,
  resultsDir: string,
  names: readonly string[],
  options: AcceptFromActualsOptions = {}
): ActualsAcceptResult {
  if (names.length === 0) {
    throw new AcceptRefusedError(
      "accept needs snapshot names (or --from-report); it never accepts everything in test-results/."
    );
  }
  if (!options.force) {
    const check = checkRunMarker(resultsDir, options.repoRoot ?? process.cwd());
    if (!check.ok) {
      throw new AcceptRefusedError(`Refusing to accept: ${check.reason}`);
    }
  }
  const actuals = new Map<string, string>();
  for (const a of scanResultActuals(resultsDir, options.platform)) {
    if (a.snapshotName !== undefined) {
      actuals.set(a.snapshotName, a.actualPath);
    }
  }
  const wanted = [...new Set(names)].sort();
  const unknown = wanted.filter((n) => !actuals.has(n));
  if (unknown.length > 0) {
    throw new AcceptRefusedError(
      `No actual screenshot in ${
        path.relative(process.cwd(), resultsDir) || resultsDir
      } for: ${unknown.join(", ")}`
    );
  }

  const now = options.now ?? new Date();
  const manifest = readManifest(paths);
  const commit = currentCommit(options.repoRoot ?? process.cwd());
  const result: ActualsAcceptResult = {
    added: [],
    updated: [],
    unchanged: [],
  };
  const updatedBackup = new Map<string, { png: Buffer; entry: LocalEntry }>();

  for (const name of wanted) {
    const content = fs.readFileSync(actuals.get(name)!);
    const hash = sha256(content);
    const existingPng = readIfExists(path.join(paths.storeDir, name));
    const existingEntry = manifest.entries[name];

    if (existingPng !== undefined && existingPng.equals(content)) {
      if (existingEntry === undefined) {
        manifest.entries[name] = {
          sha256: hash,
          acceptedAt: now.toISOString(),
          ...(commit === undefined ? {} : { acceptedAtCommit: commit }),
        };
      }
      result.unchanged.push(name);
      continue;
    }

    if (existingPng !== undefined) {
      updatedBackup.set(name, {
        png: existingPng,
        entry: existingEntry ?? {
          sha256: sha256(existingPng),
          acceptedAt: now.toISOString(),
        },
      });
    }

    fs.mkdirSync(paths.storeDir, { recursive: true });
    fs.writeFileSync(path.join(paths.storeDir, name), content);
    manifest.entries[name] = {
      sha256: hash,
      acceptedAt: now.toISOString(),
      ...(commit === undefined ? {} : { acceptedAtCommit: commit }),
    };
    (existingPng === undefined ? result.added : result.updated).push(name);
  }
  writeManifest(paths, manifest);
  if (result.added.length > 0 || result.updated.length > 0) {
    writePreviousBackup(paths, now, result.added, updatedBackup);
  }
  return result;
}

/**
 * Reverts the last `--update` or `accept` using the 1-deep backup in
 * `.visual-baselines/previous/`, and clears the backup.
 */
export function undoLastUpdate(paths: BaselinePaths): {
  dropped: string[];
  restored: string[];
} {
  const batch = readPreviousBatch(paths);
  if (batch === undefined) {
    throw new Error(
      "No previous baseline update in .visual-baselines/previous to undo."
    );
  }
  const manifest = readManifest(paths);
  const dropped: string[] = [];
  const restored: string[] = [];

  for (const name of batch.added) {
    fs.rmSync(path.join(paths.storeDir, name), { force: true });
    delete manifest.entries[name];
    dropped.push(name);
  }
  fs.mkdirSync(paths.storeDir, { recursive: true });
  for (const [name, entry] of Object.entries(batch.updated)) {
    const prevFile = path.join(paths.previousDir, name);
    if (fs.existsSync(prevFile)) {
      fs.copyFileSync(prevFile, path.join(paths.storeDir, name));
      manifest.entries[name] = entry;
      restored.push(name);
    }
  }
  writeManifest(paths, manifest);
  fs.rmSync(paths.previousDir, { recursive: true, force: true });
  return { dropped: dropped.sort(), restored: restored.sort() };
}

/** Discards local entries: the named ones, or every entry with `all: true`. */
export function drop(
  paths: BaselinePaths,
  options: { names?: readonly string[]; all?: boolean }
): string[] {
  const manifest = readManifest(paths);
  const targets = new Set<string>(options.names ?? []);
  if (options.all) {
    for (const n of Object.keys(manifest.entries)) targets.add(n);
    for (const n of listPngs(paths.storeDir)) targets.add(n);
  }
  const unknown = [...targets].filter(
    (n) =>
      manifest.entries[n] === undefined &&
      !fs.existsSync(path.join(paths.storeDir, n))
  );
  if (unknown.length > 0) {
    throw new Error(`No local baseline named: ${unknown.join(", ")}`);
  }
  for (const name of targets) {
    fs.rmSync(path.join(paths.storeDir, name), { force: true });
    delete manifest.entries[name];
  }
  writeManifest(paths, manifest);
  return [...targets].sort();
}

/** A local entry and its image, saved so a session accept can be undone. */
export interface SavedEntry {
  entry: LocalEntry;
  png: Buffer;
}

/** The current local entry for `name` (with its image), or null if none. */
export function saveEntry(
  paths: BaselinePaths,
  name: string
): SavedEntry | null {
  const png = readIfExists(path.join(paths.storeDir, name));
  if (png === undefined) return null;
  const entry = readManifest(paths).entries[name] ?? {
    sha256: sha256(png),
    acceptedAt: new Date().toISOString(),
  };
  return { entry, png };
}

/** Puts back an entry saved by {@link saveEntry}. */
export function restoreEntry(
  paths: BaselinePaths,
  name: string,
  saved: SavedEntry
) {
  const manifest = readManifest(paths);
  fs.mkdirSync(paths.storeDir, { recursive: true });
  fs.writeFileSync(path.join(paths.storeDir, name), saved.png);
  manifest.entries[name] = saved.entry;
  writeManifest(paths, manifest);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function storeSummary(paths: BaselinePaths): StoreSummary {
  const manifest = readManifest(paths);
  const { valid } = resolveLocal(paths, manifest);
  const bytes = valid.reduce(
    (n, f) => n + fs.statSync(path.join(paths.storeDir, f)).size,
    0
  );
  const oldest: string | undefined = valid
    .map((n) => manifest.entries[n].acceptedAt)
    .sort()[0];
  const prev = readPreviousBatch(paths);
  const previousCount =
    prev === undefined
      ? undefined
      : prev.added.length + Object.keys(prev.updated).length;
  return {
    active: valid.length,
    bytes,
    ...(oldest === undefined ? {} : { oldestAcceptedAt: oldest }),
    ...(previousCount === undefined || previousCount === 0
      ? {}
      : { previousCount, previousUpdatedAt: prev?.updatedAt }),
  };
}

export function statusReport(paths: BaselinePaths): string {
  const manifest = readManifest(paths);
  const { valid, missing } = resolveLocal(paths, manifest);
  const summary = storeSummary(paths);
  const lines = [
    `Local visual baselines (${path.relative(process.cwd(), paths.storeDir)})`,
    `  ${valid.length} active, ${formatBytes(summary.bytes)}`,
  ];
  if (summary.oldestAcceptedAt !== undefined) {
    lines.push(`  oldest accepted ${summary.oldestAcceptedAt}`);
  }
  if (summary.previousCount !== undefined && summary.previousCount > 0) {
    lines.push(
      `  previous backup: ${summary.previousCount} snapshot(s) from ${summary.previousUpdatedAt} ` +
        "(`visual-diff --source previous` to inspect, `visual-baselines undo` to revert)"
    );
  }
  const section = (title: string, names: string[], note: string) => {
    if (names.length === 0) return;
    lines.push("", `${title} (${note}):`);
    for (const n of names) {
      const e = manifest.entries[n];
      lines.push(
        `  ${n}  [${e.acceptedAt}${
          e.acceptedAtCommit ? ` @ ${e.acceptedAtCommit}` : ""
        }]`
      );
    }
  };
  section("Active", valid, "compared by Playwright");
  section("Missing", missing, "manifest entry without a PNG; ignored");
  return lines.join("\n");
}

/** One-line summary printed before a visual run. */
export function resolutionSummary(r: Resolution): string | undefined {
  if (r.valid.length + r.missing.length === 0) {
    return undefined;
  }
  const parts = [`${r.valid.length} local baseline(s) active`];
  if (r.missing.length > 0) parts.push(`${r.missing.length} missing`);
  return parts.join(", ");
}
