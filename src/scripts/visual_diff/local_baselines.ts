/**
 * Local visual baselines: a gitignored overlay on top of the committed
 * screenshot baselines.
 *
 * The committed snapshot directory is a *checkpoint*, refreshed every so
 * often. Day-to-day baseline changes are accepted into a local store
 * (`.visual-baselines/local/`) instead, so a long-running branch doesn't add
 * a new set of PNGs to git history with every UI tweak.
 *
 * Before each visual run, the checkpoint and the valid local entries are
 * merged into an *effective* directory, which Playwright compares against
 * (see `snapshotPathTemplate` in `playwright.config.ts`).
 *
 * A local entry is valid while the checkpoint file it was accepted against is
 * unchanged (same git blob id). Once the checkpoint moves on (a pull, a rebase,
 * or a new checkpoint), the checked-in file wins and the entry is "stale".
 * This is content-based rather than mtime-based, because checkouts and rebases
 * rewrite mtimes.
 */

import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const DEFAULT_SNAPSHOT_DIR =
  "src/integration/screenshot/browser_screenshot.test.ts-snapshots";
export const DEFAULT_STORE_DIR = ".visual-baselines/local";
export const DEFAULT_EFFECTIVE_DIR = ".cache/visual-baselines/effective";
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
  /**
   * Git blob id of the checkpoint file this entry was accepted against, or
   * `null` if the snapshot had no checkpoint (a new scenario).
   */
  checkpointBlob: string | null;
}

export interface LocalManifest {
  version: number;
  entries: Record<string, LocalEntry>;
}

export interface BaselinePaths {
  /** Committed checkpoint directory. */
  snapshotDir: string;
  /** Gitignored local store. */
  storeDir: string;
  /** Regenerated before each run: checkpoint + valid local entries. */
  effectiveDir: string;
}

export function defaultPaths(root: string = process.cwd()): BaselinePaths {
  return {
    snapshotDir: path.resolve(root, DEFAULT_SNAPSHOT_DIR),
    storeDir: path.resolve(root, DEFAULT_STORE_DIR),
    effectiveDir: path.resolve(root, DEFAULT_EFFECTIVE_DIR),
  };
}

// ---------------------------------------------------------------------------
// Hashing and manifest I/O
// ---------------------------------------------------------------------------

/** The id git would give this content as a blob (`git hash-object`). */
export function gitBlobId(content: Buffer): string {
  return crypto
    .createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

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
    (x.acceptedAtCommit === undefined ||
      typeof x.acceptedAtCommit === "string") &&
    (x.checkpointBlob === null || typeof x.checkpointBlob === "string")
  );
}

/** Blob id of the checkpoint (working tree) version of `name`, or null. */
export function checkpointBlobOf(
  paths: BaselinePaths,
  name: string
): string | null {
  const content = readIfExists(path.join(paths.snapshotDir, name));
  return content === undefined ? null : gitBlobId(content);
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
    entries[name] = entry;
  }
  return { version: MANIFEST_VERSION, entries };
}

