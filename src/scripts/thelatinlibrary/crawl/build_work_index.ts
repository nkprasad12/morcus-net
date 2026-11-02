import fs from "fs";
import path from "path";
import type {
  PartialCoverageInfo,
  SnapshotManifest,
  SnapshotWorkEntry,
  SnapshotWorkIndex,
  SnapshotWorkPeriod,
  SnapshotWorkStatus,
} from "@/common/thelatinlibrary/snapshot_types";
import {
  decodeRawPageBytes,
  extractRawPageText,
  normalizePagePath,
} from "@/scripts/thelatinlibrary/crawl/provenance_scanner";

export interface AuditWorkEntry {
  ll_author: string;
  ll_title: string;
  ll_paths: string[];
  ll_file_count?: number;
  ll_words?: number;
  era?: string;
  status?: string;
  perseus_id?: string | null;
  perseus_author?: string | null;
  perseus_title?: string | null;
  hypotactic_id?: string | null;
  phi_json_id?: string | null;
  notes?: string | null;
  source_shard?: string | null;
  redundant_files?: (string | { path: string })[];
  alternate_edition_files?: (string | { path: string })[];
}

export interface VerifiedAuditJson {
  classical_and_late_antique_missing?: AuditWorkEntry[];
  patristic_christian_missing?: AuditWorkEntry[];
  partial_coverage_works?: AuditWorkEntry[];
  different_name_crosswalk?: AuditWorkEntry[];
  present_same_works?: AuditWorkEntry[];
  medieval_works?: AuditWorkEntry[];
  neolatin_works?: AuditWorkEntry[];
}

export interface DuplicateFileEntry {
  smaller: string;
  larger: string;
  containment_of_smaller?: number;
  same_audit_entry: boolean;
}

export interface PromotedWorkMeta {
  workId: string;
  author: string;
  title: string;
  sourceUrl?: string;
}

/** Metadata for a work the audit doesn't cover, keyed by its first page. */
export interface UnauditedWorkOverride {
  author: string;
  title: string;
  period: SnapshotWorkPeriod;
  status?: SnapshotWorkStatus;
  libraryWorkIds?: string[];
}

/**
 * Hand-curated corrections applied on top of the audit, read from
 * `$THELATINLIBRARY_ROOT/audit/work_index_overrides.json`.
 */
export interface WorkIndexOverrides {
  /** Audit `.txt` path -> page under `raw/`, where the default mapping fails. */
  auditPathAliases?: Record<string, string>;
  /** Pages the audit missed, added to the entry with this `ll_author`. */
  extraAuditPages?: { llAuthor: string; page: string }[];
  /** Page-list corrections for promoted works (`works/*.json`), by work id. */
  promotedWorkPages?: Record<
    string,
    {
      /** Replaces the work's pages. */
      pages?: string[];
      /** Replaces the work's redundant/alternate pages. */
      redundantOrAlternatePages?: string[];
      /** Pages to drop from the work's pages. */
      removePages?: string[];
    }
  >;
  /** Metadata for unaudited works, keyed by their first page. */
  unauditedWorks?: Record<string, UnauditedWorkOverride>;
}

export interface BuildWorkIndexOptions {
  rootDir: string;
  manifest: SnapshotManifest;
  audit: VerifiedAuditJson;
  duplicates?: readonly DuplicateFileEntry[];
  overrides?: WorkIndexOverrides;
  /**
   * The previous `work_index.json`. Works keep the id they had there (matched
   * by page), and retired ids are never handed to a different work, so
   * `ll/<slug>` permalinks survive changes to the audit.
   */
  previousIndex?: SnapshotWorkIndex;
  /** Commit of the data repo holding the `raw/` snapshot the index is built from. */
  sourceCommit?: string;
  /**
   * Value for `generatedAt`. Defaults to the latest `retrieved` date in the
   * manifest, so rebuilding from the same inputs gives the same output.
   */
  generatedAt?: string;
  libraryUrlMap?: ReadonlyMap<string, string>;
}

