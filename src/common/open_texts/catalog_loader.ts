import fs from "fs";
import {
  DEFAULT_OPEN_TEXTS_CATALOG_PATH,
  PATROLOGIA_LATINA_DEFAULT_REPO,
  PATROLOGIA_LATINA_LICENSE,
  buildPatrologiaLatinaSourceMeta,
  sortOpenTextCatalogEntries,
} from "@/common/open_texts/catalog_builder";
import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
  type OpenTextCatalogBundle,
  type OpenTextCatalogEntry,
  type OpenTextPeriod,
  type OpenTextSourceId,
  type OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";

const DEFAULT_PL_SEED_COMMIT = "8c651f859f821f0868755596f1a513946ca25350";
const DEFAULT_LL_SEED_REPO = "nkprasad12/TheLatinLibrary";
const DEFAULT_LL_SEED_COMMIT = "0000000000000000000000000000000000000000";
const DEFAULT_LL_SEED_LICENSE =
  "Public domain Latin text; HTML transcription from The Latin Library";

const SEED_PL_SOURCE_META: OpenTextSourceRepoMeta =
  buildPatrologiaLatinaSourceMeta(
    DEFAULT_PL_SEED_COMMIT,
    PATROLOGIA_LATINA_DEFAULT_REPO
  );

const SEED_LL_SOURCE_META: OpenTextSourceRepoMeta = {
  source: "thelatinlibrary",
  label: "The Latin Library",
  repo: DEFAULT_LL_SEED_REPO,
  commit: DEFAULT_LL_SEED_COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(
    DEFAULT_LL_SEED_REPO,
    DEFAULT_LL_SEED_COMMIT
  ),
  fallbackBaseUrl: buildJsDelivrBaseUrl(
    DEFAULT_LL_SEED_REPO,
    DEFAULT_LL_SEED_COMMIT
  ),
  license: DEFAULT_LL_SEED_LICENSE,
};

