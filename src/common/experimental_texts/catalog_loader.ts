import fs from "fs";
// upstream_sources.lock.json lives at the repo root (outside src/), imported so
// esbuild embeds the pins in build/server.js for production Docker images.
// eslint-disable-next-line no-restricted-imports
import upstreamSourcesLock from "../../../upstream_sources.lock.json";
import {
  DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH,
  EXPERIMENTAL_TEXT_PERIODS,
  PATROLOGIA_LATINA_DEFAULT_REPO,
  PATROLOGIA_LATINA_LICENSE,
  THE_LATIN_LIBRARY_DEFAULT_REPO,
  THE_LATIN_LIBRARY_LICENSE,
  buildLatinLibrarySourceMeta,
  buildPatrologiaLatinaSourceMeta,
  sortExperimentalTextCatalogEntries,
  type ExperimentalTextCatalogBundle,
  type ExperimentalTextCatalogEntry,
  type ExperimentalTextPeriod,
  type ExperimentalTextSourceId,
  type ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";

const EN_COLLATOR = new Intl.Collator("en");

interface MinimalUpstreamLockFile {
  readonly sources: Readonly<
    Record<string, { readonly repo: string; readonly commit: string }>
  >;
}

const EMBEDDED_UPSTREAM_LOCK: MinimalUpstreamLockFile = upstreamSourcesLock;

function readLockedSourcePin(
  name: string,
  defaultRepo: string
): { readonly repo: string; readonly commit: string } {
  const entry = EMBEDDED_UPSTREAM_LOCK.sources?.[name];
  if (!entry || typeof entry.commit !== "string" || !entry.commit.trim()) {
    throw new Error(
      `Missing or invalid "${name}" entry in upstream_sources.lock.json`
    );
  }
  return {
    repo: entry.repo || defaultRepo,
    commit: entry.commit.trim(),
  };
}

const PL_LOCKED_PIN = readLockedSourcePin(
  "patrologia_latina-dev",
  PATROLOGIA_LATINA_DEFAULT_REPO
);
const LL_LOCKED_PIN = readLockedSourcePin(
  "thelatinlibrary",
  THE_LATIN_LIBRARY_DEFAULT_REPO
);

const SEED_PL_SOURCE_META: ExperimentalTextSourceRepoMeta =
  buildPatrologiaLatinaSourceMeta(PL_LOCKED_PIN.commit, PL_LOCKED_PIN.repo);

const SEED_LL_SOURCE_META: ExperimentalTextSourceRepoMeta =
  buildLatinLibrarySourceMeta(LL_LOCKED_PIN.commit, LL_LOCKED_PIN.repo);

const SEED_ENTRIES: readonly ExperimentalTextCatalogEntry[] =
  sortExperimentalTextCatalogEntries([
    {
      id: "pl/stoa0022.stoa002.opp-lat1",
      source: "patrologia_latina",
      format: "tei",
      author: "Sample Author (Patrologia Latina)",
      title: "Sample Work — run ./morcus.sh build -b_et to build the catalog",
      period: "ancient",
      urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
      volumeLabel: "PL 16",
      files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
      sourceUrl: `https://github.com/${SEED_PL_SOURCE_META.repo}/blob/${SEED_PL_SOURCE_META.commit}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
      license: PATROLOGIA_LATINA_LICENSE,
      statedEdition:
        "J.-P. Migne, Patrologia Latina, vol. 16 (Garnier, Paris, 1880)",
    },
    {
      id: "ll/abbo-passio-sancti-edmundi",
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      author: "Sample Author (The Latin Library)",
      title: "Sample Work — run ./morcus.sh build -b_et to build the catalog",
      period: "medieval",
      files: ["raw/abbofloracensis.html"],
      sourceUrl: "https://www.thelatinlibrary.com/abbofloracensis.html",
      license: THE_LATIN_LIBRARY_LICENSE,
      statedEdition: null,
    },
  ]);

/**
 * Minimal built-in seed catalog bundle used when
 * `build/experimental_texts/experimental_texts_catalog.json` has not been built on disk.
 */
export const SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE: ExperimentalTextCatalogBundle =
  {
    version: 1,
    generatedAt: "2026-10-31T00:00:00.000Z",
    sources: {
      patrologia_latina: SEED_PL_SOURCE_META,
      thelatinlibrary: SEED_LL_SOURCE_META,
    },
    entries: SEED_ENTRIES,
  };

export interface ExperimentalTextCatalogFilter {
  readonly q?: string;
  readonly source?: ExperimentalTextSourceId | "all";
  readonly period?: ExperimentalTextPeriod | "all";
  readonly author?: string;
}

export interface ExperimentalTextAuthorGroup {
  readonly author: string;
  readonly slug: string;
  readonly entries: readonly ExperimentalTextCatalogEntry[];
}

let cachedBundle: ExperimentalTextCatalogBundle | undefined;
let testOverrideBundle: ExperimentalTextCatalogBundle | undefined;

function isValidPeriod(period: unknown): period is ExperimentalTextPeriod {
  return (
    typeof period === "string" &&
    EXPERIMENTAL_TEXT_PERIODS.some((candidate) => candidate === period)
  );
}

function validateExperimentalTextsCatalogBundle(
  obj: ExperimentalTextCatalogBundle | null | undefined,
  catalogPath: string
): ExperimentalTextCatalogBundle {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error(
      `Invalid Experimental Texts catalog bundle at ${catalogPath}: expected a JSON object`
    );
  }
  if (obj.version !== 1) {
    throw new Error(
      `Invalid Experimental Texts catalog bundle at ${catalogPath}: expected version 1, got ${String(
        obj.version
      )}`
    );
  }
  if (typeof obj.generatedAt !== "string") {
    throw new Error(
      `Invalid Experimental Texts catalog bundle at ${catalogPath}: expected string generatedAt`
    );
  }
  if (
    typeof obj.sources !== "object" ||
    obj.sources === null ||
    Array.isArray(obj.sources)
  ) {
    throw new Error(
      `Invalid Experimental Texts catalog bundle at ${catalogPath}: expected object sources`
    );
  }
  if (!Array.isArray(obj.entries)) {
    throw new Error(
      `Invalid Experimental Texts catalog bundle at ${catalogPath}: expected array entries`
    );
  }
  for (let i = 0; i < obj.entries.length; i++) {
    const entry: Partial<ExperimentalTextCatalogEntry> | null | undefined =
      obj.entries[i];
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.id !== "string" ||
      !entry.id ||
      (entry.source !== "patrologia_latina" &&
        entry.source !== "thelatinlibrary") ||
      (entry.format !== "tei" && entry.format !== "thelatinlibrary_html") ||
      typeof entry.author !== "string" ||
      typeof entry.title !== "string" ||
      !isValidPeriod(entry.period) ||
      !Array.isArray(entry.files) ||
      entry.files.length === 0 ||
      !entry.files.every((f) => typeof f === "string" && f.length > 0) ||
      typeof entry.sourceUrl !== "string" ||
      typeof entry.license !== "string"
    ) {
      throw new Error(
        `Invalid Experimental Texts catalog entry at index ${i} in ${catalogPath}`
      );
    }
  }
  return obj;
}

/**
 * Loads `ExperimentalTextCatalogBundle` from `catalogPath` on disk if present,
 * falling back to `SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE`.
 */
export function loadExperimentalTextsCatalogBundle(
  catalogPath: string = DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH
): ExperimentalTextCatalogBundle {
  if (!fs.existsSync(catalogPath)) {
    return SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE;
  }
  const rawJson = fs.readFileSync(catalogPath, "utf8");
  const parsed: ExperimentalTextCatalogBundle = JSON.parse(rawJson);
  return validateExperimentalTextsCatalogBundle(parsed, catalogPath);
}

/**
 * Returns the active `ExperimentalTextCatalogBundle` (cached in memory after first load).
 */
export function getExperimentalTextsCatalogBundle(options?: {
  readonly catalogPath?: string;
  readonly forceReload?: boolean;
}): ExperimentalTextCatalogBundle {
  if (testOverrideBundle !== undefined && !options?.catalogPath) {
    return testOverrideBundle;
  }
  if (options?.catalogPath) {
    return loadExperimentalTextsCatalogBundle(options.catalogPath);
  }
  if (cachedBundle === undefined || options?.forceReload) {
    cachedBundle = loadExperimentalTextsCatalogBundle(
      DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH
    );
  }
  return cachedBundle;
}

/**
 * Overrides the catalog bundle returned by `getExperimentalTextsCatalogBundle()` in unit tests.
 */
export function setExperimentalTextsCatalogBundleForTest(
  bundle: ExperimentalTextCatalogBundle | undefined
): void {
  testOverrideBundle = bundle;
}

/**
 * Clears the in-memory catalog bundle cache.
 */
export function resetExperimentalTextsCatalogCache(): void {
  cachedBundle = undefined;
  testOverrideBundle = undefined;
}

function defaultSourceMetaFor(
  source: ExperimentalTextSourceId
): ExperimentalTextSourceRepoMeta {
  return source === "patrologia_latina"
    ? SEED_PL_SOURCE_META
    : SEED_LL_SOURCE_META;
}

/**
 * Looks up a catalog entry by its `id` (`"pl/..."` or `"ll/..."`) along with
 * its resolved `ExperimentalTextSourceRepoMeta`.
 */
export function findExperimentalTextCatalogEntry(
  id: string,
  bundle: ExperimentalTextCatalogBundle = getExperimentalTextsCatalogBundle()
):
  | {
      readonly entry: ExperimentalTextCatalogEntry;
      readonly sourceMeta: ExperimentalTextSourceRepoMeta;
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
export function filterExperimentalTextCatalogEntries(
  entries: readonly ExperimentalTextCatalogEntry[],
  filter: ExperimentalTextCatalogFilter = {}
): ExperimentalTextCatalogEntry[] {
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
      const haystack = `${entry.author} ${(entry.authorAliases ?? []).join(
        " "
      )} ${entry.title} ${entry.volumeLabel ?? ""} ${entry.id}`.toLowerCase();
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
export function groupExperimentalTextEntriesByAuthor(
  entries: readonly ExperimentalTextCatalogEntry[]
): ExperimentalTextAuthorGroup[] {
  const byAuthor = new Map<string, ExperimentalTextCatalogEntry[]>();
  for (const entry of sortExperimentalTextCatalogEntries(entries)) {
    const existing = byAuthor.get(entry.author);
    if (existing) {
      existing.push(entry);
    } else {
      byAuthor.set(entry.author, [entry]);
    }
  }

  const usedSlugs = new Set<string>();
  return Array.from(byAuthor.entries())
    .sort(([a], [b]) => EN_COLLATOR.compare(a, b))
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
