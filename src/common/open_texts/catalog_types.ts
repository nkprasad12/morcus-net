/**
 * Shared TypeScript contracts for the Open Texts metadata catalog and JSON bundle
 * (`src/common/open_texts/catalog_types.ts`).
 *
 * Consumed by:
 * - C5 (`catalog`): Builds the Open Texts catalog from pinned `patrologia_latina-dev`
 *   (and C8's Latin Library catalog builder) and renders `/opentexts` server-side.
 * - C6 (`otreader`): Fetches raw files from pinned upstream commits using
 *   `OpenTextCatalogEntry` + `OpenTextSourceRepoMeta`, parses to `OpenTextDocument`,
 *   caches in IndexedDB, and renders in `<morcus-reader-view>`.
 * - C8 (`lladapter`): Generates `OpenTextCatalogEntry[]` for all `"candidate"` and
 *   `"partial"` works in C1's Latin Library snapshot (`work_index.json`).
 *
 * Decisions #5, #17, #18, #19 & M4:
 * - Only metadata ships in the Morcus server/bundle; raw TEI/HTML text files are
 *   fetched on demand in the browser from the pinned GitHub commit (`raw.githubusercontent.com`
 *   with `cdn.jsdelivr.net/gh/` fallback; M4 & Decision #5).
 * - Single author -> work catalog list with source labels, search, and source/period
 *   filters (Decision #17).
 * - Every Latin Library work not in the Library and not excluded—medieval and
 *   Neo-Latin included—is listed (Decision #18).
 * - Partial-coverage works include `partialCoverage` with a note and link to the
 *   Morcus Library for the covered portion (Decision #19).
 */

/**
 * Supported upstream corpora in Open Texts.
 */
export type OpenTextSourceId = "patrologia_latina" | "thelatinlibrary";

/**
 * Historical period filter categories for Open Texts.
 */
export type OpenTextPeriod =
  | "classical"
  | "late_antique"
  | "patristic"
  | "medieval"
  | "neolatin";

/**
 * Parser format used by the client-side Open Texts reader (C6):
 * - `"tei"`: Parsed via `parseTeiDocument` (`src/common/open_texts/tei_parser.ts`).
 * - `"thelatinlibrary_html"`: Parsed via the Latin Library lenient page layer +
 *   `OpenTextDocument` adapter (C2 + C8).
 */
export type OpenTextFormat = "tei" | "thelatinlibrary_html";

/**
 * Notice shown when a work in Open Texts is partially covered by the curated
 * Morcus Library (Decision #19).
 */
export interface OpenTextPartialNotice {
  /** Canonical Morcus Library work ID (e.g. `"phi2003.phi001.perseus-lat1"`). */
  readonly libraryWorkId: string;
  /** Relative Morcus reader URL (e.g. `"/work/apicius/de_re_coquinaria"`). */
  readonly libraryUrl: string;
  /** Author name in the Morcus Library. */
  readonly libraryAuthor?: string;
  /** Work title in the Morcus Library. */
  readonly libraryTitle?: string;
  /** Human-readable explanation of what the Library covers vs. this Open Text. */
  readonly message: string;
}

/**
 * Metadata-only catalog entry for a single work in Open Texts.
 * Contains everything needed to list/filter the work on `/opentexts` and to
 * fetch + parse its raw file(s) on demand in the browser.
 */
