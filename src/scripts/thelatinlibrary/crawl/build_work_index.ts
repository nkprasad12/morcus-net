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
  decodeHtmlBytes,
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

export interface BuildWorkIndexOptions {
  rootDir: string;
  manifest: SnapshotManifest;
  audit: VerifiedAuditJson;
  duplicates?: readonly DuplicateFileEntry[];
  sourceCommit?: string;
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

const UNAUDITED_WORK_METADATA: Readonly<
  Record<
    string,
    {
      author: string;
      title: string;
      period: SnapshotWorkPeriod;
      status?: SnapshotWorkStatus;
      libraryWorkIds?: string[];
    }
  >
> = {
  "sidoniuscarmina.html": {
    author: "Sidonius Apollinaris",
    title: "Carmina",
    period: "late_antique",
    status: "in_library",
    libraryWorkIds: ["stoa0261.stoa001.perseus-lat1"],
  },
  "bernardclairvaux.shtml": {
    author: "Bernard of Clairvaux",
    title: "Opera (Selections)",
    period: "medieval",
  },
  "deexpugnatione.shtml": {
    author: "Anonymous (Crusade Chronicle)",
    title: "De Expugnatione Lyxbonensi",
    period: "medieval",
  },
  "exuperantius.shtml": {
    author: "Iulius Exuperantius",
    title: "Opusculum",
    period: "late_antique",
  },
  "festus.shtml": {
    author: "Sextus Pompeius Festus",
    title: "De Verborum Significatu (Epitome Pauli)",
    period: "classical",
  },
};

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
  manifest: SnapshotManifest
): string {
  const norm = normalizePagePath(txtPath);
  if (manifest[norm]) {
    return norm;
  }
  if (norm === "victor.origio.txt") {
    return "victor/victor.origio.html";
  }
  const subdirMatch = /^(vitruvius\d+|balde\d+|withof\d+)\.txt$/i.exec(norm);
  if (subdirMatch) {
    const dir = subdirMatch[1].replace(/\d+$/, "").toLowerCase();
    const candidate = `${dir}/${subdirMatch[1]}.html`;
    if (manifest[candidate]) return candidate;
    return candidate;
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

function countWordsOnDisk(rootDir: string, pages: readonly string[]): number {
  let total = 0;
  for (const p of pages) {
    const full = path.join(rootDir, "raw", p);
    if (!fs.existsSync(full)) continue;
    try {
      const { bodyText } = extractRawPageText(
        decodeHtmlBytes(fs.readFileSync(full))
      );
      const matches = bodyText.match(/[\p{L}\p{N}]+/gu);
      if (matches) total += matches.length;
    } catch {
      // Ignore parse errors
    }
  }
  return total;
}

/**
 * Builds `$THELATINLIBRARY_ROOT/work_index.json` (`SnapshotWorkIndex`) from
 * `verified_audit_v2.json`, `ll_file_duplicates.json`, `manifest.json`, and
 * `works/*.json`.
 */
export function buildWorkIndex(
  options: BuildWorkIndexOptions
): SnapshotWorkIndex {
  const {
    rootDir,
    manifest,
    audit,
    duplicates = [],
    sourceCommit,
    libraryUrlMap,
  } = options;

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
        resolveAuditPathToHtml(dup.smaller, manifest)
      );
    }
  }

  const usedWorkIds = new Set<string>(promotedByWorkId.keys());
  const allocateWorkId = (
    author: string,
    title: string,
    firstPage: string
  ): string => {
    const authorSlug = slugify(author) || "unknown";
    const stem = path.posix.basename(firstPage).replace(/\.s?html?$/i, "");
    const titleSlug = slugify(title) || slugify(stem) || "work";
    const base = `ll/${authorSlug}-${titleSlug}`;
    if (!usedWorkIds.has(base)) {
      usedWorkIds.add(base);
      return base;
    }
    let idx = 2;
    while (usedWorkIds.has(`${base}-${idx}`)) {
      idx++;
    }
    const candidate = `${base}-${idx}`;
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
        redundantSet.add(resolveAuditPathToHtml(rPath, manifest));
      }
      for (const alt of entry.alternate_edition_files ?? []) {
        const altPath = typeof alt === "string" ? alt : alt.path;
        if (!altPath) continue;
        redundantSet.add(normalizePagePath(altPath));
        redundantSet.add(resolveAuditPathToHtml(altPath, manifest));
      }

      const rawResolved = (entry.ll_paths ?? []).map((p) =>
        resolveAuditPathToHtml(p, manifest)
      );
      if (
        entry.ll_author === "Aulus Gellius" &&
        manifest["gellius/gellius12.shtml"] &&
        !rawResolved.includes("gellius/gellius12.shtml")
      ) {
        rawResolved.push("gellius/gellius12.shtml");
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

      if (matchedPromoted?.workId === "thelatinlibrary-augustus-resgestae") {
        finalPages.splice(0, finalPages.length, "resgestae.html");
        strippedPages.splice(0, strippedPages.length, "resgestae1.html");
      } else if (matchedPromoted?.workId === "thelatinlibrary-justin-epitoma") {
        const idx = finalPages.indexOf("justin/prologi.html");
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
          finalPages[0] ?? "work.html"
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
        ...(excluded
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

  // Handle unaudited pages in raw/ (Rule 4)
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
      if (referencedAsAuthorPage.has(p)) return false;
      const m = manifest[p];
      // Skip top-level author index pages linked directly from hub pages
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

    let period: SnapshotWorkPeriod = "classical";
    const hub = authorPageMeta?.authorPage ?? firstMeta?.authorPage;
    if (hub === "christian.html") period = "patristic";
    else if (hub === "medieval.html") period = "medieval";
    else if (hub === "neo.html") period = "neolatin";

    const override = UNAUDITED_WORK_METADATA[sortedPages[0]];
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
    if (override?.period) {
      period = override.period;
    }

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

    const workId = allocateWorkId(author, title, sortedPages[0]);
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
    generatedAt: new Date().toISOString(),
    ...(sourceCommit !== undefined ? { sourceCommit } : {}),
    works,
  };
}