export function writeManifest(paths: BaselinePaths, manifest: LocalManifest) {
  fs.mkdirSync(paths.storeDir, { recursive: true });
  const sorted: Record<string, LocalEntry> = {};
  for (const name of Object.keys(manifest.entries).sort()) {
    sorted[name] = manifest.entries[name];
  }
  fs.writeFileSync(
    path.join(paths.storeDir, MANIFEST_FILE),
    JSON.stringify({ version: MANIFEST_VERSION, entries: sorted }, null, 2) +
      "\n"
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
  /** Local entries that override (or add to) the checkpoint. */
  valid: string[];
  /** Local entries whose checkpoint has since changed; the checkpoint wins. */
  stale: string[];
  /** Manifest entries whose PNG is missing from the store; ignored. */
  missing: string[];
}

export function resolveLocal(
  paths: BaselinePaths,
  manifest: LocalManifest = readManifest(paths)
): Resolution {
  const result: Resolution = { valid: [], stale: [], missing: [] };
  for (const name of Object.keys(manifest.entries).sort()) {
    if (!fs.existsSync(path.join(paths.storeDir, name))) {
      result.missing.push(name);
    } else if (
      checkpointBlobOf(paths, name) === manifest.entries[name].checkpointBlob
    ) {
      result.valid.push(name);
    } else {
      result.stale.push(name);
    }
  }
  return result;
}

/**
 * Rebuilds the effective directory: every checkpoint PNG, overlaid with the
 * valid local entries. Files are copied, never hard-linked: Playwright
 * rewrites baselines in place on `--update-snapshots`, which would otherwise
 * write through to the checkpoint.
 */
export function materializeEffective(paths: BaselinePaths): Resolution {
  const resolution = resolveLocal(paths);
  fs.rmSync(paths.effectiveDir, { recursive: true, force: true });
  fs.mkdirSync(paths.effectiveDir, { recursive: true });
  const copy = (from: string, name: string) =>
    fs.copyFileSync(
      path.join(from, name),
      path.join(paths.effectiveDir, name),
      fs.constants.COPYFILE_FICLONE
    );
  for (const name of listPngs(paths.snapshotDir)) copy(paths.snapshotDir, name);
  for (const name of resolution.valid) copy(paths.storeDir, name);
  return resolution;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface AcceptResult {
  /** New local entries (first local version of a snapshot). */
  added: string[];
  /** Local entries replaced with a newer image. */
  updated: string[];
  /** Local entries removed because the image is back to the checkpoint. */
  reverted: string[];
}

/**
 * Records the effective directory (after `--update-snapshots`) into the local
 * store: every image that differs from the checkpoint becomes a local entry.
 *
 * Stale entries are only replaced if the image changed; otherwise they are
 * left for `drop --stale`, since an untouched image may just mean the test
 * didn't run (e.g. with `--grep`).
 */
export function acceptFromEffective(
  paths: BaselinePaths,
  now: Date = new Date()
): AcceptResult {
  const manifest = readManifest(paths);
  const before = resolveLocal(paths, manifest);
  const valid = new Set(before.valid);
  const commit = currentCommit(path.dirname(paths.snapshotDir));
  const result: AcceptResult = { added: [], updated: [], reverted: [] };

  for (const name of listPngs(paths.effectiveDir)) {
    const content = fs.readFileSync(path.join(paths.effectiveDir, name));
    const checkpoint = readIfExists(path.join(paths.snapshotDir, name));
    const existing = manifest.entries[name];

    if (checkpoint !== undefined && checkpoint.equals(content)) {
      // Back to the checkpoint. Only a valid entry can have been overridden
      // by this run; a stale one was never in the effective dir.
      if (existing !== undefined && valid.has(name)) {
        delete manifest.entries[name];
        fs.rmSync(path.join(paths.storeDir, name), { force: true });
        result.reverted.push(name);
      }
      continue;
    }
    const hash = sha256(content);
    if (existing !== undefined && valid.has(name) && existing.sha256 === hash) {
      continue;
    }
    fs.mkdirSync(paths.storeDir, { recursive: true });
    fs.writeFileSync(path.join(paths.storeDir, name), content);
    manifest.entries[name] = {
      sha256: hash,
      acceptedAt: now.toISOString(),
      ...(commit === undefined ? {} : { acceptedAtCommit: commit }),
      checkpointBlob: checkpoint === undefined ? null : gitBlobId(checkpoint),
    };
    (existing === undefined ? result.added : result.updated).push(name);
  }
  writeManifest(paths, manifest);
  return result;
}

/**
 * Promotes valid local entries into the committed checkpoint directory and
 * removes them from the store. Does not stage or commit anything.
 */
export function checkpoint(
  paths: BaselinePaths,
  names?: readonly string[]
): { promoted: string[]; skippedStale: string[] } {
  const manifest = readManifest(paths);
  const { valid, stale } = resolveLocal(paths, manifest);
  const wanted = names === undefined ? undefined : new Set(names);
  const pick = (n: string) => wanted === undefined || wanted.has(n);
  if (wanted !== undefined) {
    const known = new Set(Object.keys(manifest.entries));
    const unknown = [...wanted].filter((n) => !known.has(n));
    if (unknown.length > 0) {
      throw new Error(`No local baseline named: ${unknown.join(", ")}`);
    }
  }
  const promoted: string[] = [];
  fs.mkdirSync(paths.snapshotDir, { recursive: true });
  for (const name of valid.filter(pick)) {
    fs.copyFileSync(
      path.join(paths.storeDir, name),
      path.join(paths.snapshotDir, name)
    );
    fs.rmSync(path.join(paths.storeDir, name));
    delete manifest.entries[name];
    promoted.push(name);
  }
  writeManifest(paths, manifest);
  return { promoted, skippedStale: stale.filter(pick) };
}

/** Discards local entries: the named ones, and/or every stale or missing one. */
export function drop(
  paths: BaselinePaths,
  options: { names?: readonly string[]; stale?: boolean; all?: boolean }
): string[] {
  const manifest = readManifest(paths);
  const { stale, missing } = resolveLocal(paths, manifest);
  const targets = new Set<string>(options.names ?? []);
  if (options.stale) {
    for (const n of [...stale, ...missing]) targets.add(n);
  }
  if (options.all) {
    for (const n of Object.keys(manifest.entries)) targets.add(n);
  }
  const unknown = [...targets].filter((n) => manifest.entries[n] === undefined);
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

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function statusReport(paths: BaselinePaths): string {
  const manifest = readManifest(paths);
  const { valid, stale, missing } = resolveLocal(paths, manifest);
  const size = valid
    .concat(stale)
    .reduce((n, f) => n + fs.statSync(path.join(paths.storeDir, f)).size, 0);
  const lines = [
    `Local visual baselines (${path.relative(process.cwd(), paths.storeDir)})`,
    `  ${valid.length} active, ${stale.length} stale, ${formatBytes(size)}`,
  ];
  const section = (title: string, names: string[], note: string) => {
    if (names.length === 0) return;
    lines.push("", `${title} (${note}):`);
    for (const n of names) {
      const e = manifest.entries[n];
      lines.push(
        `  ${n}  [${e.checkpointBlob === null ? "new" : "override"}, ${
          e.acceptedAt
        }${e.acceptedAtCommit ? ` @ ${e.acceptedAtCommit}` : ""}]`
      );
    }
  };
  section("Active", valid, "used instead of the checkpoint");
  section(
    "Stale",
    stale,
    "the checkpoint changed since; it wins. `visual-baselines drop --stale`"
  );
  section("Missing", missing, "manifest entry without a PNG; ignored");
  return lines.join("\n");
}

/** One-line summary printed before a visual run. */
export function resolutionSummary(r: Resolution): string | undefined {
  if (r.valid.length + r.stale.length + r.missing.length === 0) {
    return undefined;
  }
  const parts = [`${r.valid.length} local baseline(s) active`];
  if (r.stale.length > 0) {
    parts.push(
      `${r.stale.length} stale (checkpoint changed; run \`./morcus.sh visual-baselines status\`)`
    );
  }
  if (r.missing.length > 0) parts.push(`${r.missing.length} missing`);
  return parts.join(", ");
}
