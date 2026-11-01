/**
 * Shared TypeScript contracts for The Latin Library upstream snapshot
 * (`$THELATINLIBRARY_ROOT`: `raw/`, `manifest.json`, and `work_index.json`).
 *
 * Consumed by:
 * - C1 (`scraper`): Crawls `https://www.thelatinlibrary.com`, populates `raw/`,
 *   `manifest.json`, and `work_index.json`.
 * - C2 (`pagelayer`): Reads raw HTML pages.
 * - C7 (`porter`): Reads `raw/` and `manifest.json` to convert curated Library works.
 * - C8 (`lladapter`): Reads `work_index.json` and `manifest.json` to emit Open Texts
 *   catalog entries for `"candidate"` and `"partial"` works (dropping `"in_library"`
 *   and `"excluded"` works).
 */

/**
 * Sidecar metadata file written next to each crawled HTML file at
 * `raw/<pagePath>.meta.json` (or consolidated in `manifest.json`).
 */
export interface RawPageMeta {
  /** Full canonical URL on `https://www.thelatinlibrary.com/...`. */
  url: string;
  /** Date the page was fetched/verified, formatted as `YYYY-MM-DD`. */
  retrieved: string;
  /** Lowercase hex SHA-256 of the raw HTML bytes on disk. */
  sha256: string;
}

/**
 * Coarse provenance flag recorded on `SnapshotPageEntry.provenance` (backward-compatible
 * with the pilot's `ManifestEntry`).
 */
export type ProvenanceFlag = "noStatement" | "statementFound";

/**
 * Detailed classification of any provenance/edition/copyright statement found
 * in a page's header, body, or footer during the M1 provenance scan (Decision #20).
 *
 * - `"none"`: No edition, source, or copyright note found on the page.
 * - `"pre1930"`: Names a pre-1930 edition (e.g. Mommsen-Krueger, Mueller 1888, Migne PL).
 * - `"post1930_or_copyright"`: Names a post-1930 edition, translation, or modern
 *   copyright/permission notice; must be excluded (`excluded: true`).
 */
export type ProvenanceClassification =
  | "none"
  | "pre1930"
  | "post1930_or_copyright";

/**
 * Manifest entry for a single raw HTML page in `$THELATINLIBRARY_ROOT/manifest.json`,
 * keyed by relative path under `raw/` (e.g. `"resgestae.html"`, `"justin/1.html"`).
 *
 * Backward-compatible with the pilot's `ManifestEntry` in `src/scripts/thelatinlibrary/onboard.ts`.
 */
export interface SnapshotPageEntry extends RawPageMeta {
  /** Relative path under `raw/`, e.g. `"justin/1.html"`. */
  path?: string;
  /** Extracted page title (`<h1>` or `p.pagehead`), if present. */
  title?: string;
  /** Author index page that linked to this page, e.g. `"justin.html"`. */
  authorPage?: string;
  /** Work ID in `work_index.json` that owns this page, if assigned. */
  workId?: string;
  /** Whether a provenance/edition/copyright statement was detected on the page. */
  provenance: ProvenanceFlag;
  /** Detailed provenance classification from the M1 scan. */
  provenanceClassification?: ProvenanceClassification;
  /** Matching lines/paragraphs extracted by the provenance scanner. */
  provenanceStatements: string[];
  /** Extracted pre-1930 edition description, when determinable. */
  statedEdition?: string | null;
  /** True if this page is excluded due to post-1930 edition, copyright, or duplicate status. */
  excluded?: boolean;
  /** Human-readable reason when `excluded === true`. */
  exclusionReason?: string;
  /** Validation checks recorded by strict onboarding scripts (C7). */
  checks?: string[];
}

/**
 * Top-level schema of `$THELATINLIBRARY_ROOT/manifest.json`.
 * Keys are relative page paths under `raw/` (e.g. `"resgestae.html"`).
 */
export type SnapshotManifest = Record<string, SnapshotPageEntry>;

