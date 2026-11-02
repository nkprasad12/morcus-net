/**
 * Shared TypeScript contracts for the Experimental Texts metadata catalog and JSON bundle
 * (`src/common/experimental_texts/catalog_types.ts`).
 *
 * - Only metadata ships in the Morcus server/bundle; raw TEI/HTML text files are
 *   fetched on demand in the browser from the pinned GitHub commit (`raw.githubusercontent.com`
 *   with `cdn.jsdelivr.net/gh/` fallback).
 * - Single author -> work catalog list with source labels, search, and source/period
 *   filters.
 * - Every Latin Library work not in the Library and not excluded—medieval and
 *   Neo-Latin included—is listed.
 * - Partial-coverage works include `partialCoverage` with a note and link to the
 *   Morcus Library for the covered portion.
 */

/**
 * Supported upstream corpora in Experimental Texts.
 */
export type ExperimentalTextSourceId = "patrologia_latina" | "thelatinlibrary";

/**
 * Historical period filter categories for Experimental Texts.
 */
export const EXPERIMENTAL_TEXT_PERIODS = [
  "ancient",
  "medieval",
  "neolatin",
] as const;

export type ExperimentalTextPeriod = (typeof EXPERIMENTAL_TEXT_PERIODS)[number];

/**
 * Parser format used by the client-side Experimental Texts reader:
 * - `"tei"`: Parsed via `parseTeiDocument` (`src/common/experimental_texts/tei_parser.ts`).
 * - `"thelatinlibrary_html"`: Parsed via the Latin Library lenient page layer +
 *   `ExperimentalTextDocument` adapter.
 */
export type ExperimentalTextFormat = "tei" | "thelatinlibrary_html";

/**
 * Notice shown when a work in Experimental Texts is partially covered by the curated
 * Morcus Library.
 */
export interface ExperimentalTextPartialNotice {
  /** Canonical Morcus Library work ID (e.g. `"phi2003.phi001.perseus-lat1"`). */
  readonly libraryWorkId: string;
  /** Relative Morcus reader URL (e.g. `"/work/apicius/de_re_coquinaria"`). */
  readonly libraryUrl: string;
  /** Author name in the Morcus Library. */
  readonly libraryAuthor?: string;
  /** Work title in the Morcus Library. */
  readonly libraryTitle?: string;
  /** Human-readable explanation of what the Library covers vs. this Experimental Text. */
  readonly message: string;
}

/**
 * Metadata-only catalog entry for a single work in Experimental Texts.
 * Contains everything needed to list/filter the work on `/experimental` and to
 * fetch + parse its raw file(s) on demand in the browser.
 */
export interface ExperimentalTextCatalogEntry {
  /**
   * Stable, URL-safe unique identifier across Experimental Texts
   * (e.g. `"pl/stoa0022.stoa002.opp-lat1"` or `"ll/abbo-passio-sancti-edmundi"`).
   */
  readonly id: string;
  /** Upstream source corpus (`"patrologia_latina"` or `"thelatinlibrary"`). */
  readonly source: ExperimentalTextSourceId;
  /** Client parser format (`"tei"` or `"thelatinlibrary_html"`). */
  readonly format: ExperimentalTextFormat;
  /** Display author name (e.g. `"Ambrose"`, `"Abbo of Fleury"`). */
  readonly author: string;
  /**
   * Other names the author is searched by: the upstream spelling when
   * `author` was normalized from it (`"Hieronymus"` for `"Jerome"`), and
   * known Latin / English aliases. Set by `catalog_normalizer.ts`; never shown.
   */
  readonly authorAliases?: readonly string[];
  /** Display work title (e.g. `"De Fide Ad Gratianum Augustum"`). */
  readonly title: string;
  /** Historical period category for filtering. */
  readonly period: ExperimentalTextPeriod;
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
  /** Present when `status === "partial"` in the Library identity map. */
  readonly partialCoverage?: ExperimentalTextPartialNotice;
  /** Optional approximate word count. */
  readonly wordCount?: number;
}

/**
 * Pinned upstream repository coordinates for an `ExperimentalTextSourceId`.
 * Derived at catalog build time from `upstream_sources.lock.json`.
 */
