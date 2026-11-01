/* istanbul ignore file */

/**
 * CLI runner for crawling `https://www.thelatinlibrary.com/` into
 * `$THELATINLIBRARY_ROOT/raw/`, generating `$THELATINLIBRARY_ROOT/manifest.json`,
 * and building `$THELATINLIBRARY_ROOT/work_index.json`.
 *
 * Usage:
 *   npm run tsnp src/scripts/thelatinlibrary/crawl/run_crawl.ts -- [--refresh] [--index-only] [--max-pages <N>]
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { envVar } from "@/common/env_vars";
import { THE_LATIN_LIBRARY_ROOT_ENV } from "@/common/library/process_thelatinlibrary";
import {
  buildWorkIndex,
  type DuplicateFileEntry,
  type VerifiedAuditJson,
} from "@/scripts/thelatinlibrary/crawl/build_work_index";
import {
  buildManifestFromRaw,
  crawlLatinLibrary,
  HUB_INDEX_PAGES,
} from "@/scripts/thelatinlibrary/crawl/crawler";
import { normalizePagePath } from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

const DEFAULT_AUDIT_PATH =
  "/usr/local/google/home/nkprasad/.gemini/jetski/brain/fb1ed726-62bb-45e1-adf0-2508597ffa90/scratch/results/stage4/verified_audit_v2.json";
const DEFAULT_DUPLICATES_PATH =
  "/usr/local/google/home/nkprasad/.gemini/jetski/brain/fb1ed726-62bb-45e1-adf0-2508597ffa90/scratch/results/stage4/ll_file_duplicates.json";

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const indexOnly = args.includes("--index-only");
  const maxPagesArg = getArgValue(args, "--max-pages");
  const maxPages = maxPagesArg ? Number(maxPagesArg) : Infinity;
  const rootDir =
    getArgValue(args, "--root") ?? envVar(THE_LATIN_LIBRARY_ROOT_ENV);
  const auditPath = getArgValue(args, "--audit") ?? DEFAULT_AUDIT_PATH;
  const duplicatesPath =
    getArgValue(args, "--duplicates") ?? DEFAULT_DUPLICATES_PATH;

  const audit: VerifiedAuditJson = JSON.parse(
    fs.readFileSync(auditPath, "utf8")
  );
  const duplicates: DuplicateFileEntry[] = fs.existsSync(duplicatesPath)
    ? JSON.parse(fs.readFileSync(duplicatesPath, "utf8"))
    : [];

  // Collect seed paths from hub pages + all audit ll_paths (converted .txt -> .html)
  const seedSet = new Set<string>(HUB_INDEX_PAGES);
  const allAuditEntries = [
    ...(audit.present_same_works ?? []),
    ...(audit.different_name_crosswalk ?? []),
    ...(audit.partial_coverage_works ?? []),
    ...(audit.classical_and_late_antique_missing ?? []),
    ...(audit.patristic_christian_missing ?? []),
    ...(audit.medieval_works ?? []),
    ...(audit.neolatin_works ?? []),
  ];
  for (const entry of allAuditEntries) {
    for (const p of entry.ll_paths ?? []) {
      const norm = normalizePagePath(p);
      const htmlPath = norm.replace(/\.txt$/i, ".html");
      const shtmlPath = norm.replace(/\.txt$/i, ".shtml");
      if (fs.existsSync(path.join(rootDir, "raw", shtmlPath))) {
        seedSet.add(shtmlPath);
      } else {
        seedSet.add(htmlPath);
      }
    }
  }

  if (!indexOnly) {
    console.log(
      `Starting hub-based crawl into ${rootDir} (${HUB_INDEX_PAGES.length} hub seeds, refresh=${refresh})...`
    );
    const hubSummary = await crawlLatinLibrary({
      rootDir,
      seedPaths: HUB_INDEX_PAGES,
      refresh,
      maxPages,
      onProgress: (msg) => console.log(`  ${msg}`),
    });
    console.log("Hub crawl complete:", JSON.stringify(hubSummary, null, 2));

    // Check if any audit ll_paths are still missing from raw/
    const missingAuditSeeds: string[] = [];
    for (const entry of allAuditEntries) {
      for (const p of entry.ll_paths ?? []) {
        const norm = normalizePagePath(p);
        const htmlPath = norm.replace(/\.txt$/i, ".html");
        const shtmlPath = norm.replace(/\.txt$/i, ".shtml");
        if (
          !fs.existsSync(path.join(rootDir, "raw", htmlPath)) &&
          !fs.existsSync(path.join(rootDir, "raw", shtmlPath))
        ) {
          missingAuditSeeds.push(htmlPath);
        }
      }
    }
    if (missingAuditSeeds.length > 0 && hubSummary.fetchedCount < maxPages) {
      console.log(
        `Fetching ${missingAuditSeeds.length} remaining audit paths not linked from hubs...`
      );
      const extraSummary = await crawlLatinLibrary({
        rootDir,
        seedPaths: missingAuditSeeds,
        refresh: false,
        maxPages: maxPages - hubSummary.fetchedCount,
        onProgress: (msg) => console.log(`  ${msg}`),
      });
      console.log(
        "Audit backfill complete:",
        JSON.stringify(extraSummary, null, 2)
      );
    }
  }

  const manifest = buildManifestFromRaw(rootDir);
  fs.writeFileSync(
    path.join(rootDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

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

  let sourceCommit: string | undefined;
  try {
    sourceCommit = execSync("git rev-parse HEAD", {
      cwd: rootDir,
      encoding: "utf8",
    }).trim();
  } catch {
    sourceCommit = undefined;
  }

  const workIndex = buildWorkIndex({
    rootDir,
    manifest,
    audit,
    duplicates,
    sourceCommit,
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
  fs.writeFileSync(
    path.join(rootDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(rootDir, "work_index.json"),
    JSON.stringify(workIndex, null, 2) + "\n"
  );

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
