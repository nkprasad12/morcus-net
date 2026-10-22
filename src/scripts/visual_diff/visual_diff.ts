/* istanbul ignore file */

/**
 * Visual Diff Inspector: collects changed screenshot baselines, renders
 * before / after / diff images, and serves an interactive viewer for them.
 *
 * Three sources are supported:
 * - `git`: compares snapshot PNGs in the working tree against a git ref. This
 *   is what you want when reviewing a checkpoint (committed baselines).
 * - `results`: reads Playwright's failure output (`*-expected.png`,
 *   `*-actual.png`, `*-diff.png`) from `test-results/`. This is what you want
 *   after a failing `e2e --visual` run, *before* deciding to update baselines.
 * - `local`: compares the gitignored local baselines (`local_baselines.ts`)
 *   against the committed checkpoint. This is what you want after
 *   `e2e --visual --update`, which writes to the local store.
 *
 * For the `results` and `local` sources, the served viewer can also accept
 * approved screenshots into the local store and then checkpoint them, through
 * POST endpoints that need a random per-session token (see
 * {@link handleApiRequest}). The `git` source is read-only.
 *
 * External tools: `git` (required for the `git` source) and ImageMagick
 * (optional; used for pixel counts and diff masks).
 */

import { execFileSync, spawn, spawnSync } from "child_process";
import crypto from "crypto";
import esbuild from "esbuild";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type {
  AcceptResponse,
  ApiError,
  CheckpointResponse,
  ImageDims,
  SnapshotCategory,
  SnapshotMeta,
  SnapshotStatus,
  ViewerActions,
  VisualDiffManifest,
  VisualDiffSource,
} from "@/scripts/visual_diff/visual_diff_types";
import {
  AcceptRefusedError,
  type BaselinePaths,
  acceptFromActuals,
  checkpoint,
  defaultPaths,
  readManifest,
  resolveLocal,
} from "@/scripts/visual_diff/local_baselines";
import {
  KNOWN_PROJECTS,
  projectFromResultsDir,
  safeId,
  scanResultActuals,
  sizeForProject,
} from "@/scripts/visual_diff/playwright_results";
import {
  checkRunMarker,
  readRunMarker,
} from "@/scripts/visual_diff/run_marker";

const DEFAULT_SNAPSHOT_DIR =
  "src/integration/screenshot/browser_screenshot.test.ts-snapshots";
const DEFAULT_RESULTS_DIR = "test-results";
const DEFAULT_OUT_DIR = ".cache/visual-diff";
const DEFAULT_PORT = 8899;
/**
 * All interfaces, matching the dev server (`start_server.ts`), so the viewer is
 * reachable from another machine (e.g. when running on a remote workstation).
 * The content is low-risk: screenshots of the dev UI. The only write
 * endpoints (accept / checkpoint) need the per-session token printed in the
 * terminal. Pass `--host 127.0.0.1` to restrict it to this machine.
 */
const DEFAULT_HOST = "0.0.0.0";

const VIEWER_DIR = path.join(__dirname, "viewer");
const IMAGES_SUBDIR = "images";
const MANIFEST_PLACEHOLDER = "__VISUAL_DIFF_MANIFEST__";
/** The manifest as JSON, next to `report.md`; read by `accept --from-report`. */
export const MANIFEST_FILE = "manifest.json";

export { projectFromResultsDir, sizeForProject };

export interface VisualDiffOptions {
  /**
   * Where to look for changes. `auto` tries `git`, then `results`, then
   * `local`.
   */
  source?: VisualDiffSource | "auto";
  /** Snapshot directory for the `git` source. */
  snapshotDir?: string;
  /** Git ref to compare against for the `git` source. */
  ref?: string;
  /** Playwright output directory for the `results` source. */
  resultsDir?: string;
  /** Checkpoint and store locations for the `local` source. */
  localPaths?: BaselinePaths;
  outDir?: string;
  startServer?: boolean;
  port?: number;
  host?: string;
  openBrowser?: boolean;
  reportPath?: string;
  /**
   * Serve accept/checkpoint endpoints for the `results` and `local` sources
   * (default: true). They need the per-session token either way.
   */
  actions?: boolean;
  /** Fixed session token; tests only. Generated randomly by default. */
  token?: string;
  /** Repository checked against the run marker (default: the cwd). */
  repoRoot?: string;
}