const HUB_PAGES = new Set([
  "index.html",
  "christian.html",
  "medieval.html",
  "neo.html",
  "misc.html",
  "ius.html",
  "bible.html",
  "indices.html",
  "credits.html",
  "about.html",
  "cred.html",
  "technical.html",
  "epubs.html",
  "classics.html",
  "decl.html",
  "modinst.html",
  "bennett.html",
  "Voc.html",
  "voc.html",
  "ritchie.html",
  "latin.html",
  "grammar.html",
  "syntax.html",
  "prose.html",
  "poetry.html",
  "addison.html",
  "ammianus.html",
  "apuleius.html",
  "caes.html",
  "vitruvius.html",
  "vallauri.html",
  "apul/index.html",
  "certamen.html",
]);

const NON_CORPUS_PREFIXES = [
  "certamen/",
  "historians/",
  "imperialism/",
  "101/",
  "ll1/",
  "ll2/",
  "courses/",
];

/**
 * Lowercases ASCII letters/digits, strips parentheticals, replaces runs of
 * non-alphanumerics with `"-"`, and trims leading/trailing hyphens.
 */
export function slugify(input: string): string {
  const withoutParens = input.replace(/\([^)]*\)/g, " ");
  const ascii = withoutParens
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Converts a `.txt` path from `verified_audit_v2.json` to its corresponding
 * `.html` or `.shtml` path in `manifest` / `raw/`.
 */
export function resolveAuditPathToHtml(
  txtPath: string,
  manifest: SnapshotManifest,
  aliases: Readonly<Record<string, string>> = {}
): string {
  const norm = normalizePagePath(txtPath);
  if (manifest[norm]) {
    return norm;
  }
  const alias = aliases[norm];
  if (alias !== undefined) {
    return alias;
  }
  const subdirMatch = /^(vitruvius\d+|balde\d+|withof\d+)\.txt$/i.exec(norm);
  if (subdirMatch) {
    const dir = subdirMatch[1].replace(/\d+$/, "").toLowerCase();
    return `${dir}/${subdirMatch[1]}.html`;
  }
  const stem = norm.replace(/\.txt$/i, "");
  const htmlCandidate = `${stem}.html`;
  if (manifest[htmlCandidate]) {
    return htmlCandidate;
  }
  const shtmlCandidate = `${stem}.shtml`;
  if (manifest[shtmlCandidate]) {
    return shtmlCandidate;
  }
  return htmlCandidate;
}

/**
 * Natural numeric + praefatio ordering for Latin Library work pages
 * (e.g. `praefatio.html`, `1.html`, `2.html`, ..., `10.html`).
 */
