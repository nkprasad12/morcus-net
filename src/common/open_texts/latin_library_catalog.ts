/**
 * Builds Open Texts catalog entries (`OpenTextCatalogEntry[]`) and repository
 * metadata (`OpenTextSourceRepoMeta`) from a Latin Library snapshot
 * (`work_index.json`, `manifest.json`, and `works/*.json`).
 */

import fs from "fs";
import path from "path";
import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
  type OpenTextCatalogEntry,
  type OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import type {
  SnapshotManifest,
  SnapshotWorkIndex,
} from "@/common/thelatinlibrary/snapshot_types";

export const THE_LATIN_LIBRARY_DEFAULT_REPO = "nkprasad12/TheLatinLibrary";

export const THE_LATIN_LIBRARY_LICENSE =
  "Public domain Latin text; HTML transcription from The Latin Library";

export interface BuildLatinLibraryCatalogOptions {
  readonly repo?: string;
  /**
   * Optional set of work IDs (either raw `workId` or normalized `ll/<slug>`)
   * that have been promoted to `$THELATINLIBRARY_ROOT/works/*.json` and must
   * be omitted from Open Texts.
   */
  readonly promotedWorkIds?: ReadonlySet<string>;
}

export interface BuildLatinLibraryFromRootOptions {
  readonly rootDir: string;
  readonly commit: string;
  readonly repo?: string;
}

function extractOwnerRepo(repoUrlOrSlug: string): string {
  const trimmed = repoUrlOrSlug.trim();
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(
      trimmed
    );
  return match ? match[1] : trimmed.replace(/\.git$/i, "");
}

/**
 * Builds the `OpenTextSourceRepoMeta` descriptor for `thelatinlibrary`.
 */
export function buildLatinLibrarySourceMeta(
  commit: string,
  repoSlug: string = THE_LATIN_LIBRARY_DEFAULT_REPO
): OpenTextSourceRepoMeta {
  const repo = extractOwnerRepo(repoSlug);
  return {
    source: "thelatinlibrary",
    label: "The Latin Library",
    repo,
    commit,
    rawBaseUrl: buildRawGithubBaseUrl(repo, commit),
    fallbackBaseUrl: buildJsDelivrBaseUrl(repo, commit),
    license: THE_LATIN_LIBRARY_LICENSE,
  };
}

/**
 * Normalizes a `SnapshotWorkEntry.workId` into an Open Texts catalog `id`
 * (`"ll/<slug>"`).
 */
export function normalizeLatinLibraryOpenTextId(workId: string): string {
  return workId.startsWith("ll/")
    ? workId
    : `ll/${workId.replace(/^thelatinlibrary-/, "")}`;
}

/**
 * Scans `$THELATINLIBRARY_ROOT/works/*.json` (when present) to collect all
 * promoted work IDs so they automatically drop out of Open Texts.
 */
export function loadPromotedLatinLibraryWorkIds(worksDir: string): Set<string> {
  const promoted = new Set<string>();
  if (!fs.existsSync(worksDir)) {
    return promoted;
  }
  const files = fs.readdirSync(worksDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const stem = file.slice(0, -".json".length);
    promoted.add(stem);
    promoted.add(normalizeLatinLibraryOpenTextId(stem));
  }
  return promoted;
}

/**
 * Converts `SnapshotWorkIndex` + `SnapshotManifest` into Open Texts catalog
 * entries for all `"candidate"` and `"partial"` works, omitting `"in_library"`,
 * `"excluded"`, and any work present in `promotedWorkIds`.
 */
export function buildLatinLibraryOpenTextEntries(
  workIndex: SnapshotWorkIndex,
  manifest: SnapshotManifest,
  sourceCommit: string,
  options?: BuildLatinLibraryCatalogOptions
): {
  sourceMeta: OpenTextSourceRepoMeta;
  entries: OpenTextCatalogEntry[];
} {
  const sourceMeta = buildLatinLibrarySourceMeta(
    sourceCommit,
    options?.repo ?? THE_LATIN_LIBRARY_DEFAULT_REPO
  );
  const promoted = options?.promotedWorkIds;
  const entries: OpenTextCatalogEntry[] = [];

  for (const work of workIndex.works) {
    if (work.status !== "candidate" && work.status !== "partial") {
      continue;
    }
    const id = normalizeLatinLibraryOpenTextId(work.workId);
    if (promoted && (promoted.has(work.workId) || promoted.has(id))) {
      continue;
    }

    const firstPage = work.pages[0] ?? "";
    const manifestKey = firstPage.replace(/^raw\//, "");
    const sourceUrl =
      manifest[manifestKey]?.url ??
      manifest[firstPage]?.url ??
      `https://www.thelatinlibrary.com/${manifestKey}`;

    const entry: OpenTextCatalogEntry = {
      id,
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      author: work.author,
      title: work.title,
      period: work.period,
      files: work.pages.map((p) => (p.startsWith("raw/") ? p : `raw/${p}`)),
      sourceUrl,
      license: THE_LATIN_LIBRARY_LICENSE,
      statedEdition: work.statedEdition ?? null,
      ...(work.status === "partial" && work.partialCoverage
        ? {
            partialCoverage: {
              libraryWorkId: work.partialCoverage.libraryWorkId,
              libraryUrl: work.partialCoverage.libraryUrl,
              libraryAuthor: work.partialCoverage.libraryAuthor,
              libraryTitle: work.partialCoverage.libraryTitle,
              message: work.partialCoverage.note,
            },
          }
        : {}),
      ...(work.wordCount !== undefined ? { wordCount: work.wordCount } : {}),
    };

    entries.push(entry);
  }

  return { sourceMeta, entries };
}

/**
 * Loads `work_index.json`, `manifest.json`, and `works/*.json` from `rootDir`
 * and builds the Latin Library Open Texts catalog entries.
 */
export function buildLatinLibraryOpenTextEntriesFromRoot(
  options: BuildLatinLibraryFromRootOptions
): {
  sourceMeta: OpenTextSourceRepoMeta;
  entries: OpenTextCatalogEntry[];
} {
  const workIndexPath = path.join(options.rootDir, "work_index.json");
  const manifestPath = path.join(options.rootDir, "manifest.json");
  if (!fs.existsSync(workIndexPath)) {
    throw new Error(
      `The Latin Library work_index.json not found at ${workIndexPath}`
    );
  }
  const workIndex: SnapshotWorkIndex = JSON.parse(
    fs.readFileSync(workIndexPath, "utf8")
  );
  const manifest: SnapshotManifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {};
  const promotedWorkIds = loadPromotedLatinLibraryWorkIds(
    path.join(options.rootDir, "works")
  );

  return buildLatinLibraryOpenTextEntries(workIndex, manifest, options.commit, {
    repo: options.repo,
    promotedWorkIds,
  });
}