const SEED_ENTRIES: readonly OpenTextCatalogEntry[] =
  sortOpenTextCatalogEntries([
    {
      id: "pl/stoa0022.stoa002.opp-lat1",
      source: "patrologia_latina",
      format: "tei",
      author: "Ambrosius",
      title: "De Fide Ad Gratianum Augustum Libri Quinque",
      period: "patristic",
      urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
      volumeLabel: "PL 16",
      files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
      sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${DEFAULT_PL_SEED_COMMIT}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
      license: PATROLOGIA_LATINA_LICENSE,
      statedEdition:
        "J.-P. Migne, Patrologia Latina, vol. 16 (Garnier, Paris, 1880)",
    },
    {
      id: "pl/stoa0022.stoa001.opp-lat1",
      source: "patrologia_latina",
      format: "tei",
      author: "Ambrosius",
      title: "De Officiis Ministrorum Libri Tres",
      period: "patristic",
      urn: "urn:cts:latinLit:stoa0022.stoa001.opp-lat1",
      volumeLabel: "PL 16",
      files: ["data/stoa0022/stoa001/stoa0022.stoa001.opp-lat1.xml"],
      sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${DEFAULT_PL_SEED_COMMIT}/data/stoa0022/stoa001/stoa0022.stoa001.opp-lat1.xml`,
      license: PATROLOGIA_LATINA_LICENSE,
      statedEdition:
        "J.-P. Migne, Patrologia Latina, vol. 16 (Garnier, Paris, 1880)",
    },
    {
      id: "pl/stoa0040.stoa006.opp-lat1",
      source: "patrologia_latina",
      format: "tei",
      author: "Augustinus",
      title: "De Doctrina Christiana Libri Quattuor",
      period: "patristic",
      urn: "urn:cts:latinLit:stoa0040.stoa006.opp-lat1",
      volumeLabel: "PL 34",
      files: ["data/stoa0040/stoa006/stoa0040.stoa006.opp-lat1.xml"],
      sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${DEFAULT_PL_SEED_COMMIT}/data/stoa0040/stoa006/stoa0040.stoa006.opp-lat1.xml`,
      license: PATROLOGIA_LATINA_LICENSE,
      statedEdition:
        "J.-P. Migne, Patrologia Latina, vol. 34 (Garnier, Paris, 1887)",
    },
    {
      id: "pl/stoa0159.stoa004.opp-lat1",
      source: "patrologia_latina",
      format: "tei",
      author: "Isidorus Hispaliensis",
      title: "Sententiarum Libri Tres",
      period: "medieval",
      urn: "urn:cts:latinLit:stoa0159.stoa004.opp-lat1",
      volumeLabel: "PL 83",
      files: ["data/stoa0159/stoa004/stoa0159.stoa004.opp-lat1.xml"],
      sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${DEFAULT_PL_SEED_COMMIT}/data/stoa0159/stoa004/stoa0159.stoa004.opp-lat1.xml`,
      license: PATROLOGIA_LATINA_LICENSE,
      statedEdition:
        "J.-P. Migne, Patrologia Latina, vol. 83 (Garnier, Paris, 1850)",
    },
    {
      id: "ll/abbo-passio-sancti-edmundi",
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      author: "Abbo of Fleury",
      title: "Passio Sancti Edmundi",
      period: "medieval",
      files: ["raw/abbo.html"],
      sourceUrl: "https://www.thelatinlibrary.com/abbo.html",
      license: DEFAULT_LL_SEED_LICENSE,
      statedEdition: null,
    },
    {
      id: "ll/apicius-de-re-coquinaria",
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      author: "Apicius",
      title: "De Re Coquinaria (with Excerpta a Vinidario)",
      period: "late_antique",
      files: ["raw/apicius/apicius1.html", "raw/apicius/apicius11.html"],
      sourceUrl: "https://www.thelatinlibrary.com/apicius/apicius1.html",
      license: DEFAULT_LL_SEED_LICENSE,
      statedEdition: null,
      partialCoverage: {
        libraryWorkId: "phi2003.phi001.perseus-lat1",
        libraryUrl: "/work/apicius/de_re_coquinaria",
        libraryAuthor: "Apicius",
        libraryTitle: "De Re Coquinaria",
        message:
          "Books 1–10 are in the curated Library; this Open Text also includes the Excerpta a Vinidario.",
      },
    },
  ]);

/**
 * Representative built-in seed catalog bundle used when
 * `build/open_texts/open_texts_catalog.json` has not been built on disk.
 */
export const SEED_OPEN_TEXTS_CATALOG_BUNDLE: OpenTextCatalogBundle = {
  version: 1,
  generatedAt: "2026-10-31T00:00:00.000Z",
  sources: {
    patrologia_latina: SEED_PL_SOURCE_META,
    thelatinlibrary: SEED_LL_SOURCE_META,
  },
  entries: SEED_ENTRIES,
};

export interface OpenTextCatalogFilter {
  readonly q?: string;
  readonly source?: OpenTextSourceId | "all";
  readonly period?: OpenTextPeriod | "all";
  readonly author?: string;
}

export interface OpenTextAuthorGroup {
  readonly author: string;
  readonly slug: string;
  readonly entries: readonly OpenTextCatalogEntry[];
}

let cachedBundle: OpenTextCatalogBundle | undefined;
let testOverrideBundle: OpenTextCatalogBundle | undefined;

/**
 * Loads `OpenTextCatalogBundle` from `catalogPath` on disk if present,
 * falling back to `SEED_OPEN_TEXTS_CATALOG_BUNDLE`.
 */
export function loadOpenTextsCatalogBundle(
  catalogPath: string = DEFAULT_OPEN_TEXTS_CATALOG_PATH
): OpenTextCatalogBundle {
  if (!fs.existsSync(catalogPath)) {
    return SEED_OPEN_TEXTS_CATALOG_BUNDLE;
  }
  const rawJson = fs.readFileSync(catalogPath, "utf8");
  const parsed: OpenTextCatalogBundle = JSON.parse(rawJson);
  return parsed;
}

/**
 * Returns the active `OpenTextCatalogBundle` (cached in memory after first load).
 */
export function getOpenTextsCatalogBundle(options?: {
  readonly catalogPath?: string;
  readonly forceReload?: boolean;
}): OpenTextCatalogBundle {
  if (testOverrideBundle !== undefined && !options?.catalogPath) {
    return testOverrideBundle;
  }
  if (options?.catalogPath) {
    return loadOpenTextsCatalogBundle(options.catalogPath);
  }
  if (cachedBundle === undefined || options?.forceReload) {
    cachedBundle = loadOpenTextsCatalogBundle(DEFAULT_OPEN_TEXTS_CATALOG_PATH);
  }
  return cachedBundle;
}

/**
 * Overrides the catalog bundle returned by `getOpenTextsCatalogBundle()` in unit tests.
 */
export function setOpenTextsCatalogBundleForTest(
  bundle: OpenTextCatalogBundle | undefined
): void {
  testOverrideBundle = bundle;
}

/**
 * Clears the in-memory catalog bundle cache.
 */
export function resetOpenTextsCatalogCache(): void {
  cachedBundle = undefined;
  testOverrideBundle = undefined;
}

function defaultSourceMetaFor(
  source: OpenTextSourceId
): OpenTextSourceRepoMeta {
  return source === "patrologia_latina"
    ? SEED_PL_SOURCE_META
    : SEED_LL_SOURCE_META;
}

/**
 * Looks up a catalog entry by its `id` (`"pl/..."` or `"ll/..."`) along with
 * its resolved `OpenTextSourceRepoMeta`.
 */
export function findOpenTextCatalogEntry(
  id: string,
  bundle: OpenTextCatalogBundle = getOpenTextsCatalogBundle()
):
  | {
      readonly entry: OpenTextCatalogEntry;
      readonly sourceMeta: OpenTextSourceRepoMeta;
    }
  | undefined {
  const cleanId = id.trim();
  if (!cleanId) return undefined;
  const entry = bundle.entries.find((e) => e.id === cleanId);
  if (!entry) return undefined;
  const sourceMeta =
    bundle.sources[entry.source] ?? defaultSourceMetaFor(entry.source);
  return { entry, sourceMeta };
}

/**
 * Filters catalog entries by query (`q`), `source`, `period`, and `author`.
 */
export function filterOpenTextCatalogEntries(
  entries: readonly OpenTextCatalogEntry[],
  filter: OpenTextCatalogFilter = {}
): OpenTextCatalogEntry[] {
  const source =
    filter.source && filter.source !== "all" ? filter.source : undefined;
  const period =
    filter.period && filter.period !== "all" ? filter.period : undefined;
  const authorFilter = filter.author?.trim().toLowerCase();
  const queryTokens = (filter.q ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  return entries.filter((entry) => {
    if (source !== undefined && entry.source !== source) {
      return false;
    }
    if (period !== undefined && entry.period !== period) {
      return false;
    }
    if (
      authorFilter &&
      entry.author.toLowerCase() !== authorFilter &&
      !entry.author.toLowerCase().includes(authorFilter)
    ) {
      return false;
    }
    if (queryTokens.length > 0) {
      const haystack = `${entry.author} ${entry.title} ${
        entry.volumeLabel ?? ""
      } ${entry.id}`.toLowerCase();
      for (const token of queryTokens) {
        if (!haystack.includes(token)) {
          return false;
        }
      }
    }
    return true;
  });
}

function slugifyAuthor(author: string): string {
  const base = author
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "incertus";
}

/**
 * Groups catalog entries into an alphabetically ordered `Author -> Works` list.
 */
export function groupOpenTextEntriesByAuthor(
  entries: readonly OpenTextCatalogEntry[]
): OpenTextAuthorGroup[] {
  const byAuthor = new Map<string, OpenTextCatalogEntry[]>();
  for (const entry of sortOpenTextCatalogEntries(entries)) {
    const existing = byAuthor.get(entry.author);
    if (existing) {
      existing.push(entry);
    } else {
      byAuthor.set(entry.author, [entry]);
    }
  }

  const usedSlugs = new Set<string>();
  return Array.from(byAuthor.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([author, authorEntries]) => {
      const baseSlug = slugifyAuthor(author);
      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }
      usedSlugs.add(slug);
      return {
        author,
        slug,
        entries: authorEntries,
      };
    });
}