export function comparePagePaths(a: string, b: string): number {
  const baseA = path.posix.basename(a).toLowerCase();
  const baseB = path.posix.basename(b).toLowerCase();
  const isPraefA = baseA.startsWith("praef") || baseA.startsWith("pref");
  const isPraefB = baseB.startsWith("praef") || baseB.startsWith("pref");
  if (isPraefA !== isPraefB) {
    return isPraefA ? -1 : 1;
  }
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function mapPeriod(
  bucket:
    | "classical_and_late_antique_missing"
    | "patristic_christian_missing"
    | "medieval_works"
    | "neolatin_works"
    | "other",
  entry: AuditWorkEntry
): SnapshotWorkPeriod {
  if (bucket === "patristic_christian_missing") return "patristic";
  if (bucket === "medieval_works") return "medieval";
  if (bucket === "neolatin_works") return "neolatin";
  if (bucket === "classical_and_late_antique_missing") {
    if (
      entry.era === "late_antique" ||
      entry.source_shard === "shard_07_late_antique_prose" ||
      entry.source_shard === "shard_08_late_antique_poetry"
    ) {
      return "late_antique";
    }
    return "classical";
  }
  switch (entry.era) {
    case "late_antique":
      return "late_antique";
    case "patristic":
      return "patristic";
    case "medieval":
      return "medieval";
    case "neolatin":
      return "neolatin";
    default:
      return "classical";
  }
}

function loadPromotedWorks(rootDir: string): PromotedWorkMeta[] {
  const worksDir = path.join(rootDir, "works");
  if (!fs.existsSync(worksDir)) {
    return [];
  }
  const out: PromotedWorkMeta[] = [];
  for (const file of fs.readdirSync(worksDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed: {
        workId?: string;
        author?: string;
        title?: string;
        source?: { url?: string };
      } = JSON.parse(fs.readFileSync(path.join(worksDir, file), "utf8"));
      if (parsed.workId && parsed.author && parsed.title) {
        out.push({
          workId: parsed.workId,
          author: parsed.author,
          title: parsed.title,
          sourceUrl: parsed.source?.url,
        });
      }
    } catch {
      // Ignore malformed work JSON
    }
  }
  return out;
}

function resolveLibraryUrl(
  libraryWorkId: string,
  libraryAuthor: string,
  libraryUrlMap?: ReadonlyMap<string, string>
): string {
  if (libraryWorkId && libraryUrlMap?.has(libraryWorkId)) {
    return libraryUrlMap.get(libraryWorkId)!;
  }
  return `/library?q=${encodeURIComponent(libraryAuthor)}`;
}

function readHttpCharset(metaPath: string): string | undefined {
  try {
    const meta: { httpCharset?: string } = JSON.parse(
      fs.readFileSync(metaPath, "utf8")
    );
    return meta.httpCharset;
  } catch {
    return undefined;
  }
}

function countWordsOnDisk(rootDir: string, pages: readonly string[]): number {
  let total = 0;
  for (const p of pages) {
    const full = path.join(rootDir, "raw", p);
    if (!fs.existsSync(full)) continue;
    const { bodyText } = extractRawPageText(
      decodeRawPageBytes(
        fs.readFileSync(full),
        readHttpCharset(`${full}.meta.json`)
      )
    );
    const matches = bodyText.match(/[\p{L}\p{N}]+/gu);
    if (matches) total += matches.length;
  }
  return total;
}

const HUB_PERIODS: Readonly<Record<string, SnapshotWorkPeriod>> = {
  "christian.html": "patristic",
  "medieval.html": "medieval",
  "neo.html": "neolatin",
};

/**
 * Period of an unaudited work from the hub that leads to it: the hub that
 * linked its author page, or the hub that linked its first page directly.
 * Works reached only from `index.html` (and other hubs) are classical.
 */
export function inferPeriodFromHub(
  firstPage: string,
  manifest: SnapshotManifest
): SnapshotWorkPeriod {
  const first = manifest[firstPage];
  const authorPage = first?.authorPage;
  const hub =
    (authorPage !== undefined ? manifest[authorPage]?.hubPage : undefined) ??
    first?.hubPage;
  return (hub !== undefined ? HUB_PERIODS[hub] : undefined) ?? "classical";
}

/** Latest `retrieved` date in the manifest, or `""` if it is empty. */
function latestRetrieved(manifest: SnapshotManifest): string {
  let latest = "";
  for (const entry of Object.values(manifest)) {
    if (entry.retrieved > latest) latest = entry.retrieved;
  }
  return latest;
}

/**
 * Builds `$THELATINLIBRARY_ROOT/work_index.json` (`SnapshotWorkIndex`) from
 * the audit inputs in `audit/` (`verified_audit_v2.json`,
 * `ll_file_duplicates.json`, `work_index_overrides.json`), `manifest.json`,
 * `works/*.json` and the previous `work_index.json`.
 */
export function buildWorkIndex(
  options: BuildWorkIndexOptions
): SnapshotWorkIndex {
  const {
    rootDir,
    manifest,
    audit,
    duplicates = [],
    overrides = {},
    previousIndex,
    sourceCommit,
    generatedAt = latestRetrieved(manifest),
    libraryUrlMap,
  } = options;
  const aliases = overrides.auditPathAliases ?? {};

  const promotedWorks = loadPromotedWorks(rootDir);
  const promotedByWorkId = new Map<string, PromotedWorkMeta>();
  const promotedBySourceUrl = new Map<string, PromotedWorkMeta>();
  const promotedByManifestPage = new Map<string, PromotedWorkMeta>();

  for (const pw of promotedWorks) {
    promotedByWorkId.set(pw.workId, pw);
    if (pw.sourceUrl) {
      promotedBySourceUrl.set(pw.sourceUrl, pw);
    }
  }
  for (const [pagePath, entry] of Object.entries(manifest)) {
    if (entry.workId && promotedByWorkId.has(entry.workId)) {
      promotedByManifestPage.set(pagePath, promotedByWorkId.get(entry.workId)!);
    }
  }

  // Build set of intra-LL duplicate smaller files with same_audit_entry === true
  const sameEntryDuplicateFiles = new Set<string>();
  for (const dup of duplicates) {
    if (dup.same_audit_entry) {
      sameEntryDuplicateFiles.add(normalizePagePath(dup.smaller));
      sameEntryDuplicateFiles.add(
        resolveAuditPathToHtml(dup.smaller, manifest, aliases)
      );
    }
  }

  // Ids from the previous index (and the manifest), found by page. Every
  // previous id is reserved: it goes back to the work that had it, or stays
  // retired. Several works can share a page (e.g. the Appendix Vergiliana
  // composite page), so a page maps to every id that listed it.
  const previousIdsByPage = new Map<string, string[]>();
  const previousPagesById = new Map<string, string[]>();
  const reservedWorkIds = new Set<string>();
  const notePreviousPage = (p: string, id: string) => {
    const ids = previousIdsByPage.get(p) ?? [];
    if (!ids.includes(id)) ids.push(id);
    previousIdsByPage.set(p, ids);
  };
  for (const work of previousIndex?.works ?? []) {
    reservedWorkIds.add(work.workId);
    previousPagesById.set(work.workId, work.pages);
    for (const p of [
      ...work.pages,
      ...(work.redundantOrAlternatePages ?? []),
    ]) {
      notePreviousPage(p, work.workId);
    }
  }
  for (const [p, entry] of Object.entries(manifest)) {
    if (entry.workId !== undefined && !previousIdsByPage.has(p)) {
      notePreviousPage(p, entry.workId);
      reservedWorkIds.add(entry.workId);
    }
  }

  const usedWorkIds = new Set<string>(promotedByWorkId.keys());
  /**
   * Picks the id for a work with `pages` (its pages, then its redundant
   * pages). Among unused previous ids that share a page, prefer, in order:
   * the id its author and title slugify to (several works can list the same
   * single composite page), the same page list, the id that listed its first
   * page, any other. Otherwise mint a fresh slug that no
   * work, past or present, has used.
   */
  const allocateWorkId = (
    author: string,
    title: string,
    pages: readonly string[],
    mainPageCount: number
  ): string => {
    const authorSlug = slugify(author) || "unknown";
    const stem = path.posix
      .basename(pages[0] ?? "work.html")
      .replace(/\.s?html?$/i, "");
    const titleSlug = slugify(title) || slugify(stem) || "work";
    const base = `ll/${authorSlug}-${titleSlug}`;

    const candidates: string[] = [];
    for (const p of pages) {
      for (const id of previousIdsByPage.get(p) ?? []) {
        if (
          !candidates.includes(id) &&
          !usedWorkIds.has(id) &&
          !promotedByWorkId.has(id)
        ) {
          candidates.push(id);
        }
      }
    }
    const mainPages = pages.slice(0, mainPageCount).join("\n");
    const firstPageIds = previousIdsByPage.get(pages[0] ?? "") ?? [];
    const isBaseSlug = (id: string) =>
      id === base ||
      (id.startsWith(`${base}-`) && /^\d+$/.test(id.slice(base.length + 1)));
    const previous =
      candidates.find(isBaseSlug) ??
      candidates.find(
        (id) => (previousPagesById.get(id) ?? []).join("\n") === mainPages
      ) ??
      candidates.find((id) => firstPageIds.includes(id)) ??
      candidates[0];
    if (previous !== undefined) {
      usedWorkIds.add(previous);
      return previous;
    }

    const taken = (id: string) =>
      usedWorkIds.has(id) || reservedWorkIds.has(id);
    let candidate = base;
    for (let idx = 2; taken(candidate); idx++) {
      candidate = `${base}-${idx}`;
    }
    usedWorkIds.add(candidate);
    return candidate;
  };

  const claimedPages = new Set<string>();
  const works: SnapshotWorkEntry[] = [];

  const buckets: {
    bucket:
      | "classical_and_late_antique_missing"
      | "patristic_christian_missing"
      | "medieval_works"
      | "neolatin_works"
      | "other";
    defaultStatus: SnapshotWorkStatus;
    entries: AuditWorkEntry[];
  }[] = [
    {
      bucket: "other",
      defaultStatus: "in_library",
      entries: audit.present_same_works ?? [],
    },
    {
      bucket: "other",
      defaultStatus: "in_library",
      entries: audit.different_name_crosswalk ?? [],
    },
    {
      bucket: "other",
      defaultStatus: "partial",
      entries: audit.partial_coverage_works ?? [],
    },
    {
      bucket: "classical_and_late_antique_missing",
      defaultStatus: "candidate",
      entries: audit.classical_and_late_antique_missing ?? [],
    },
    {
      bucket: "patristic_christian_missing",
      defaultStatus: "candidate",
      entries: audit.patristic_christian_missing ?? [],
    },
    {
      bucket: "medieval_works",
      defaultStatus: "candidate",
      entries: audit.medieval_works ?? [],
    },
    {
      bucket: "neolatin_works",
      defaultStatus: "candidate",
      entries: audit.neolatin_works ?? [],
    },
  ];

  for (const { bucket, defaultStatus, entries } of buckets) {
    for (const entry of entries) {
      const redundantSet = new Set<string>();
      for (const r of entry.redundant_files ?? []) {
        const rPath = typeof r === "string" ? r : r.path;
        if (!rPath) continue;
        redundantSet.add(normalizePagePath(rPath));
        redundantSet.add(resolveAuditPathToHtml(rPath, manifest, aliases));
      }
      for (const alt of entry.alternate_edition_files ?? []) {
        const altPath = typeof alt === "string" ? alt : alt.path;
        if (!altPath) continue;
        redundantSet.add(normalizePagePath(altPath));
        redundantSet.add(resolveAuditPathToHtml(altPath, manifest, aliases));
      }

      const rawResolved = (entry.ll_paths ?? []).map((p) =>
        resolveAuditPathToHtml(p, manifest, aliases)
      );
      for (const extra of overrides.extraAuditPages ?? []) {
        if (
          extra.llAuthor === entry.ll_author &&
          manifest[extra.page] &&
          !rawResolved.includes(extra.page)
        ) {
          rawResolved.push(extra.page);
        }
      }
      const uniqueResolved = [...new Set(rawResolved)];

      const keptPages: string[] = [];
      const strippedPages: string[] = [];

      for (const p of uniqueResolved) {
        if (
          redundantSet.has(p) ||
          (uniqueResolved.length > 1 && sameEntryDuplicateFiles.has(p))
        ) {
          strippedPages.push(p);
        } else {
          keptPages.push(p);
        }
      }

      const hasManifest = Object.keys(manifest).length > 0;
      const candidatePages = keptPages.length > 0 ? keptPages : uniqueResolved;
      const finalPages = (
        hasManifest
          ? candidatePages.filter((p) => manifest[p] !== undefined)
          : candidatePages
      ).sort(comparePagePaths);
      for (const p of finalPages) claimedPages.add(p);
      for (const p of strippedPages) claimedPages.add(p);

      // Check if this work matches a promoted work in works/*.json (check both finalPages and strippedPages)
      let matchedPromoted: PromotedWorkMeta | undefined;
      for (const p of uniqueResolved) {
        if (promotedByManifestPage.has(p)) {
          matchedPromoted = promotedByManifestPage.get(p);
          break;
        }
        const pageUrl = manifest[p]?.url;
        if (pageUrl && promotedBySourceUrl.has(pageUrl)) {
          matchedPromoted = promotedBySourceUrl.get(pageUrl);
          break;
        }
      }

      const pageFix =
        matchedPromoted !== undefined
          ? overrides.promotedWorkPages?.[matchedPromoted.workId]
          : undefined;
      if (pageFix?.pages !== undefined) {
        finalPages.splice(0, finalPages.length, ...pageFix.pages);
      }
      if (pageFix?.redundantOrAlternatePages !== undefined) {
        strippedPages.splice(
          0,
          strippedPages.length,
          ...pageFix.redundantOrAlternatePages
        );
      }
      for (const removed of pageFix?.removePages ?? []) {
        const idx = finalPages.indexOf(removed);
        if (idx >= 0) finalPages.splice(idx, 1);
      }

      // Check if any constituent page is excluded in manifest.json
      let excluded = false;
      const exclusionReasons: string[] = [];
      let statedEdition: string | null = null;
      let authorPage: string | undefined;

      for (const p of finalPages) {
        const m = manifest[p];
        if (!m) continue;
        if (m.authorPage && !authorPage) {
          authorPage = m.authorPage;
        }
        if (m.statedEdition && statedEdition === null) {
          statedEdition = m.statedEdition;
        }
        if (
          m.excluded === true ||
          m.provenanceClassification === "post1930_or_copyright"
        ) {
          excluded = true;
          if (
            m.exclusionReason &&
            !exclusionReasons.includes(m.exclusionReason)
          ) {
            exclusionReasons.push(m.exclusionReason);
          }
        }
      }

      let status: SnapshotWorkStatus = defaultStatus;
      if (defaultStatus === "in_library" || matchedPromoted !== undefined) {
        status = "in_library";
      } else if (excluded) {
        status = "excluded";
      }

      const libraryWorkIds: string[] = [];
      if (matchedPromoted !== undefined) {
        libraryWorkIds.push(matchedPromoted.workId);
      }
      if (entry.perseus_id) libraryWorkIds.push(entry.perseus_id);
      if (entry.hypotactic_id) libraryWorkIds.push(entry.hypotactic_id);
      if (entry.phi_json_id) libraryWorkIds.push(entry.phi_json_id);

      let partialCoverage: PartialCoverageInfo | undefined;
      if (status === "partial") {
        const libId =
          entry.perseus_id ?? entry.hypotactic_id ?? entry.phi_json_id ?? "";
        const libAuthor = entry.perseus_author ?? entry.ll_author;
        const libTitle = entry.perseus_title ?? entry.ll_title;
        partialCoverage = {
          libraryWorkId: libId,
          libraryAuthor: libAuthor,
          libraryTitle: libTitle,
          libraryUrl: resolveLibraryUrl(libId, libAuthor, libraryUrlMap),
          note:
            entry.notes ?? "Partially covered in the curated Morcus Library.",
        };
      }

      const workId =
        matchedPromoted?.workId ??
        allocateWorkId(
          entry.ll_author,
          entry.ll_title,
          [...finalPages, ...strippedPages],
          finalPages.length
        );

      const diskWords = countWordsOnDisk(rootDir, finalPages);
      const wordCount = diskWords > 0 ? diskWords : entry.ll_words;

      const workEntry: SnapshotWorkEntry = {
        workId,
        author: matchedPromoted?.author ?? entry.ll_author,
        title: matchedPromoted?.title ?? entry.ll_title,
        period: mapPeriod(bucket, entry),
        ...(authorPage !== undefined ? { authorPage } : {}),
        pages: finalPages,
        ...(strippedPages.length > 0
          ? { redundantOrAlternatePages: strippedPages.sort(comparePagePaths) }
          : {}),
        status,
        ...(libraryWorkIds.length > 0 ? { libraryWorkIds } : {}),
        ...(partialCoverage !== undefined ? { partialCoverage } : {}),
        ...(status === "excluded"
          ? {
              exclusionReason:
                exclusionReasons.join("; ") || "Post-1930 or copyrighted work",
            }
          : {}),
        statedEdition,
        ...(wordCount !== undefined ? { wordCount } : {}),
      };
      works.push(workEntry);
    }
  }

  // Pages in raw/ that no audit entry claims become works of their own,
  // grouped by author page (or directory).
  const referencedAsAuthorPage = new Set<string>();
  for (const m of Object.values(manifest)) {
    if (m.authorPage) {
      referencedAsAuthorPage.add(normalizePagePath(m.authorPage));
    }
  }

  const unauditedPages = Object.keys(manifest)
    .filter((p) => {
      if (claimedPages.has(p)) return false;
      if (HUB_PAGES.has(p)) return false;
      if (/^readme.*\.s?html?$/i.test(p)) return false;
      if (NON_CORPUS_PREFIXES.some((prefix) => p.startsWith(prefix))) {
        return false;
      }
      // Author index pages: other pages name them as their author page.
      if (referencedAsAuthorPage.has(p)) return false;
      const m = manifest[p];
      // Top-level pages listed on a non-corpus index page (e.g. indices.html).
      if (m.authorPage && HUB_PAGES.has(m.authorPage) && !p.includes("/")) {
        return false;
      }
      return true;
    })
    .sort(comparePagePaths);

  // Group unaudited pages by (authorPage ?? directory, title prefix)
  const unauditedGroups = new Map<string, string[]>();
  for (const p of unauditedPages) {
    const m = manifest[p];
    const dir = path.posix.dirname(p);
    const groupKey = m.authorPage ?? (dir !== "." ? dir : p);
    const list = unauditedGroups.get(groupKey) ?? [];
    list.push(p);
    unauditedGroups.set(groupKey, list);
  }

  for (const [groupKey, pages] of unauditedGroups.entries()) {
    const sortedPages = pages.sort(comparePagePaths);
    const firstMeta = manifest[sortedPages[0]];
    const authorPageMeta = firstMeta?.authorPage
      ? manifest[firstMeta.authorPage]
      : undefined;

    const override = overrides.unauditedWorks?.[sortedPages[0]];
    const author =
      override?.author ??
      authorPageMeta?.title ??
      (groupKey.endsWith(".html") || groupKey.endsWith(".shtml")
        ? groupKey.replace(/\.s?html$/i, "")
        : groupKey);
    const title =
      override?.title ??
      firstMeta?.title ??
      path.posix.basename(sortedPages[0]).replace(/\.s?html?$/i, "");
    const period =
      override?.period ?? inferPeriodFromHub(sortedPages[0], manifest);

    let excluded = false;
    const exclusionReasons: string[] = [];
    let statedEdition: string | null = null;
    for (const p of sortedPages) {
      const m = manifest[p];
      if (!m) continue;
      if (m.statedEdition && statedEdition === null) {
        statedEdition = m.statedEdition;
      }
      if (
        m.excluded === true ||
        m.provenanceClassification === "post1930_or_copyright"
      ) {
        excluded = true;
        if (
          m.exclusionReason &&
          !exclusionReasons.includes(m.exclusionReason)
        ) {
          exclusionReasons.push(m.exclusionReason);
        }
      }
    }

    const workId = allocateWorkId(
      author,
      title,
      sortedPages,
      sortedPages.length
    );
    const wordCount = countWordsOnDisk(rootDir, sortedPages);

    const status: SnapshotWorkStatus =
      override?.status ?? (excluded ? "excluded" : "candidate");

    works.push({
      workId,
      author,
      title,
      period,
      ...(firstMeta?.authorPage ? { authorPage: firstMeta.authorPage } : {}),
      pages: sortedPages,
      status,
      ...(override?.libraryWorkIds
        ? { libraryWorkIds: override.libraryWorkIds }
        : {}),
      ...(status === "excluded"
        ? {
            exclusionReason:
              exclusionReasons.join("; ") || "Post-1930 or copyrighted work",
          }
        : {}),
      statedEdition,
      wordCount,
    });
  }

  // Ensure every promoted work in works/*.json has an "in_library" entry
  const emittedWorkIds = new Set(works.map((w) => w.workId));
  for (const pw of promotedWorks) {
    if (emittedWorkIds.has(pw.workId)) continue;
    const pwPages = Object.entries(manifest)
      .filter(
        ([, m]) =>
          m.workId === pw.workId ||
          (pw.sourceUrl !== undefined && m.url === pw.sourceUrl)
      )
      .map(([p]) => p)
      .sort(comparePagePaths);
    let statedEdition: string | null = null;
    for (const p of pwPages) {
      if (manifest[p]?.statedEdition) {
        statedEdition = manifest[p].statedEdition ?? null;
        break;
      }
    }
    works.push({
      workId: pw.workId,
      author: pw.author,
      title: pw.title,
      period: "classical",
      pages: pwPages,
      status: "in_library",
      libraryWorkIds: [pw.workId],
      statedEdition,
      wordCount: countWordsOnDisk(rootDir, pwPages),
    });
  }

  works.sort(
    (a, b) =>
      a.author.localeCompare(b.author) ||
      a.title.localeCompare(b.title) ||
      a.workId.localeCompare(b.workId)
  );

  return {
    version: 1,
    generatedAt,
    ...(sourceCommit !== undefined ? { sourceCommit } : {}),
    works,
  };
}