export interface ExperimentalTextSourceRepoMeta {
  readonly source: ExperimentalTextSourceId;
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
 * Top-level JSON bundle schema for the Experimental Texts catalog (`experimental_texts_catalog.json`).
 */
export interface ExperimentalTextCatalogBundle {
  readonly version: 1;
  /** ISO-8601 timestamp when the catalog bundle was built. */
  readonly generatedAt: string;
  /** Pinned repository metadata keyed by source ID. */
  readonly sources: Readonly<
    Partial<Record<ExperimentalTextSourceId, ExperimentalTextSourceRepoMeta>>
  >;
  /** All Experimental Texts catalog entries sorted by `(author, title, id)`. */
  readonly entries: readonly ExperimentalTextCatalogEntry[];
}

/** Default output path for the compiled Experimental Texts catalog bundle. */
export const DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH =
  "build/experimental_texts/experimental_texts_catalog.json";

export const PATROLOGIA_LATINA_DEFAULT_REPO =
  "nkprasad12/patrologia_latina-dev";
export const PATROLOGIA_LATINA_LICENSE = "CC BY-SA 4.0";

export const THE_LATIN_LIBRARY_DEFAULT_REPO = "nkprasad12/TheLatinLibrary";
export const THE_LATIN_LIBRARY_LICENSE =
  "Public domain Latin text; HTML transcription from The Latin Library";

const EN_COLLATOR = new Intl.Collator("en");

/**
 * Extracts `owner/repo` from a GitHub HTTPS/SSH URL or returns the slug as-is.
 */
export function extractGithubOwnerRepo(repoUrlOrSlug: string): string {
  const cleaned = repoUrlOrSlug.trim().replace(/\.git$/i, "");
  const match =
    /github\.com[:/]([^/]+\/[^/]+)$/i.exec(cleaned) ??
    /^([^/]+\/[^/]+)$/.exec(cleaned);
  return match ? match[1] : cleaned;
}

/**
 * Constructs an `ExperimentalTextSourceRepoMeta` for `patrologia_latina-dev`.
 */
export function buildPatrologiaLatinaSourceMeta(
  commit: string,
  repoSlug: string = PATROLOGIA_LATINA_DEFAULT_REPO
): ExperimentalTextSourceRepoMeta {
  const slug = extractGithubOwnerRepo(repoSlug);
  return {
    source: "patrologia_latina",
    label: "Patrologia Latina",
    repo: slug,
    commit,
    rawBaseUrl: buildRawGithubBaseUrl(slug, commit),
    fallbackBaseUrl: buildJsDelivrBaseUrl(slug, commit),
    license: PATROLOGIA_LATINA_LICENSE,
  };
}

/**
 * Constructs an `ExperimentalTextSourceRepoMeta` for `TheLatinLibrary`.
 */
export function buildLatinLibrarySourceMeta(
  commit: string,
  repoSlug: string = THE_LATIN_LIBRARY_DEFAULT_REPO
): ExperimentalTextSourceRepoMeta {
  const slug = extractGithubOwnerRepo(repoSlug);
  return {
    source: "thelatinlibrary",
    label: "The Latin Library",
    repo: slug,
    commit,
    rawBaseUrl: buildRawGithubBaseUrl(slug, commit),
    fallbackBaseUrl: buildJsDelivrBaseUrl(slug, commit),
    license: THE_LATIN_LIBRARY_LICENSE,
  };
}

/**
 * Sorts `ExperimentalTextCatalogEntry[]` deterministically by `(author, title, id)`
 * using a fixed `"en"` locale collator.
 */
export function sortExperimentalTextCatalogEntries(
  entries: readonly ExperimentalTextCatalogEntry[]
): ExperimentalTextCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const authorCmp = EN_COLLATOR.compare(a.author, b.author);
    if (authorCmp !== 0) return authorCmp;
    const titleCmp = EN_COLLATOR.compare(a.title, b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
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
 * a pinned `ExperimentalTextSourceRepoMeta`.
 */
export function buildExperimentalTextFileUrls(
  sourceMeta: Pick<
    ExperimentalTextSourceRepoMeta,
    "rawBaseUrl" | "fallbackBaseUrl"
  >,
  filePath: string
): { readonly primaryUrl: string; readonly fallbackUrl: string } {
  const cleanPath = filePath.replace(/^\/+/, "");
  return {
    primaryUrl: `${sourceMeta.rawBaseUrl}${cleanPath}`,
    fallbackUrl: `${sourceMeta.fallbackBaseUrl}${cleanPath}`,
  };
}