export interface VisualDiffResult {
  manifest: VisualDiffManifest;
  reportMarkdown: string;
  outDir: string;
  viewerUrl?: string;
  server?: http.Server;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Reads the width and height from a PNG IHDR chunk. */
export function readPngDimensions(
  filePathOrBuffer: string | Buffer
): ImageDims | undefined {
  let buf: Buffer;
  try {
    if (typeof filePathOrBuffer === "string") {
      const fd = fs.openSync(filePathOrBuffer, "r");
      try {
        buf = Buffer.alloc(24);
        fs.readSync(fd, buf, 0, 24, 0);
      } finally {
        fs.closeSync(fd);
      }
    } else {
      buf = filePathOrBuffer.subarray(0, 24);
    }
  } catch {
    return undefined;
  }
  const isPng =
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47;
  if (!isPng) {
    return undefined;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function categoryFor(scenario: string): SnapshotCategory {
  const parts = new Set(scenario.split("-"));
  if (parts.has("about")) return "About";
  if (parts.has("dicts") || parts.has("dict")) return "Dictionary";
  if (parts.has("library")) return "Library";
  if (parts.has("reader")) return "Reader";
  if (parts.has("corpus")) return "Corpus";
  return "Other";
}

/**
 * Parses semantic metadata from a snapshot file name.
 *
 * Handles both baseline names (`<scenario>-<js>-<theme>-<project>-<platform>.png`)
 * and Playwright result names, which lack the project and platform suffixes
 * (`<scenario>-<js>-<theme>`); for the latter, pass `browserHint`.
 */
export function parseSnapshotName(
  fileName: string,
  browserHint?: string
): Pick<
  SnapshotMeta,
  "scenario" | "category" | "mode" | "theme" | "size" | "browser"
> {
  let rest = path.basename(fileName).replace(/\.png$/, "");
  let browser = browserHint ?? "unknown";

  const platform = rest.match(/^(.*)-(linux|darwin|win32)$/);
  if (platform) {
    rest = platform[1];
  }
  const project = KNOWN_PROJECTS.find((p) => rest.endsWith(`-${p}`));
  if (project !== undefined) {
    browser = project;
    rest = rest.slice(0, -(project.length + 1));
  }
  const size = sizeForProject(browser);

  const modeTheme = rest.match(/^(.+)-(js|nojs)-(light|dark)$/);
  if (modeTheme) {
    const mode = modeTheme[2] === "js" ? "js" : "nojs";
    const theme = modeTheme[3] === "light" ? "light" : "dark";
    const scenario = modeTheme[1];
    return {
      scenario,
      category: categoryFor(scenario),
      mode,
      theme,
      size,
      browser,
    };
  }
  return {
    scenario: rest,
    category: categoryFor(rest),
    mode: "default",
    theme: "default",
    size,
    browser,
  };
}

/**
 * Parses the pixel count from ImageMagick `compare -metric AE` output.
 *
 * ImageMagick 6 prints `1234`; ImageMagick 7 prints `1234 (0.0188)`. Large
 * counts may be printed in scientific notation.
 */
export function parseCompareOutput(stderr: string): number | undefined {
  const match = stderr.trim().match(/^(\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
  if (match === null) {
    return undefined;
  }
  return Math.round(parseFloat(match[1]));
}

// ---------------------------------------------------------------------------
// ImageMagick
// ---------------------------------------------------------------------------

interface ImageMagick {
  compare: string[];
  convert: string[];
}

function commandWorks(cmd: string, args: string[]): boolean {
  const res = spawnSync(cmd, args, { stdio: "ignore" });
  return res.error === undefined && res.status === 0;
}

/** Finds ImageMagick 7 (`magick`) or ImageMagick 6 (`compare`/`convert`). */
function detectImageMagick(): ImageMagick | undefined {
  if (commandWorks("magick", ["-version"])) {
    return { compare: ["magick", "compare"], convert: ["magick"] };
  }
  if (commandWorks("compare", ["-version"])) {
    return { compare: ["compare"], convert: ["convert"] };
  }
  return undefined;
}

function runIm(cmd: string[], args: string[]) {
  return spawnSync(cmd[0], [...cmd.slice(1), ...args], { encoding: "utf-8" });
}

/**
 * Writes a diff mask to `diffPath` and returns the number of differing
 * pixels. Images of different sizes are padded (transparent) to a common
 * canvas first, so a size change shows up as a diff instead of an error.
 */
function compareImages(
  im: ImageMagick,
  beforePath: string,
  afterPath: string,
  diffPath: string,
  canvas: ImageDims,
  needsPadding: boolean
): number | undefined {
  let before = beforePath;
  let after = afterPath;
  if (needsPadding) {
    const extent = `${canvas.width}x${canvas.height}`;
    const pad = (src: string) => {
      const out = `${src}.padded.png`;
      runIm(im.convert, [
        src,
        "-background",
        "none",
        "-gravity",
        "NorthWest",
        "-extent",
        extent,
        out,
      ]);
      return out;
    };
    before = pad(beforePath);
    after = pad(afterPath);
  }
  // Exit status: 0 = identical, 1 = different, 2 = error.
  const res = runIm(im.compare, ["-metric", "AE", before, after, diffPath]);
  if (needsPadding) {
    fs.rmSync(before, { force: true });
    fs.rmSync(after, { force: true });
  }
  if (res.error !== undefined || (res.status !== 0 && res.status !== 1)) {
    return undefined;
  }
  return parseCompareOutput(res.stderr ?? "");
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/** A changed snapshot, before its images are copied into the output dir. */
interface RawEntry {
  id: string;
  name: string;
  browserHint?: string;
  status: SnapshotStatus;
  /** Writes the baseline image to the given path. */
  writeBefore?: (dest: string) => void;
  /** Absolute path of the new image. */
  afterPath?: string;
  /** Absolute path of a pre-computed diff mask (Playwright's), if any. */
  fallbackDiffPath?: string;
  /** See {@link SnapshotMeta.snapshotName}. */
  snapshotName?: string;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Parses NUL-separated `git diff --name-status -z` output. */
export function parseNameStatus(
  output: string
): { status: string; path: string }[] {
  const tokens = output.split("\0").filter((t) => t.length > 0);
  const result: { status: string; path: string }[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    result.push({ status: tokens[i], path: tokens[i + 1] });
  }
  return result;
}

export function collectGitEntries(
  snapshotDir: string,
  ref: string
): RawEntry[] {
  const absDir = path.resolve(snapshotDir);
  if (!fs.existsSync(absDir)) {
    throw new Error(`Snapshot directory does not exist: ${absDir}`);
  }
  const repoRoot = git(["rev-parse", "--show-toplevel"], absDir).trim();
  const relDir = path.relative(repoRoot, absDir) || ".";
  // Fail loudly on a bad ref rather than reporting "no changes".
  git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repoRoot);

  const byPath = new Map<string, SnapshotStatus>();
  const diffOutput = git(
    ["diff", "--name-status", "--no-renames", "-z", ref, "--", relDir],
    repoRoot
  );
  for (const { status, path: relPath } of parseNameStatus(diffOutput)) {
    const code = status[0];
    byPath.set(
      relPath,
      code === "A" ? "added" : code === "D" ? "deleted" : "modified"
    );
  }
  const untracked = git(
    ["ls-files", "--others", "--exclude-standard", "-z", "--", relDir],
    repoRoot
  );
  for (const relPath of untracked.split("\0")) {
    if (relPath.length > 0) {
      byPath.set(relPath, "added");
    }
  }

  const entries: RawEntry[] = [];
  for (const [relPath, status] of byPath) {
    if (!relPath.endsWith(".png")) {
      continue;
    }
    const absPath = path.join(repoRoot, relPath);
    entries.push({
      id: safeId(path.relative(relDir, relPath).replace(/\.png$/, "")),
      name: path.basename(relPath),
      snapshotName: path.basename(relPath),
      status,
      afterPath: status === "deleted" ? undefined : absPath,
      writeBefore:
        status === "added"
          ? undefined
          : (dest) =>
              fs.writeFileSync(
                dest,
                execFileSync("git", ["show", `${ref}:${relPath}`], {
                  cwd: repoRoot,
                  stdio: ["ignore", "pipe", "pipe"],
                  maxBuffer: 64 * 1024 * 1024,
                })
              ),
    });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Local baselines (see `local_baselines.ts`) against the checkpoint they
 * override: before = committed checkpoint, after = local store. Only valid
 * entries are shown; stale ones are returned separately.
 */
export function collectLocalEntries(paths: BaselinePaths): {
  entries: RawEntry[];
  stale: string[];
} {
  const { valid, stale } = resolveLocal(paths);
  const entries: RawEntry[] = valid.map((name) => {
    const checkpointPath = path.join(paths.snapshotDir, name);
    const hasCheckpoint = fs.existsSync(checkpointPath);
    return {
      id: safeId(name.replace(/\.png$/, "")),
      name,
      snapshotName: name,
      status: hasCheckpoint ? "modified" : "added",
      afterPath: path.join(paths.storeDir, name),
      writeBefore: hasCheckpoint
        ? (dest) => fs.copyFileSync(checkpointPath, dest)
        : undefined,
    };
  });
  return { entries, stale };
}

export function collectResultEntries(resultsDir: string): RawEntry[] {
  return scanResultActuals(resultsDir).map((a) => {
    const expected = a.expectedPath;
    return {
      id: a.id,
      name: `${a.stem}.png`,
      browserHint: a.project,
      status: expected !== undefined ? "modified" : "added",
      afterPath: a.actualPath,
      writeBefore:
        expected !== undefined
          ? (dest) => fs.copyFileSync(expected, dest)
          : undefined,
      fallbackDiffPath: a.diffPath,
      snapshotName: a.snapshotName,
    };
  });
}

/** A failed test in `test-results/` that never got as far as a screenshot comparison. */
export interface FailureWithoutSnapshot {
  /** The `test-results` directory name (Playwright's slug of the test title). */
  dir: string;
  /** The Playwright project, when the directory name encodes one. */
  project?: string;
}

/**
 * Lists failed tests that left no `*-actual.png`: they failed before comparing
 * (a timeout, a crash, a missing element), so {@link collectResultEntries}
 * has nothing to show for them. Without this they vanish from the inspector,
 * and its count silently disagrees with Playwright's.
 *
 * A failure is a directory holding Playwright's failure artifacts
 * (`test-failed-*.png` or `error-context.md`). With retries, only the latest
 * attempt of each test counts, so a retry that reached the comparison wins.
 */
export function collectFailuresWithoutSnapshot(
  resultsDir: string
): FailureWithoutSnapshot[] {
  const absDir = path.resolve(resultsDir);
  if (!fs.existsSync(absDir)) {
    return [];
  }
  // Later retries overwrite earlier attempts of the same test.
  const latest = new Map<string, string>();
  const dirs = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dirName of dirs) {
    latest.set(dirName.replace(/-retry\d+$/, ""), dirName);
  }
  const out: FailureWithoutSnapshot[] = [];
  for (const dirName of latest.values()) {
    const files = fs.readdirSync(path.join(absDir, dirName));
    const failed = files.some(
      (f) => /^test-failed-\d+\.png$/.test(f) || f === "error-context.md"
    );
    const compared = files.some((f) => f.endsWith("-actual.png"));
    if (failed && !compared) {
      out.push({ dir: dirName, project: projectFromResultsDir(dirName) });
    }
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

function failuresWithoutSnapshotWarning(
  failures: readonly FailureWithoutSnapshot[]
): string[] {
  return [
    `⚠ ${failures.length} failed without a screenshot (not shown):`,
    ...failures.map((f) => `  - ${f.dir}${f.project ? ` [${f.project}]` : ""}`),
  ];
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function materialize(
  entry: RawEntry,
  imagesDir: string,
  im: ImageMagick | undefined
): SnapshotMeta {
  const meta: SnapshotMeta = {
    id: entry.id,
    name: entry.name,
    ...parseSnapshotName(entry.name, entry.browserHint),
    status: entry.status,
    ...(entry.snapshotName === undefined
      ? {}
      : { snapshotName: entry.snapshotName }),
  };

  if (entry.writeBefore !== undefined) {
    const file = path.join(imagesDir, `${entry.id}.before.png`);
    entry.writeBefore(file);
    meta.before = readPngDimensions(file);
    meta.beforeUrl = `${IMAGES_SUBDIR}/${path.basename(file)}`;
  }
  if (entry.afterPath !== undefined) {
    const file = path.join(imagesDir, `${entry.id}.after.png`);
    fs.copyFileSync(entry.afterPath, file);
    meta.after = readPngDimensions(file);
    meta.afterUrl = `${IMAGES_SUBDIR}/${path.basename(file)}`;
  }

  if (meta.beforeUrl === undefined || meta.afterUrl === undefined) {
    return meta;
  }
  const diffFile = path.join(imagesDir, `${entry.id}.diff.png`);
  const b = meta.before ?? { width: 0, height: 0 };
  const a = meta.after ?? { width: 0, height: 0 };
  const canvas = {
    width: Math.max(a.width, b.width),
    height: Math.max(a.height, b.height),
  };
  if (im !== undefined) {
    const sizeChanged = a.width !== b.width || a.height !== b.height;
    meta.diffPixels = compareImages(
      im,
      path.join(imagesDir, `${entry.id}.before.png`),
      path.join(imagesDir, `${entry.id}.after.png`),
      diffFile,
      canvas,
      sizeChanged
    );
    const area = canvas.width * canvas.height;
    if (meta.diffPixels !== undefined && area > 0) {
      meta.diffPct = (meta.diffPixels / area) * 100;
    }
  }
  if (!fs.existsSync(diffFile) && entry.fallbackDiffPath !== undefined) {
    fs.copyFileSync(entry.fallbackDiffPath, diffFile);
  }
  if (fs.existsSync(diffFile)) {
    meta.diffUrl = `${IMAGES_SUBDIR}/${path.basename(diffFile)}`;
  }
  return meta;
}

/** Serializes JSON so it can be safely embedded inside a `<script>` tag. */
export function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Writes `index.html`, `viewer.css`, and a bundled `viewer.js` to `outDir`. */
function writeViewer(outDir: string, manifest: VisualDiffManifest) {
  const template = fs.readFileSync(
    path.join(VIEWER_DIR, "index.html"),
    "utf-8"
  );
  if (!template.includes(MANIFEST_PLACEHOLDER)) {
    throw new Error("Viewer template is missing the manifest placeholder.");
  }
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    template.replace(MANIFEST_PLACEHOLDER, () => jsonForScriptTag(manifest))
  );
  fs.writeFileSync(
    path.join(outDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  fs.copyFileSync(
    path.join(VIEWER_DIR, "viewer.css"),
    path.join(outDir, "viewer.css")
  );
  esbuild.buildSync({
    entryPoints: [path.join(VIEWER_DIR, "viewer.client.ts")],
    bundle: true,
    format: "iife",
    target: "es2018",
    outfile: path.join(outDir, "viewer.js"),
    logLevel: "warning",
  });
}

function formatPct(item: SnapshotMeta): string {
  if (item.status !== "modified") return item.status;
  return item.diffPct === undefined ? "?" : `${item.diffPct.toFixed(2)}%`;
}

function formatDims(dims: ImageDims | undefined): string {
  return dims === undefined ? "-" : `${dims.width}×${dims.height}`;
}

/** Sort key: new/deleted and unknown diffs first, then by descending diff. */
function severity(item: SnapshotMeta): number {
  if (item.status !== "modified" || item.diffPct === undefined) return 101;
  return item.diffPct;
}

export function buildMarkdownReport(manifest: VisualDiffManifest): string {
  const lines: string[] = [
    "# Visual Diff Report",
    "",
    `**Baseline**: ${manifest.beforeLabel}  `,
    `**Compared**: ${manifest.afterLabel}  `,
    `**Changed snapshots**: ${manifest.items.length}`,
    "",
  ];
  const unrendered = manifest.failuresWithoutSnapshot ?? [];
  if (unrendered.length > 0) {
    lines.push(
      "> [!WARNING]",
      ...failuresWithoutSnapshotWarning(unrendered).map((l) => `> ${l}`),
      ">",
      "> These tests failed before taking a screenshot, so they are not in the table below.",
      ""
    );
  }
  const stale = manifest.staleLocalBaselines ?? [];
  if (stale.length > 0) {
    lines.push(
      "> [!WARNING]",
      `> ${stale.length} stale local baseline(s) ignored: the checkpoint changed after they were accepted.`,
      ...stale.map((n) => `> - \`${n}\``),
      ""
    );
  }
  lines.push(
    "| Scenario | Browser | Size | Mode | Theme | Diff | Diff pixels | Before | After |",
    "| :--- | :--- | :--- | :--- | :--- | ---: | ---: | :--- | :--- |"
  );
  const sorted = [...manifest.items].sort((a, b) => severity(b) - severity(a));
  for (const it of sorted) {
    lines.push(
      `| \`${it.scenario}\` | ${it.browser} | ${it.size} | ${it.mode} | ${
        it.theme
      } | ${formatPct(it)} | ${
        it.diffPixels?.toLocaleString("en-US") ?? "-"
      } | ${formatDims(it.before)} | ${formatDims(it.after)} |`
    );
  }
  lines.push(
    "",
    "> [!IMPORTANT]",
    "> Per the Visual Baseline Approval Rule in `AGENTS.md`, updated baselines",
    "> must not be checkpointed or committed without explicit human approval.",
    ""
  );
  return lines.join("\n");
}

function printSummary(manifest: VisualDiffManifest) {
  const sep = "-".repeat(86);
  console.log(`\n${sep}`);
  console.log(
    ` ${"Scenario".padEnd(36)} | ${"Browser".padEnd(18)} | ${"Mode".padEnd(
      5
    )} | ${"Diff".padStart(9)} | ${"Pixels".padStart(9)}`
  );
  console.log(sep);
  const sorted = [...manifest.items].sort((a, b) => severity(b) - severity(a));
  for (const it of sorted) {
    console.log(
      ` ${it.scenario.padEnd(36)} | ${it.browser.padEnd(18)} | ${it.mode.padEnd(
        5
      )} | ${formatPct(it).padStart(9)} | ${(
        it.diffPixels?.toLocaleString("en-US") ?? "-"
      ).padStart(9)}`
    );
  }
  console.log(sep);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/** Resolves a request path inside `root`, or undefined if it escapes it. */
export function resolveServedPath(
  root: string,
  urlPath: string
): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  const rel = decoded === "/" || decoded === "" ? "/index.html" : decoded;
  const absRoot = path.resolve(root);
  const resolved = path.resolve(absRoot, `.${rel}`);
  return resolved.startsWith(absRoot + path.sep) ? resolved : undefined;
}

/**
 * Starts a static file server for `outDir`, plus the write endpoints under
 * `/api/` if `session` is given. If `port` is taken, tries the next few ports.
 */
function startViewerServer(
  outDir: string,
  port: number,
  host: string,
  session?: ActionSession
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      if (session === undefined) {
        sendJson(res, 404, { error: "This Inspector is read-only." });
      } else {
        handleApiRequest(session, req, res).catch((err: unknown) =>
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
      return;
    }
    const filePath = resolveServedPath(outDir, url.pathname);
    if (
      filePath === undefined ||
      !fs.existsSync(filePath) ||
      !fs.statSync(filePath).isFile()
    ) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        MIME_TYPES[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });

  const maxAttempts = 20;
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = () => {
      const candidate = port + attempt;
      const onError = (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt + 1 < maxAttempts) {
          attempt += 1;
          tryListen();
        } else {
          reject(err);
        }
      };
      server.once("error", onError);
      server.listen(candidate, host, () => {
        server.off("error", onError);
        const address = server.address();
        resolve({
          server,
          port:
            typeof address === "object" && address !== null
              ? address.port
              : candidate,
        });
      });
    };
    tryListen();
  });
}

// ---------------------------------------------------------------------------
// Write endpoints: accept and checkpoint from the viewer
// ---------------------------------------------------------------------------

/** Request header carrying the per-session token. */
export const TOKEN_HEADER = "x-visual-diff-token";
/** What the user must type to checkpoint from the viewer. */
export const CHECKPOINT_CONFIRMATION = "checkpoint";
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * State behind the write endpoints. The Inspector listens on the network,
 * so every write needs the random token printed in the terminal, and may only
 * touch the snapshots this session is showing.
 */
export interface ActionSession {
  token: string;
  source: "results" | "local";
  paths: BaselinePaths;
  resultsDir: string;
  repoRoot: string;
  outDir: string;
  /** Snapshot names shown in this session; the only names the endpoints accept. */
  names: ReadonlySet<string>;
  /** `results`: names accepted this session; the only names it may checkpoint. */
  accepted: Set<string>;
  /** Why actions are off regardless of the run marker (e.g. missing images). */
  staticDisabledReason?: string;
  im?: ImageMagick;
}

export function newSessionToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** Constant-time token comparison (hashing first hides the length, too). */
export function tokenMatches(
  expected: string,
  given: string | string[] | undefined
): boolean {
  if (typeof given !== "string" || expected.length === 0) return false;
  const digest = (s: string) => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(digest(expected), digest(given));
}

/** Whether `Origin` is present and names the host the request was sent to. */
export function isSameOrigin(headers: http.IncomingHttpHeaders): boolean {
  const { origin, host } = headers;
  if (typeof origin !== "string" || typeof host !== "string") return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.host === host
    );
  } catch {
    return false;
  }
}

/** Snapshots whose images are too incomplete to judge, with the reason. */
export function incompleteItems(
  items: readonly SnapshotMeta[],
  source: VisualDiffSource
): string[] {
  const problems: string[] = [];
  for (const item of items) {
    const label = item.snapshotName ?? `${item.name} [${item.browser}]`;
    if (item.snapshotName === undefined) {
      problems.push(`${label}: unknown Playwright project`);
    } else if (item.status === "deleted") {
      problems.push(`${label}: deleted`);
    } else if (item.afterUrl === undefined || item.after === undefined) {
      problems.push(`${label}: new image missing or unreadable`);
    } else if (
      item.status === "modified" &&
      (item.beforeUrl === undefined || item.before === undefined)
    ) {
      problems.push(`${label}: baseline image missing or unreadable`);
    } else if (
      source === "results" &&
      item.status === "modified" &&
      item.diffUrl === undefined
    ) {
      problems.push(
        `${label}: no diff (ImageMagick missing, no Playwright diff)`
      );
    }
  }
  return problems;
}

function disabledReason(session: ActionSession): string | undefined {
  if (session.staticDisabledReason !== undefined) {
    return session.staticDisabledReason;
  }
  if (session.source === "results") {
    const check = checkRunMarker(session.resultsDir, session.repoRoot);
    if (!check.ok) return check.reason;
  }
  return undefined;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: AcceptResponse | CheckpointResponse | ApiError
) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function parseRequest(raw: string): { names: string[]; confirm?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new HttpError(400, "Body must be a JSON object.");
  }
  const names = "names" in parsed ? parsed.names : undefined;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    !names.every((n): n is string => typeof n === "string")
  ) {
    throw new HttpError(400, "`names` must be a non-empty list of strings.");
  }
  const confirm = "confirm" in parsed ? parsed.confirm : undefined;
  return {
    names: [...new Set(names)].sort(),
    confirm: typeof confirm === "string" ? confirm : undefined,
  };
}

/** Local vs checkpoint images for `names`, for the second review step. */
function localReviewItems(
  session: ActionSession,
  names: ReadonlySet<string>
): SnapshotMeta[] {
  const imagesDir = path.join(session.outDir, IMAGES_SUBDIR);
  fs.mkdirSync(imagesDir, { recursive: true });
  return collectLocalEntries(session.paths)
    .entries.filter((e) => names.has(e.name))
    .map((e) =>
      materialize({ ...e, id: `local-${e.id}` }, imagesDir, session.im)
    );
}

/**
 * Handles `POST /api/accept` and `POST /api/checkpoint`. Exported for tests;
 * the Inspector routes every `/api/` request here.
 */
export async function handleApiRequest(
  session: ActionSession,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Write endpoints accept POST only.");
    }
    if (!isSameOrigin(req.headers)) {
      throw new HttpError(403, "Cross-origin request refused.");
    }
    if (!tokenMatches(session.token, req.headers[TOKEN_HEADER])) {
      throw new HttpError(
        403,
        "Missing or wrong session token. Open the URL the Inspector printed (it ends in #token=…)."
      );
    }
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.startsWith("application/json")) {
      throw new HttpError(415, "Content-Type must be application/json.");
    }
    const { names, confirm } = parseRequest(await readBody(req));
    const foreign = names.filter((n) => !session.names.has(n));
    if (foreign.length > 0) {
      throw new HttpError(
        400,
        `Not in this review session: ${foreign.join(", ")}`
      );
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/accept") {
      sendJson(res, 200, apiAccept(session, names));
    } else if (url.pathname === "/api/checkpoint") {
      sendJson(res, 200, apiCheckpoint(session, names, confirm));
    } else {
      throw new HttpError(404, `No endpoint ${url.pathname}.`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
    } else if (err instanceof AcceptRefusedError) {
      sendJson(res, 409, { error: err.message });
    } else {
      throw err;
    }
  }
}

function apiAccept(session: ActionSession, names: string[]): AcceptResponse {
  if (session.source !== "results") {
    throw new HttpError(400, "Accept is only available for --source results.");
  }
  const reason = disabledReason(session);
  if (reason !== undefined) {
    throw new HttpError(409, reason);
  }
  // The run marker was just checked; acceptFromActuals checks it again.
  const result = acceptFromActuals(session.paths, session.resultsDir, names, {
    repoRoot: session.repoRoot,
  });
  const valid = new Set(resolveLocal(session.paths).valid);
  const local = new Set(names.filter((n) => valid.has(n)));
  for (const n of local) session.accepted.add(n);
  return { ...result, items: localReviewItems(session, local) };
}

function apiCheckpoint(
  session: ActionSession,
  names: string[],
  confirm: string | undefined
): CheckpointResponse {
  if (confirm !== CHECKPOINT_CONFIRMATION) {
    throw new HttpError(
      400,
      `Checkpoint needs the typed confirmation "${CHECKPOINT_CONFIRMATION}".`
    );
  }
  if (session.staticDisabledReason !== undefined) {
    throw new HttpError(409, session.staticDisabledReason);
  }
  if (session.source === "results") {
    const notAccepted = names.filter((n) => !session.accepted.has(n));
    if (notAccepted.length > 0) {
      throw new HttpError(
        400,
        `Accept and review these locally first: ${notAccepted.join(", ")}`
      );
    }
  }
  let result: { promoted: string[]; skippedStale: string[] };
  try {
    result = checkpoint(session.paths, names);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  for (const n of result.promoted) session.accepted.delete(n);
  return {
    ...result,
    files: result.promoted.map((n) => {
      const abs = path.join(session.paths.snapshotDir, n);
      const rel = path.relative(session.repoRoot, abs);
      return rel.startsWith("..") ? abs : rel;
    }),
  };
}

/** Identifies the screenshots under review; see `VisualDiffManifest.reviewKey`. */
function reviewKeyFor(
  source: VisualDiffSource,
  options: VisualDiffOptions,
  items: readonly SnapshotMeta[]
): string {
  const hash = (s: string) =>
    crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
  if (source === "results") {
    const marker = readRunMarker(options.resultsDir ?? DEFAULT_RESULTS_DIR);
    return marker !== undefined
      ? `results:${marker.id}`
      : `results:nomarker:${hash(items.map((i) => i.id).join("\0"))}`;
  }
  if (source === "local") {
    const manifest = readManifest(options.localPaths ?? defaultPaths());
    return `local:${hash(JSON.stringify(manifest.entries))}`;
  }
  return `git:${options.ref ?? "HEAD"}:${hash(
    items.map((i) => i.id).join("\0")
  )}`;
}

/**
 * The snapshot names in the last `results` report (`<outDir>/manifest.json`),
 * for `visual-baselines accept --from-report`. Refuses a report of a
 * different run than the one in `resultsDir`.
 */
export function namesFromReport(
  outDir: string = DEFAULT_OUT_DIR,
  resultsDir: string = DEFAULT_RESULTS_DIR
): string[] {
  const file = path.resolve(outDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) {
    throw new AcceptRefusedError(
      `No report at ${file}. Run \`./morcus.sh visual-diff --source results\` first.`
    );
  }
  const manifest: VisualDiffManifest = JSON.parse(
    fs.readFileSync(file, "utf-8")
  );
  if (manifest.source !== "results") {
    throw new AcceptRefusedError(
      `The last report is of the ${manifest.source} source; --from-report needs a \`--source results\` report.`
    );
  }
  const marker = readRunMarker(resultsDir);
  if (marker === undefined || manifest.reviewKey !== `results:${marker.id}`) {
    throw new AcceptRefusedError(
      "The last report doesn't belong to the run in test-results/ (or that run has no marker). " +
        "Re-run `./morcus.sh visual-diff --source results` and review it first."
    );
  }
  const unnamed = manifest.items.filter((i) => i.snapshotName === undefined);
  if (unnamed.length > 0) {
    throw new AcceptRefusedError(
      `Can't map ${
        unnamed.length
      } reported snapshot(s) to a baseline name: ${unnamed
        .map((i) => i.id)
        .join(", ")}`
    );
  }
  return manifest.items.map((i) => i.snapshotName!).sort();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function selectEntries(options: VisualDiffOptions): {
  source: VisualDiffSource;
  entries: RawEntry[];
  beforeLabel: string;
  afterLabel: string;
  staleLocal?: string[];
} {
  const source = options.source ?? "auto";
  const ref = options.ref ?? "HEAD";
  const snapshotDir = options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR;
  const resultsDir = options.resultsDir ?? DEFAULT_RESULTS_DIR;

  const fromGit = () => ({
    source: "git" as const,
    entries: collectGitEntries(snapshotDir, ref),
    beforeLabel: ref,
    afterLabel: "Working copy",
  });
  const fromResults = () => ({
    source: "results" as const,
    entries: collectResultEntries(resultsDir),
    beforeLabel: "Expected",
    afterLabel: "Actual",
  });
  const fromLocal = () => {
    const { entries, stale } = collectLocalEntries(
      options.localPaths ?? defaultPaths()
    );
    return {
      source: "local" as const,
      entries,
      beforeLabel: "Checkpoint",
      afterLabel: "Local baseline",
      staleLocal: stale,
    };
  };

  if (source === "git") return fromGit();
  if (source === "results") return fromResults();
  if (source === "local") return fromLocal();
  const git = fromGit();
  if (git.entries.length > 0) return git;
  const results = fromResults();
  // Failures without a screenshot also count: they must not be reported as
  // "no changes" just because there is no image to show.
  if (
    results.entries.length > 0 ||
    collectFailuresWithoutSnapshot(resultsDir).length > 0
  ) {
    return results;
  }
  const local = fromLocal();
  return local.entries.length > 0 || local.staleLocal.length > 0 ? local : git;
}

export async function runVisualDiffInspector(
  options: VisualDiffOptions = {}
): Promise<VisualDiffResult> {
  const outDir = path.resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const { source, entries, beforeLabel, afterLabel, staleLocal } =
    selectEntries(options);

  console.log(`\n🔍 Visual Diff Inspector`);
  console.log(
    source === "git"
      ? `Comparing ${
          options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR
        } against ${beforeLabel}`
      : source === "local"
      ? `Comparing local baselines against the committed checkpoint`
      : `Reading Playwright failures from ${
          options.resultsDir ?? DEFAULT_RESULTS_DIR
        }`
  );

  const manifest: VisualDiffManifest = {
    source,
    beforeLabel,
    afterLabel,
    items: [],
  };
  if (staleLocal !== undefined && staleLocal.length > 0) {
    manifest.staleLocalBaselines = staleLocal;
    console.warn(
      `\n⚠ ${staleLocal.length} stale local baseline(s) ignored (the checkpoint changed since):\n` +
        staleLocal.map((n) => `  - ${n}`).join("\n") +
        "\n  Discard them with `./morcus.sh visual-baselines drop --stale`."
    );
  }
  const failuresWithoutSnapshot =
    source === "results"
      ? collectFailuresWithoutSnapshot(
          options.resultsDir ?? DEFAULT_RESULTS_DIR
        )
      : [];
  if (failuresWithoutSnapshot.length > 0) {
    manifest.failuresWithoutSnapshot = failuresWithoutSnapshot;
  }
  const warnFailuresWithoutSnapshot = () => {
    if (failuresWithoutSnapshot.length === 0) return;
    console.warn(
      `\n${failuresWithoutSnapshotWarning(failuresWithoutSnapshot).join("\n")}`
    );
  };
  if (entries.length === 0) {
    if (failuresWithoutSnapshot.length > 0) {
      warnFailuresWithoutSnapshot();
      console.log(`\nNo screenshot diffs to show.`);
    } else {
      console.log(`\n✅ No changed snapshots found.`);
    }
    return { manifest, reportMarkdown: "", outDir };
  }

  console.log(`Found ${entries.length} changed snapshot(s). Processing...`);
  // Only clear the directory we own, never `outDir` itself, since it is
  // user-configurable.
  const imagesDir = path.join(outDir, IMAGES_SUBDIR);
  fs.rmSync(imagesDir, { recursive: true, force: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  const im = detectImageMagick();
  if (im === undefined) {
    console.warn(
      "⚠️  ImageMagick not found: pixel counts will be unavailable and diff masks " +
        (source === "results"
          ? "will fall back to Playwright's."
          : "will be skipped.")
    );
  }
  manifest.items = entries.map((e) => materialize(e, imagesDir, im));
  manifest.reviewKey = reviewKeyFor(source, options, manifest.items);

  // Write endpoints, for the `results` and `local` sources when serving.
  const serving = options.startServer !== false;
  let session: ActionSession | undefined = undefined;
  if (serving && options.actions !== false && source !== "git") {
    const incomplete = incompleteItems(manifest.items, source);
    session = {
      token: options.token ?? newSessionToken(),
      source,
      paths: options.localPaths ?? defaultPaths(),
      resultsDir: path.resolve(options.resultsDir ?? DEFAULT_RESULTS_DIR),
      repoRoot: path.resolve(options.repoRoot ?? process.cwd()),
      outDir,
      names: new Set(
        manifest.items.flatMap((i) =>
          i.snapshotName === undefined ? [] : [i.snapshotName]
        )
      ),
      accepted: new Set(),
      staticDisabledReason:
        incomplete.length === 0
          ? undefined
          : `${
              incomplete.length
            } snapshot(s) can't be judged from the images here: ${incomplete
              .slice(0, 5)
              .join("; ")}${incomplete.length > 5 ? "; …" : ""}`,
      im,
    };
    const actions: ViewerActions = {
      flow: source === "results" ? "accept-then-checkpoint" : "checkpoint",
    };
    const reason = disabledReason(session);
    if (reason !== undefined) actions.disabledReason = reason;
    manifest.actions = actions;
  }

  writeViewer(outDir, manifest);
  const reportMarkdown = buildMarkdownReport(manifest);
  fs.writeFileSync(path.join(outDir, "report.md"), reportMarkdown);
  if (options.reportPath) {
    fs.writeFileSync(path.resolve(options.reportPath), reportMarkdown);
  }

  printSummary(manifest);
  // After the table, so it is the last thing in view, not scrolled away.
  warnFailuresWithoutSnapshot();
  console.log(
    "\n⚠️  Do not commit updated baselines without explicit human approval (AGENTS.md)."
  );
  console.log(`Viewer written to ${path.join(outDir, "index.html")}`);

  if (options.startServer === false) {
    return { manifest, reportMarkdown, outDir };
  }

  const host = options.host ?? DEFAULT_HOST;
  const started = await startViewerServer(
    outDir,
    options.port ?? DEFAULT_PORT,
    host,
    session
  );
  const isWildcard = host === "0.0.0.0" || host === "::";
  // The token rides in the fragment, which browsers never send to the server.
  const fragment = session === undefined ? "" : `#token=${session.token}`;
  const localUrl = `http://${isWildcard ? "localhost" : host}:${
    started.port
  }/${fragment}`;
  console.log(`\n🚀 Visual Diff Inspector running at ${localUrl}`);
  if (isWildcard) {
    console.log(
      `   Network: http://${os.hostname()}:${started.port}/${fragment}`
    );
  }
  if (session !== undefined) {
    console.log(
      "   The #token=… part enables accept/checkpoint in the viewer; without it, the viewer is read-only."
    );
    if (manifest.actions?.disabledReason !== undefined) {
      console.warn(`   Actions disabled: ${manifest.actions.disabledReason}`);
    }
  }
  console.log("   Press ? in the viewer for shortcuts, Ctrl+C to stop.\n");

  if (options.openBrowser) {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(opener, [localUrl], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => console.warn(`Could not run ${opener}.`));
    child.unref();
  }

  return {
    manifest,
    reportMarkdown,
    outDir,
    viewerUrl: localUrl,
    server: started.server,
  };
}
