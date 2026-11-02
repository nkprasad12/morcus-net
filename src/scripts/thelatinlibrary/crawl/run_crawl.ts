/* istanbul ignore file */

/**
 * CLI runner for the Latin Library snapshot in `$THELATINLIBRARY_ROOT`:
 * crawls `https://www.thelatinlibrary.com/` into `raw/`, then builds
 * `manifest.json` and `work_index.json`.
 *
 * Usage:
 *   npm run tsnp src/scripts/thelatinlibrary/crawl/run_crawl.ts -- [flags]
 *
 * Flags:
 *   --index-only           Don't fetch anything. The link graph (author and
 *                          hub pages) is rebuilt offline from `raw/`.
 *   --refresh              Re-fetch every page (conditional requests).
 *   --max-pages <N>        Stop after fetching N pages (positive integer).
 *   --root <dir>           Data repo (default: $THELATINLIBRARY_ROOT).
 *   --audit <file>         Coverage audit (default: <root>/audit/verified_audit_v2.json).
 *   --duplicates <file>    Duplicate-file list (default: <root>/audit/ll_file_duplicates.json).
 *   --overrides <file>     Curated corrections (default: <root>/audit/work_index_overrides.json).
 *   --repair-sidecars      Fix stale `sha256` values in `raw/*.meta.json` and exit.
 *   --retrieved <date>     With --repair-sidecars: `retrieved` date (YYYY-MM-DD)
 *                          for pages with a missing or malformed sidecar.
 *
 * The audit inputs are documented in `<root>/audit/README.md`.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { envVar } from "@/common/env_vars";
import { THE_LATIN_LIBRARY_ROOT_ENV } from "@/common/library/process_thelatinlibrary";
import type {
  SnapshotManifest,
  SnapshotWorkIndex,
} from "@/common/thelatinlibrary/snapshot_types";
import {
  buildWorkIndex,
  type DuplicateFileEntry,
  type VerifiedAuditJson,
  type WorkIndexOverrides,
} from "@/scripts/thelatinlibrary/crawl/build_work_index";
import {
  buildManifestFromRaw,
  crawlLatinLibrary,
  HUB_INDEX_PAGES,
  LinkGraph,
  repairRawSidecars,
} from "@/scripts/thelatinlibrary/crawl/crawler";
import { normalizePagePath } from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function fail(message: string): never {
  console.error(`run_crawl: ${message}`);
  process.exit(1);
}

function parseMaxPages(value: string | undefined): number {
  if (value === undefined) return Infinity;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    fail(`--max-pages must be a positive integer, got "${value}".`);
  }
  return Number(value);
}

function readRequiredJson<T>(filePath: string, what: string): T {
  if (!fs.existsSync(filePath)) {
    fail(
      `${what} not found at ${filePath}. It is committed to the data repo ` +
        `under audit/ (see audit/README.md); pass another location with the matching flag.`
    );
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fail(`${what} at ${filePath} is not valid JSON: ${String(err)}`);
  }
}

function readOptionalJson<T>(filePath: string): T | undefined {
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : undefined;
}

function git(rootDir: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * The commit holding the `raw/` snapshot the index is built from: the last
 * commit that touched `raw/`. `undefined` (with a warning) if `raw/` has
 * uncommitted changes, since no commit then holds those bytes.
 */
