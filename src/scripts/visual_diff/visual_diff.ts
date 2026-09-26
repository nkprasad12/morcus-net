/**
 * Visual Diff Inspector: collects changed screenshot baselines, renders
 * before / after / diff images, and serves an interactive viewer for them.
 *
 * Two sources are supported:
 * - `git`: compares snapshot PNGs in the working tree against a git ref. This
 *   is what you want after `e2e --visual --update`.
 * - `results`: reads Playwright's failure output (`*-expected.png`,
 *   `*-actual.png`, `*-diff.png`) from `test-results/`. This is what you want
 *   after a failing `e2e --visual` run, *before* deciding to update baselines.
 *
 * External tools: `git` (required for the `git` source) and ImageMagick
 * (optional; used for pixel counts and diff masks).
 */

import { execFileSync, spawn, spawnSync } from "child_process";
import esbuild from "esbuild";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type {
  ImageDims,
  SnapshotCategory,
  SnapshotMeta,
  SnapshotSize,
  SnapshotStatus,
  VisualDiffManifest,
  VisualDiffSource,
} from "@/scripts/visual_diff/visual_diff_types";

export const DEFAULT_SNAPSHOT_DIR =
  "src/integration/screenshot/browser_v2_screenshot.test.ts-snapshots";
export const DEFAULT_RESULTS_DIR = "test-results";
export const DEFAULT_OUT_DIR = ".cache/visual-diff";
export const DEFAULT_PORT = 8899;
/**
 * All interfaces, matching the dev server (`start_server.ts`), so the viewer is
 * reachable from another machine (e.g. when running on a remote workstation).
 * The content is low-risk: read-only screenshots of the dev UI. Pass
 * `--host 127.0.0.1` to restrict it to this machine.
 */
export const DEFAULT_HOST = "0.0.0.0";

const VIEWER_DIR = path.join(__dirname, "viewer");
const IMAGES_SUBDIR = "images";
const MANIFEST_PLACEHOLDER = "__VISUAL_DIFF_MANIFEST__";

/**
 * Playwright project names from `playwright.config.ts`, and the form factor
 * each one renders at.
 */
const PROJECT_SIZES: Record<string, SnapshotSize> = {
  chromium: "large",
  firefox: "large",
  webkit: "large",
  MobileChrome: "small",
  FirefoxSmallScreen: "small",
  MobileSafari: "small",
};

/** Longest first, so `FirefoxSmallScreen` wins over `firefox`. */
const KNOWN_PROJECTS = Object.keys(PROJECT_SIZES).sort(
  (a, b) => b.length - a.length
);

export function sizeForProject(project: string): SnapshotSize {
  return PROJECT_SIZES[project] ?? "unknown";
}

export interface VisualDiffOptions {
  /** Where to look for changes. `auto` tries `git` first, then `results`. */
  source?: VisualDiffSource | "auto";
  /** Snapshot directory for the `git` source. */
  snapshotDir?: string;
  /** Git ref to compare against for the `git` source. */
  ref?: string;
  /** Playwright output directory for the `results` source. */
  resultsDir?: string;
  outDir?: string;
  startServer?: boolean;
  port?: number;
  host?: string;
  openBrowser?: boolean;
  reportPath?: string;
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

/** Returns the Playwright project encoded in a `test-results` directory name. */
export function projectFromResultsDir(dirName: string): string | undefined {
  const withoutRetry = dirName.replace(/-retry\d+$/, "");
  return KNOWN_PROJECTS.find((p) =>
    withoutRetry.toLowerCase().endsWith(`-${p.toLowerCase()}`)
  );
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

function safeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, "_");
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
export function detectImageMagick(): ImageMagick | undefined {
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

export function collectResultEntries(resultsDir: string): RawEntry[] {
  const absDir = path.resolve(resultsDir);
  if (!fs.existsSync(absDir)) {
    return [];
  }
  // Later retries overwrite earlier attempts of the same snapshot.
  const byId = new Map<string, RawEntry>();
  const dirs = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dirName of dirs) {
    const dir = path.join(absDir, dirName);
    const browserHint = projectFromResultsDir(dirName);
    for (const file of fs.readdirSync(dir)) {
      const match = file.match(/^(.*)-actual\.png$/);
      if (match === null) {
        continue;
      }
      const stem = match[1];
      const expected = path.join(dir, `${stem}-expected.png`);
      const diff = path.join(dir, `${stem}-diff.png`);
      const hasExpected = fs.existsSync(expected);
      const id = safeId(`${stem}-${browserHint ?? dirName}`);
      byId.set(id, {
        id,
        name: `${stem}.png`,
        browserHint,
        status: hasExpected ? "modified" : "added",
        afterPath: path.join(dir, file),
        writeBefore: hasExpected
          ? (dest) => fs.copyFileSync(expected, dest)
          : undefined,
        fallbackDiffPath: fs.existsSync(diff) ? diff : undefined,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
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
export function writeViewer(outDir: string, manifest: VisualDiffManifest) {
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
    "| Scenario | Browser | Size | Mode | Theme | Diff | Diff pixels | Before | After |",
    "| :--- | :--- | :--- | :--- | :--- | ---: | ---: | :--- | :--- |",
  ];
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
    "> must not be committed without explicit human approval.",
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
 * Starts a static file server for `outDir`. If `port` is taken, tries the
 * next few ports.
 */
export function startViewerServer(
  outDir: string,
  port: number,
  host: string
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
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
        resolve({ server, port: candidate });
      });
    };
    tryListen();
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function selectEntries(options: VisualDiffOptions): {
  source: VisualDiffSource;
  entries: RawEntry[];
  beforeLabel: string;
  afterLabel: string;
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

  if (source === "git") return fromGit();
  if (source === "results") return fromResults();
  const git = fromGit();
  if (git.entries.length > 0) return git;
  const results = fromResults();
  return results.entries.length > 0 ? results : git;
}

export async function runVisualDiffInspector(
  options: VisualDiffOptions = {}
): Promise<VisualDiffResult> {
  const outDir = path.resolve(options.outDir ?? DEFAULT_OUT_DIR);
  const { source, entries, beforeLabel, afterLabel } = selectEntries(options);

  console.log(`\n🔍 Visual Diff Inspector`);
  console.log(
    source === "git"
      ? `Comparing ${
          options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR
        } against ${beforeLabel}`
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
  if (entries.length === 0) {
    console.log(`\n✅ No changed snapshots found.`);
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

  writeViewer(outDir, manifest);
  const reportMarkdown = buildMarkdownReport(manifest);
  fs.writeFileSync(path.join(outDir, "report.md"), reportMarkdown);
  if (options.reportPath) {
    fs.writeFileSync(path.resolve(options.reportPath), reportMarkdown);
  }

  printSummary(manifest);
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
    host
  );
  const isWildcard = host === "0.0.0.0" || host === "::";
  const localUrl = `http://${isWildcard ? "localhost" : host}:${started.port}/`;
  console.log(`\n🚀 Visual Diff Inspector running at ${localUrl}`);
  if (isWildcard) {
    console.log(`   Network: http://${os.hostname()}:${started.port}/`);
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
