/**
 * Builds Experimental Texts catalog entries (`ExperimentalTextCatalogEntry[]`) and repository
 * metadata (`ExperimentalTextSourceRepoMeta`) from a Latin Library snapshot
 * (`work_index.json` and `manifest.json`).
 */

import {
  THE_LATIN_LIBRARY_DEFAULT_REPO,
  THE_LATIN_LIBRARY_LICENSE,
  buildLatinLibrarySourceMeta,
  type ExperimentalTextCatalogEntry,
  type ExperimentalTextPeriod,
  type ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import { normalizeExperimentalTextCatalogEntries } from "@/common/experimental_texts/catalog_normalizer";
import type {
  SnapshotManifest,
  SnapshotWorkIndex,
} from "@/common/thelatinlibrary/snapshot_types";

export {
  THE_LATIN_LIBRARY_DEFAULT_REPO,
  THE_LATIN_LIBRARY_LICENSE,
  buildLatinLibrarySourceMeta,
};

export interface BuildLatinLibraryCatalogOptions {
  readonly repo?: string;
  /**
   * Optional set of work IDs (either raw `workId` or normalized `ll/<slug>`)
   * that have been promoted to `$THELATINLIBRARY_ROOT/works/*.json` and must
   * be omitted from Experimental Texts.
   */
  readonly promotedWorkIds?: ReadonlySet<string>;
}

/**
 * Normalizes a `SnapshotWorkEntry.workId` into an Experimental Texts catalog `id`
 * (`"ll/<slug>"`).
 */
export function normalizeLatinLibraryExperimentalTextId(
  workId: string
): string {
  return workId.startsWith("ll/")
    ? workId
    : `ll/${workId.replace(/^thelatinlibrary-/, "")}`;
}

/**
 * Formats a user-facing notice when a work is partially covered by the curated
 * Morcus Library, avoiding internal maintainer shorthand from `work.partialCoverage.note`.
 */
export function formatPartialCoverageMessage(partial: {
  readonly libraryAuthor?: string;
  readonly libraryTitle?: string;
}): string {
  const title = partial.libraryTitle?.trim();
  const author = partial.libraryAuthor?.trim();
  if (title && author) {
    return `A curated edition of ${title} (${author}) is available in the Library.`;
  }
  if (title) {
    return `A curated edition of ${title} is available in the Library.`;
  }
  return "A curated edition of this work is available in the Library.";
}

/**
 * Converts `SnapshotWorkIndex` + `SnapshotManifest` into Experimental Texts catalog
 * entries for all `"candidate"` and `"partial"` works, omitting `"in_library"`,
 * `"excluded"`, and any work present in `promotedWorkIds`.
 */
export function buildLatinLibraryExperimentalTextEntries(
  workIndex: SnapshotWorkIndex,
  manifest: SnapshotManifest,
  sourceCommit: string,
  options?: BuildLatinLibraryCatalogOptions
): {
  sourceMeta: ExperimentalTextSourceRepoMeta;
  entries: ExperimentalTextCatalogEntry[];
} {
  const sourceMeta = buildLatinLibrarySourceMeta(
    sourceCommit,
    options?.repo ?? THE_LATIN_LIBRARY_DEFAULT_REPO
  );
  const promoted = options?.promotedWorkIds;
  const entries: ExperimentalTextCatalogEntry[] = [];

  for (const work of workIndex.works) {
    if (work.status !== "candidate" && work.status !== "partial") {
      continue;
    }
    const id = normalizeLatinLibraryExperimentalTextId(work.workId);
    if (promoted && (promoted.has(work.workId) || promoted.has(id))) {
      continue;
    }

    const firstPage = work.pages[0] ?? "";
    const manifestKey = firstPage.replace(/^raw\//, "");
    const sourceUrl =
      manifest[manifestKey]?.url ??
      manifest[firstPage]?.url ??
      `https://www.thelatinlibrary.com/${manifestKey}`;

    const period: ExperimentalTextPeriod =
      work.period === "neolatin"
        ? "neolatin"
        : work.period === "medieval" || /isidore of seville/i.test(work.author)
        ? "medieval"
        : "ancient";

    const entry: ExperimentalTextCatalogEntry = {
      id,
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      author: work.author,
      title: work.title,
      period,
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
              message: formatPartialCoverageMessage(work.partialCoverage),
            },
          }
        : {}),
      ...(work.wordCount !== undefined ? { wordCount: work.wordCount } : {}),
    };

    entries.push(entry);
  }

  // Normalizes authors and titles (`catalog_normalizer.ts`).
  return {
    sourceMeta,
    entries: normalizeExperimentalTextCatalogEntries(entries),
  };
}