export interface OpenTextCatalogEntry {
  /**
   * Stable, URL-safe unique identifier across Open Texts
   * (e.g. `"pl/stoa0022.stoa002.opp-lat1"` or `"ll/abbo-passio-sancti-edmundi"`).
   */
  readonly id: string;
  /** Upstream source corpus (`"patrologia_latina"` or `"thelatinlibrary"`). */
  readonly source: OpenTextSourceId;
  /** Client parser format (`"tei"` or `"thelatinlibrary_html"`). */
  readonly format: OpenTextFormat;
  /** Display author name (e.g. `"Ambrose"`, `"Abbo of Fleury"`). */
  readonly author: string;
  /** Display work title (e.g. `"De Fide Ad Gratianum Augustum"`). */
  readonly title: string;
  /** Historical period category for filtering. */
  readonly period: OpenTextPeriod;
  /** Optional CTS URN (for Patrologia Latina TEI works). */
  readonly urn?: string;
  /** Optional volume or collection badge (e.g. `"PL 16"` for Patrologia Latina). */
  readonly volumeLabel?: string;
  /**
   * Ordered relative file paths within the pinned upstream repository:
   * - For `"patrologia_latina"`: 1 TEI XML path (e.g. `["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"]`).
   * - For `"thelatinlibrary"`: 1 or more raw HTML paths in reading order
   *   (e.g. `["raw/columba1.html", "raw/columba2.html"]`).
   */
  readonly files: readonly string[];
  /**
   * External upstream URL for "View source" / "About this text":
   * - For `"patrologia_latina"`: GitHub blob URL at the pinned commit.
   * - For `"thelatinlibrary"`: Live page URL on `https://www.thelatinlibrary.com/...`.
   */
  readonly sourceUrl: string;
  /** Human-readable license/rights statement shown in the reader's About panel. */
  readonly license: string;
  /** Stated pre-1930 source edition (if known from TEI header or LL provenance scan). */
  readonly statedEdition?: string | null;
  /** Present when `status === "partial"` in the Library identity map (Decision #19). */
  readonly partialCoverage?: OpenTextPartialNotice;
  /** Optional approximate word count. */
  readonly wordCount?: number;
}

/**
 * Pinned upstream repository coordinates for an `OpenTextSourceId` (Decision #18).
 * Derived at catalog build time from `upstream_sources.lock.json`.
 */
export interface OpenTextSourceRepoMeta {
  readonly source: OpenTextSourceId;
  /** Display label for source filter pills and attribution (e.g. `"Patrologia Latina"`, `"The Latin Library"`). */
  readonly label: string;
  /** GitHub `owner/repo` slug (e.g. `"nkprasad12/patrologia_latina-dev"`, `"nkprasad12/TheLatinLibrary"`). */
  readonly repo: string;
  /** 40-character pinned git commit SHA from `upstream_sources.lock.json`. */
  readonly commit: string;
  /**
   * Primary raw content base URL with trailing slash:
   * `https://raw.githubusercontent.com/<repo>/<commit>/`
   */
  readonly rawBaseUrl: string;
  /**
   * Fallback CDN base URL with trailing slash:
   * `https://cdn.jsdelivr.net/gh/<repo>@<commit>/`
   */
  readonly fallbackBaseUrl: string;
  /** Default license statement for this source corpus. */
  readonly license: string;
}

/**
 * Top-level JSON bundle schema for the Open Texts catalog (`open_texts_catalog.json`).
 */
export interface OpenTextCatalogBundle {
  readonly version: 1;
  /** ISO-8601 timestamp when the catalog bundle was built. */
  readonly generatedAt: string;
  /** Pinned repository metadata keyed by source ID. */
  readonly sources: Readonly<
    Partial<Record<OpenTextSourceId, OpenTextSourceRepoMeta>>
  >;
  /** All Open Texts catalog entries sorted by `(author, title, id)`. */
  readonly entries: readonly OpenTextCatalogEntry[];
}

/**
 * Constructs the primary `raw.githubusercontent.com` base URL (with trailing slash)
 * for a GitHub `owner/repo` and 40-char commit SHA.
 */
export function buildRawGithubBaseUrl(repo: string, commit: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commit}/`;
}

/**
 * Constructs the fallback `cdn.jsdelivr.net` base URL (with trailing slash)
 * for a GitHub `owner/repo` and 40-char commit SHA.
 */
export function buildJsDelivrBaseUrl(repo: string, commit: string): string {
  return `https://cdn.jsdelivr.net/gh/${repo}@${commit}/`;
}

/**
 * Returns `{ primaryUrl, fallbackUrl }` for a single relative `filePath` inside
 * a pinned `OpenTextSourceRepoMeta`.
 */
export function buildOpenTextFileUrls(
  sourceMeta: Pick<OpenTextSourceRepoMeta, "rawBaseUrl" | "fallbackBaseUrl">,
  filePath: string
): { readonly primaryUrl: string; readonly fallbackUrl: string } {
  const cleanPath = filePath.replace(/^\/+/, "");
  return {
    primaryUrl: `${sourceMeta.rawBaseUrl}${cleanPath}`,
    fallbackUrl: `${sourceMeta.fallbackBaseUrl}${cleanPath}`,
  };
}
