import fs from "fs";
import path from "path";
import * as he from "he";
import { envVar } from "@/common/env_vars";
import {
  DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH,
  PATROLOGIA_LATINA_DEFAULT_REPO,
  PATROLOGIA_LATINA_LICENSE,
  THE_LATIN_LIBRARY_DEFAULT_REPO,
  buildPatrologiaLatinaSourceMeta,
  extractGithubOwnerRepo,
  sortExperimentalTextCatalogEntries,
  type ExperimentalTextCatalogBundle,
  type ExperimentalTextCatalogEntry,
  type ExperimentalTextPeriod,
  type ExperimentalTextSourceId,
  type ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import {
  normalizeExperimentalTextAuthor,
  normalizeExperimentalTextCatalogEntries,
} from "@/common/experimental_texts/catalog_normalizer";
import {
  buildLatinLibraryExperimentalTextEntries,
  normalizeLatinLibraryExperimentalTextId,
} from "@/common/experimental_texts/latin_library_catalog";
import type {
  SnapshotManifest,
  SnapshotWorkIndex,
} from "@/common/thelatinlibrary/snapshot_types";
import { upstreamSource } from "@/scripts/upstream/lock";

export {
  DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH,
  PATROLOGIA_LATINA_DEFAULT_REPO,
  PATROLOGIA_LATINA_LICENSE,
  buildPatrologiaLatinaSourceMeta,
  extractGithubOwnerRepo,
  sortExperimentalTextCatalogEntries,
};

/**
 * In Migne's *Patrologia Latina*, volumes 1–79 (Tertullian through Gregory
 * the Great, ~200–604 AD) are Ancient, and volumes 80–217 (~604–1216 AD)
 * are Medieval, except where an author's period is known directly.
 */
export const PATROLOGIA_LATINA_PATRISTIC_MAX_VOLUME = 79;

/**
 * Known periods for Patrologia Latina authors whose period differs from the
 * volume-79 boundary (e.g. medieval commentaries or early-modern Neo-Latin
 * prefaces/dissertations printed in patristic volumes).
 */
const PATROLOGIA_LATINA_AUTHOR_PERIODS: Readonly<
  Record<string, ExperimentalTextPeriod>
> = {
  "Alcuinus (Alcuin of York)": "medieval",
  Alulfus: "medieval",
  "Alulfus Tornacensis": "medieval",
  "Anastasius Bibliothecarius": "medieval",
  "Fredegarius Scholasticus": "medieval",
  "Samuel Aniensis": "medieval",
  "Martinus V (Pope)": "medieval",
  "Johannes Martianaeus": "neolatin",
  "Nicolaus Judecus": "neolatin",
  Sigonius: "neolatin",
  "Sirmondus Jacobus": "neolatin",
  "Thomas Tamaius de Vargas": "neolatin",
  "Johann Philipp Lorenz Withof": "neolatin",
};

const HEADER_READ_BYTES = 16384;

export interface BuildPatrologiaLatinaOptions {
  /** Local filesystem checkout of `patrologia_latina-dev`. */
  readonly rootDir: string;
  /** Pinned 40-char git commit SHA from `upstream_sources.lock.json`. */
  readonly commit: string;
  /** GitHub `owner/repo` slug (defaults to `nkprasad12/patrologia_latina-dev`). */
  readonly repo?: string;
}

export interface BuildLatinLibraryFromRootOptions {
  readonly rootDir: string;
  readonly commit: string;
  readonly repo?: string;
}

export interface BuildExperimentalTextsCatalogOptions {
  readonly patrologiaLatina?: Partial<BuildPatrologiaLatinaOptions> | false;
  readonly theLatinLibrary?: Partial<BuildLatinLibraryFromRootOptions> | false;
  readonly additionalSources?: Readonly<
    Partial<Record<ExperimentalTextSourceId, ExperimentalTextSourceRepoMeta>>
  >;
  readonly additionalEntries?: readonly ExperimentalTextCatalogEntry[];
  readonly generatedAt?: string;
}

/**
 * Scans `$THELATINLIBRARY_ROOT/works/*.json` (when present) to collect all
 * promoted work IDs so they automatically drop out of Experimental Texts.
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
    promoted.add(normalizeLatinLibraryExperimentalTextId(stem));
  }
  return promoted;
}

/**
 * Loads `work_index.json`, `manifest.json`, and `works/*.json` from `rootDir`
 * and builds the Latin Library Experimental Texts catalog entries.
 */
export function buildLatinLibraryExperimentalTextEntriesFromRoot(
  options: BuildLatinLibraryFromRootOptions
): {
  sourceMeta: ExperimentalTextSourceRepoMeta;
  entries: ExperimentalTextCatalogEntry[];
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

  return buildLatinLibraryExperimentalTextEntries(
    workIndex,
    manifest,
    options.commit,
    {
      repo: options.repo,
      promotedWorkIds,
    }
  );
}

function cleanXmlText(rawText: string | undefined): string {
  if (!rawText) return "";
  const stripped = rawText.replace(/<[^>]+>/g, " ");
  // Decode twice to handle double-encoded entities in upstream CTS XML (e.g. `&amp;gt;`).
  return he.decode(he.decode(stripped)).replace(/\s+/g, " ").trim();
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadSortedEditionMetadataLines(rootDir: string): string[] {
  const sortedCsvPath = path.join(rootDir, "edition_metadata_sorted.csv");
  if (!fs.existsSync(sortedCsvPath)) {
    return [];
  }
  return fs
    .readFileSync(sortedCsvPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function readFileHeader(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, HEADER_READ_BYTES, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function extractPlVolumeNumber(
  headerXml: string,
  groupDirName: string,
  sortedMetadataLines: readonly string[]
): number | undefined {
  const biblScopeMatch =
    /<biblScope[^>]*\bunit=["']volume["'][^>]*>\s*(\d+)/i.exec(headerXml);
  if (biblScopeMatch) {
    return Number(biblScopeMatch[1]);
  }
  const idnoMatch =
    /<idno[^>]*\btype=["']filename["'][^>]*>\s*PL\s*(\d+)/i.exec(headerXml);
  if (idnoMatch) {
    return Number(idnoMatch[1]);
  }
  const tmpMatch = /^tmp(\d+)$/i.exec(groupDirName);
  if (tmpMatch) {
    const lineIndex = Number(tmpMatch[1]);
    const csvLine = sortedMetadataLines[lineIndex] ?? "";
    const csvMatch = /^PL\s*(\d+)/i.exec(csvLine);
    if (csvMatch) {
      return Number(csvMatch[1]);
    }
  }
  return undefined;
}

function extractStatedEdition(
  headerXml: string,
  volumeNumber: number | undefined
): string | null {
  const imprintMatch = /<imprint(?:\s[^>]*)?>([\s\S]*?)<\/imprint>/i.exec(
    headerXml
  );
  const imprintXml = imprintMatch ? imprintMatch[1] : "";
  const publisher = cleanXmlText(
    /<publisher(?:\s[^>]*)?>([\s\S]*?)<\/publisher>/i.exec(imprintXml)?.[1]
  );
  const pubPlace = cleanXmlText(
    /<pubPlace(?:\s[^>]*)?>([\s\S]*?)<\/pubPlace>/i.exec(imprintXml)?.[1]
  );
  const pubDate = cleanXmlText(
    /<date(?:\s[^>]*)?>([\s\S]*?)<\/date>/i.exec(imprintXml)?.[1]
  );

  const imprintParts = [publisher, pubPlace, pubDate].filter(
    (part) => part.length > 0 && part.toLowerCase() !== "none"
  );
  const volPart = volumeNumber !== undefined ? `, vol. ${volumeNumber}` : "";
  const imprintSuffix =
    imprintParts.length > 0 ? ` (${imprintParts.join(", ")})` : "";

  if (volumeNumber !== undefined || imprintParts.length > 0) {
    return `J.-P. Migne, Patrologia Latina${volPart}${imprintSuffix}`;
  }
  return "J.-P. Migne, Patrologia Latina";
}

function extractWorkTitleFromCts(
  workCtsXml: string,
  editionUrn: string,
  headerXml: string
): string {
  const editionPattern = new RegExp(
    `<ti:edition[^>]*\\burn=["']${escapeRegExp(
      editionUrn
    )}["'][^>]*>([\\s\\S]*?)<\\/ti:edition>`,
    "i"
  );
  const editionBlock = editionPattern.exec(workCtsXml)?.[1];
  if (editionBlock) {
    const label = cleanXmlText(
      /<ti:label(?:\s[^>]*)?>([\s\S]*?)<\/ti:label>/i.exec(editionBlock)?.[1]
    );
    if (label.length > 0 && label.toLowerCase() !== "none") {
      return label;
    }
  }

  const workTitle = cleanXmlText(
    /<ti:title(?:\s[^>]*)?>([\s\S]*?)<\/ti:title>/i.exec(workCtsXml)?.[1]
  );
  if (workTitle.length > 0 && workTitle.toLowerCase() !== "none") {
    return workTitle;
  }

  const headTitle = cleanXmlText(
    /<head(?:\s[^>]*)?>\s*<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(
      headerXml
    )?.[1]
  );
  return headTitle.length > 0 ? headTitle : editionUrn;
}

/**
 * Scans `$PATROLOGIA_LATINA_ROOT/data/*` (author-group `__cts__.xml`, work
 * `__cts__.xml`, and TEI edition headers) to build `ExperimentalTextCatalogEntry[]`.
 */
export function buildPatrologiaLatinaExperimentalTextEntries(
  options: BuildPatrologiaLatinaOptions
): {
  readonly sourceMeta: ExperimentalTextSourceRepoMeta;
  readonly entries: ExperimentalTextCatalogEntry[];
} {
  const sourceMeta = buildPatrologiaLatinaSourceMeta(
    options.commit,
    options.repo ?? PATROLOGIA_LATINA_DEFAULT_REPO
  );
  const dataDir = path.join(options.rootDir, "data");
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Patrologia Latina data directory not found at ${dataDir}`);
  }

  const sortedMetadataLines = loadSortedEditionMetadataLines(options.rootDir);
  const groupDirs = fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const entries: ExperimentalTextCatalogEntry[] = [];

  for (const groupDir of groupDirs) {
    const groupPath = path.join(dataDir, groupDir);
    const groupCtsPath = path.join(groupPath, "__cts__.xml");
    const groupCtsXml = fs.existsSync(groupCtsPath)
      ? fs.readFileSync(groupCtsPath, "utf8")
      : "";
    const groupAuthor = cleanXmlText(
      /<ti:groupname(?:\s[^>]*)?>([\s\S]*?)<\/ti:groupname>/i.exec(
        groupCtsXml
      )?.[1]
    );

    const workDirs = fs
      .readdirSync(groupPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const workDir of workDirs) {
      const workPath = path.join(groupPath, workDir);
      const workCtsPath = path.join(workPath, "__cts__.xml");
      const workCtsXml = fs.existsSync(workCtsPath)
        ? fs.readFileSync(workCtsPath, "utf8")
        : "";

      const xmlFiles = fs
        .readdirSync(workPath)
        .filter((f) => f.endsWith(".xml") && f !== "__cts__.xml")
        .sort();

      for (const xmlFile of xmlFiles) {
        const stem = xmlFile.slice(0, -".xml".length);
        const urn = `urn:cts:latinLit:${stem}`;
        const fullXmlPath = path.join(workPath, xmlFile);
        const headerXml = readFileHeader(fullXmlPath);

        let author = groupAuthor;
        if (!author || author.toLowerCase() === "none") {
          author = cleanXmlText(
            /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(headerXml)?.[1]
          );
        }
        if (!author || author.toLowerCase() === "none") {
          author = "Incertus";
        }

        const title = extractWorkTitleFromCts(workCtsXml, urn, headerXml);
        const volumeNumber = extractPlVolumeNumber(
          headerXml,
          groupDir,
          sortedMetadataLines
        );
        const volumeLabel =
          volumeNumber !== undefined ? `PL ${volumeNumber}` : undefined;
        const normalizedAuthor = normalizeExperimentalTextAuthor(author).author;
        const knownPeriod =
          PATROLOGIA_LATINA_AUTHOR_PERIODS[normalizedAuthor] ??
          PATROLOGIA_LATINA_AUTHOR_PERIODS[author];
        const period: ExperimentalTextPeriod =
          knownPeriod ??
          (volumeNumber !== undefined &&
          volumeNumber > PATROLOGIA_LATINA_PATRISTIC_MAX_VOLUME
            ? "medieval"
            : "ancient");
        const relFilePath = `data/${groupDir}/${workDir}/${xmlFile}`;
        const sourceUrl = `https://github.com/${sourceMeta.repo}/blob/${sourceMeta.commit}/${relFilePath}`;
        const statedEdition = extractStatedEdition(headerXml, volumeNumber);

        entries.push({
          id: `pl/${stem}`,
          source: "patrologia_latina",
          format: "tei",
          author,
          title,
          period,
          urn,
          ...(volumeLabel ? { volumeLabel } : {}),
          files: [relFilePath],
          sourceUrl,
          license: PATROLOGIA_LATINA_LICENSE,
          statedEdition,
        });
      }
    }
  }

  // Normalizes authors and titles (`catalog_normalizer.ts`), which also tells
  // apart same-titled works of one author (`((ADMONITIO))` x6 in PL 23) by
  // volume and counter.
  return {
    sourceMeta,
    entries: sortExperimentalTextCatalogEntries(
      normalizeExperimentalTextCatalogEntries(entries)
    ),
  };
}

function resolveLockedRootDir(envKey: string): string {
  const configured = envVar(envKey, "unsafe")?.trim();
  if (!configured) {
    throw new Error(
      `${envKey} is not set; set it in .env or run ./morcus.sh upstream status`
    );
  }
  return configured;
}

/**
 * Resolves the default local checkout root and pinned commit for
 * `patrologia_latina-dev` from `.env` and `upstream_sources.lock.json`.
 */
export function resolveDefaultPatrologiaLatinaOptions(): BuildPatrologiaLatinaOptions {
  const locked = upstreamSource("patrologia_latina-dev");
  return {
    rootDir: resolveLockedRootDir(locked.env),
    commit: locked.commit,
    repo: extractGithubOwnerRepo(locked.repo),
  };
}

/**
 * Resolves the default local checkout root and pinned commit for
 * `thelatinlibrary` from `.env` and `upstream_sources.lock.json`.
 */
export function resolveDefaultTheLatinLibraryOptions(): BuildLatinLibraryFromRootOptions {
  const locked = upstreamSource("thelatinlibrary");
  return {
    rootDir: resolveLockedRootDir(locked.env),
    commit: locked.commit,
    repo: extractGithubOwnerRepo(locked.repo ?? THE_LATIN_LIBRARY_DEFAULT_REPO),
  };
}

/**
 * Builds the complete `ExperimentalTextCatalogBundle` from pinned upstream sources.
 */
export function buildExperimentalTextsCatalogBundle(
  options: BuildExperimentalTextsCatalogOptions = {}
): ExperimentalTextCatalogBundle {
  const sources: Partial<
    Record<ExperimentalTextSourceId, ExperimentalTextSourceRepoMeta>
  > = {};
  const combinedEntries: ExperimentalTextCatalogEntry[] = [];

  if (options.patrologiaLatina !== false) {
    const plOverride = options.patrologiaLatina;
    const defaultPl =
      plOverride?.rootDir && plOverride?.commit
        ? undefined
        : resolveDefaultPatrologiaLatinaOptions();
    const plOptions: BuildPatrologiaLatinaOptions = {
      rootDir: plOverride?.rootDir ?? defaultPl!.rootDir,
      commit: plOverride?.commit ?? defaultPl!.commit,
      repo:
        plOverride?.repo ?? defaultPl?.repo ?? PATROLOGIA_LATINA_DEFAULT_REPO,
    };
    const plResult = buildPatrologiaLatinaExperimentalTextEntries(plOptions);
    sources.patrologia_latina = plResult.sourceMeta;
    combinedEntries.push(...plResult.entries);
  }

  if (options.theLatinLibrary !== false) {
    const llOverride = options.theLatinLibrary;
    const defaultLl =
      llOverride?.rootDir && llOverride?.commit
        ? undefined
        : resolveDefaultTheLatinLibraryOptions();
    const llOptions: BuildLatinLibraryFromRootOptions = {
      rootDir: llOverride?.rootDir ?? defaultLl!.rootDir,
      commit: llOverride?.commit ?? defaultLl!.commit,
      repo:
        llOverride?.repo ?? defaultLl?.repo ?? THE_LATIN_LIBRARY_DEFAULT_REPO,
    };
    const llResult =
      buildLatinLibraryExperimentalTextEntriesFromRoot(llOptions);
    sources.thelatinlibrary = llResult.sourceMeta;
    combinedEntries.push(...llResult.entries);
  }

  Object.assign(sources, options.additionalSources);
  if (options.additionalEntries) {
    combinedEntries.push(...options.additionalEntries);
  }

  const allEntries = sortExperimentalTextCatalogEntries(combinedEntries);

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sources,
    entries: allEntries,
  };
}

/**
 * Writes an `ExperimentalTextCatalogBundle` to disk (creating parent directories as needed).
 */
export function writeExperimentalTextsCatalogBundle(
  bundle: ExperimentalTextCatalogBundle,
  outputPath: string = DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
}

/**
 * Builds and writes `build/experimental_texts/experimental_texts_catalog.json`.
 */
export function buildExperimentalTextsCatalog(
  outputPath: string = DEFAULT_EXPERIMENTAL_TEXTS_CATALOG_PATH,
  options?: BuildExperimentalTextsCatalogOptions
): ExperimentalTextCatalogBundle {
  const bundle = buildExperimentalTextsCatalogBundle(options);
  writeExperimentalTextsCatalogBundle(bundle, outputPath);
  return bundle;
}