/**
 * Status of a Latin Library work in the Morcus identity map (`work_index.json`):
 * - `"in_library"`: Already in the curated Morcus Library (Perseus, Hypotactic,
 *   PHI public-domain, or a promoted Latin Library work under `$THELATINLIBRARY_ROOT/works/*.json`).
 *   Omitted from Open Texts so the two tiers never duplicate a work (Strategy Position 1).
 * - `"partial"`: Covered only partially by the Morcus Library (e.g. LL has books or
 *   fragments absent from Perseus, or vice versa). Included in Open Texts with a
 *   `partialCoverage` notice pointing to the Library (Decision #19).
 * - `"excluded"`: Post-1930 composition/translation, modern edition note, or copyright/
 *   permission statement (Decision #20). Omitted from both Library and Open Texts.
 * - `"candidate"`: Absent from the Morcus Library and free of post-1930/copyright
 *   exclusions (Decision #18). Listed in Open Texts (and eligible for future promotion to the Library).
 */
export type SnapshotWorkStatus =
  | "in_library"
  | "partial"
  | "excluded"
  | "candidate";

/**
 * Historical period classification for catalog filtering.
 */
export type SnapshotWorkPeriod =
  | "classical"
  | "late_antique"
  | "patristic"
  | "medieval"
  | "neolatin";

/**
 * Partial-coverage cross-reference to the curated Morcus Library (Decision #19).
 * Required when `SnapshotWorkEntry.status === "partial"`.
 */
export interface PartialCoverageInfo {
  /** Canonical Morcus Library work ID (e.g. `"phi2003.phi001.perseus-lat1"`). */
  libraryWorkId: string;
  /** Relative Morcus reader URL (e.g. `"/work/apicius/de_re_coquinaria"`). */
  libraryUrl: string;
  /** Author display name in the Morcus Library. */
  libraryAuthor: string;
  /** Work title in the Morcus Library. */
  libraryTitle: string;
  /** Human-readable explanation of what the Library covers vs. Open Texts. */
  note: string;
}

/**
 * Work-level entry in `$THELATINLIBRARY_ROOT/work_index.json`, grouping ordered
 * HTML pages by `(author, work)` and recording the Library identity map status.
 */
export interface SnapshotWorkEntry {
  /**
   * Stable work identifier (e.g. `"thelatinlibrary-augustus-resgestae"` for
   * promoted works, or `"ll/abbo-passio-sancti-edmundi"` / slug for Open Texts).
   */
  workId: string;
  /** Display author name (e.g. `"Abbo of Fleury"`, `"Augustus"`). */
  author: string;
  /** Display work title (e.g. `"Res Gestae Divi Augusti"`). */
  title: string;
  /** Historical era/period for catalog filtering. */
  period: SnapshotWorkPeriod;
  /** Optional author index page path under `raw/` (e.g. `"justin.html"`). */
  authorPage?: string;
  /**
   * Ordered list of canonical page paths under `raw/` (e.g.
   * `["justin/praefatio.html", "justin/1.html", ...]`). Duplicate/composite
   * or alternate-edition files are excluded from `pages` and listed in
   * `redundantOrAlternatePages`.
   */
  pages: string[];
  /**
   * Intra-LL duplicate, composite, or alternate-edition page paths identified
   * by `ll_file_duplicates.json` / audit that are omitted from `pages`.
   */
  redundantOrAlternatePages?: string[];
  /** Identity-map status against the curated Morcus Library. */
  status: SnapshotWorkStatus;
  /**
   * Matching Morcus Library work IDs when `status === "in_library"` or `"partial"`
   * (e.g. `["phi0690.phi003.perseus-lat2"]` or `["thelatinlibrary-augustus-resgestae"]`).
   */
  libraryWorkIds?: string[];
  /** Required when `status === "partial"` (Decision #19). */
  partialCoverage?: PartialCoverageInfo;
  /** Required when `status === "excluded"` (Decision #20). */
  exclusionReason?: string;
  /** Stated pre-1930 source edition if detected on any of the work's pages. */
  statedEdition?: string | null;
  /** Approximate Latin word count across `pages`. */
  wordCount?: number;
}

/**
 * Top-level schema of `$THELATINLIBRARY_ROOT/work_index.json`.
 */
export interface SnapshotWorkIndex {
  version: 1;
  /** ISO-8601 timestamp or `YYYY-MM-DD` date when the index was generated. */
  generatedAt: string;
  /** Optional git commit SHA of the `thelatinlibrary` repository. */
  sourceCommit?: string;
  /** All indexed Latin Library works in deterministic `(author, title, workId)` order. */
  works: SnapshotWorkEntry[];
}