function snapshotCommit(rootDir: string): string | undefined {
  const dirty = git(rootDir, ["status", "--porcelain", "--", "raw"]);
  if (dirty === undefined) return undefined;
  if (dirty.length > 0) {
    console.warn(
      "raw/ has uncommitted changes; omitting sourceCommit. Commit raw/ and re-run --index-only."
    );
    return undefined;
  }
  return git(rootDir, ["log", "-1", "--format=%H", "--", "raw"]) || undefined;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const indexOnly = args.includes("--index-only");
  const maxPages = parseMaxPages(getArgValue(args, "--max-pages"));
  const rootDir =
    getArgValue(args, "--root") ?? envVar(THE_LATIN_LIBRARY_ROOT_ENV);
  const auditDir = path.join(rootDir, "audit");

  if (args.includes("--repair-sidecars")) {
    const { repaired, unrepaired } = repairRawSidecars(rootDir, {
      retrievedForMissing: getArgValue(args, "--retrieved"),
    });
    console.log(`Repaired ${repaired.length} sidecars.`);
    if (unrepaired.length > 0) {
      fail(
        `${unrepaired.length} pages have a missing or malformed sidecar ` +
          `(e.g. ${unrepaired[0].page}); pass --retrieved YYYY-MM-DD to write them.`
      );
    }
    return;
  }

  const auditPath =
    getArgValue(args, "--audit") ??
    path.join(auditDir, "verified_audit_v2.json");
  const duplicatesPath =
    getArgValue(args, "--duplicates") ??
    path.join(auditDir, "ll_file_duplicates.json");
  const overridesPath =
    getArgValue(args, "--overrides") ??
    path.join(auditDir, "work_index_overrides.json");

  const audit = readRequiredJson<VerifiedAuditJson>(
    auditPath,
    "Coverage audit (verified_audit_v2.json)"
  );
  const duplicates = readRequiredJson<DuplicateFileEntry[]>(
    duplicatesPath,
    "Duplicate-file list (ll_file_duplicates.json)"
  );
  const overrides = readRequiredJson<WorkIndexOverrides>(
    overridesPath,
    "Work index overrides (work_index_overrides.json)"
  );

  const manifestPath = path.join(rootDir, "manifest.json");
  const workIndexPath = path.join(rootDir, "work_index.json");
  const previousManifest =
    readOptionalJson<SnapshotManifest>(manifestPath) ?? {};
  const previousIndex = readOptionalJson<SnapshotWorkIndex>(workIndexPath);

  const allAuditEntries = [
    ...(audit.present_same_works ?? []),
    ...(audit.different_name_crosswalk ?? []),
    ...(audit.partial_coverage_works ?? []),
    ...(audit.classical_and_late_antique_missing ?? []),
    ...(audit.patristic_christian_missing ?? []),
    ...(audit.medieval_works ?? []),
    ...(audit.neolatin_works ?? []),
  ];
  // Audit paths (`.txt`) that aren't in raw/ under either HTML extension.
  const missingAuditPages = (): string[] => {
    const missing: string[] = [];
    for (const entry of allAuditEntries) {
      for (const p of entry.ll_paths ?? []) {
        const norm = normalizePagePath(p);
        const htmlPath = norm.replace(/\.txt$/i, ".html");
        const shtmlPath = norm.replace(/\.txt$/i, ".shtml");
        if (
          !fs.existsSync(path.join(rootDir, "raw", htmlPath)) &&
          !fs.existsSync(path.join(rootDir, "raw", shtmlPath))
        ) {
          missing.push(htmlPath);
        }
      }
    }
    return missing;
  };

  const links = new LinkGraph();
  const mergeLinks = (from: LinkGraph) => {
    for (const [p, a] of from.authorPage) links.authorPage.set(p, a);
    for (const [p, h] of from.hubPage) links.hubPage.set(p, h);
  };

  if (indexOnly) {
    console.log(`Rebuilding the link graph offline from ${rootDir}/raw ...`);
    const { summary, links: offlineLinks } = await crawlLatinLibrary({
      rootDir,
      seedPaths: HUB_INDEX_PAGES,
      offline: true,
    });
    mergeLinks(offlineLinks);
    console.log(
      `Walked ${summary.skippedCount} pages; ${summary.missingOffline.length} linked pages are not in raw/.`
    );
  } else {
    console.log(
      `Starting hub-based crawl into ${rootDir} (${HUB_INDEX_PAGES.length} hub seeds, refresh=${refresh})...`
    );
    const hub = await crawlLatinLibrary({
      rootDir,
      seedPaths: HUB_INDEX_PAGES,
      refresh,
      maxPages,
      onProgress: (msg) => console.log(`  ${msg}`),
    });
    mergeLinks(hub.links);
    console.log("Hub crawl complete:", JSON.stringify(hub.summary, null, 2));

    const missing = missingAuditPages();
    if (missing.length > 0 && hub.summary.fetchedCount < maxPages) {
      console.log(
        `Fetching ${missing.length} remaining audit paths not linked from hubs...`
      );
      const extra = await crawlLatinLibrary({
        rootDir,
        seedPaths: missing,
        refresh: false,
        maxPages: maxPages - hub.summary.fetchedCount,
        onProgress: (msg) => console.log(`  ${msg}`),
      });
      mergeLinks(extra.links);
      console.log(
        "Audit backfill complete:",
        JSON.stringify(extra.summary, null, 2)
      );
    }
  }

  const { manifest, sidecarProblems } = buildManifestFromRaw(rootDir, {
    previous: previousManifest,
    links,
  });
  if (sidecarProblems.length > 0) {
    for (const p of sidecarProblems.slice(0, 20)) {
      console.error(`  ${p.page}: ${p.problem}`);
    }
    fail(
      `${sidecarProblems.length} pages in raw/ have sidecar problems; ` +
        `run with --repair-sidecars first. Nothing was written.`
    );
  }

  // Build libraryUrlMap for partial_coverage_works
  const libraryUrlMap = new Map<string, string>();
  for (const entry of audit.partial_coverage_works ?? []) {
    const libId =
      entry.perseus_id ?? entry.hypotactic_id ?? entry.phi_json_id ?? "";
    if (
      libId &&
      !libId.includes("..") &&
      !libId.startsWith("hypotactic:") &&
      entry.perseus_author &&
      entry.perseus_title
    ) {
      const urlAuthor = entry.perseus_author
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const urlName = entry.perseus_title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (urlAuthor && urlName) {
        libraryUrlMap.set(libId, `/work/${urlAuthor}/${urlName}`);
      }
    }
  }

  const workIndex = buildWorkIndex({
    rootDir,
    manifest,
    audit,
    duplicates,
    overrides,
    previousIndex,
    sourceCommit: snapshotCommit(rootDir),
    libraryUrlMap,
  });

  // Back-populate workId onto manifest entries
  for (const work of workIndex.works) {
    for (const p of work.pages) {
      if (manifest[p] && !manifest[p].workId) {
        manifest[p].workId = work.workId;
      }
    }
  }
  writeJson(manifestPath, manifest);
  writeJson(workIndexPath, workIndex);

  const counts = {
    in_library: 0,
    partial: 0,
    excluded: 0,
    candidate: 0,
  };
  for (const w of workIndex.works) {
    counts[w.status]++;
  }
  console.log(`Built work_index.json: ${workIndex.works.length} works`, counts);
}

void main();
