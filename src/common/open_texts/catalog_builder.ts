import fs from "fs";
import path from "path";
import * as he from "he";
import { envVar } from "@/common/env_vars";
import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
  type OpenTextCatalogBundle,
  type OpenTextCatalogEntry,
  type OpenTextPeriod,
  type OpenTextSourceId,
  type OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import {
  THE_LATIN_LIBRARY_DEFAULT_REPO,
  buildLatinLibraryOpenTextEntriesFromRoot,
  type BuildLatinLibraryFromRootOptions,
} from "@/common/open_texts/latin_library_catalog";
import { upstreamSource } from "@/scripts/upstream/lock";

/** Default output path for the compiled Open Texts catalog JSON bundle. */
export const DEFAULT_OPEN_TEXTS_CATALOG_PATH =
  "build/open_texts/open_texts_catalog.json";

/** Default GitHub repository slug for Patrologia Latina (`Decision #5`). */
export const PATROLOGIA_LATINA_DEFAULT_REPO =
  "nkprasad12/patrologia_latina-dev";

/** License for OpenGreekAndLatin `patrologia_latina-dev`. */
export const PATROLOGIA_LATINA_LICENSE = "CC BY-SA 4.0";

/**
 * In Migne's *Patrologia Latina*, the First Series (volumes 1–73, Tertullian to
 * Gregory the Great / Isidore, ~200–604 AD) is Patristic, and the Second Series
 * (volumes 74–217, ~604–1216 AD) is Medieval.
 */
export const PATROLOGIA_LATINA_PATRISTIC_MAX_VOLUME = 73;

const HEADER_READ_BYTES = 16384;

export interface BuildPatrologiaLatinaOptions {
  /** Local filesystem checkout of `patrologia_latina-dev`. */
  readonly rootDir: string;
  /** Pinned 40-char git commit SHA from `upstream_sources.lock.json`. */
  readonly commit: string;
  /** GitHub `owner/repo` slug (defaults to `nkprasad12/patrologia_latina-dev`). */
  readonly repo?: string;
}

export interface BuildOpenTextsCatalogOptions {
  readonly patrologiaLatina?: Partial<BuildPatrologiaLatinaOptions>;
  readonly theLatinLibrary?: Partial<BuildLatinLibraryFromRootOptions> | false;
  readonly additionalSources?: Readonly<
    Partial<Record<OpenTextSourceId, OpenTextSourceRepoMeta>>
  >;
  readonly additionalEntries?: readonly OpenTextCatalogEntry[];
  readonly generatedAt?: string;
}

/**
 * Extracts `owner/repo` from a GitHub HTTPS or SSH URL, or returns the input if
 * already in `owner/repo` form.
 */
export function extractGithubOwnerRepo(repoUrlOrSlug: string): string {
  const trimmed = repoUrlOrSlug.trim();
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(
      trimmed
    );
  return match ? match[1] : trimmed.replace(/\.git$/i, "");
}

/**
 * Builds the `OpenTextSourceRepoMeta` descriptor for `patrologia_latina`.
 */
export function buildPatrologiaLatinaSourceMeta(
  commit: string,
  repoSlug: string = PATROLOGIA_LATINA_DEFAULT_REPO
): OpenTextSourceRepoMeta {
  const repo = extractGithubOwnerRepo(repoSlug);
  return {
    source: "patrologia_latina",
    label: "Patrologia Latina",
    repo,
    commit,
    rawBaseUrl: buildRawGithubBaseUrl(repo, commit),
    fallbackBaseUrl: buildJsDelivrBaseUrl(repo, commit),
    license: PATROLOGIA_LATINA_LICENSE,
  };
}

/**
 * Sorts catalog entries deterministically by `(author, title, id)`.
 */
export function sortOpenTextCatalogEntries(
  entries: readonly OpenTextCatalogEntry[]
): OpenTextCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const authorCmp = a.author.localeCompare(b.author);
    if (authorCmp !== 0) return authorCmp;
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;
    return a.id.localeCompare(b.id);
  });
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
 * `__cts__.xml`, and TEI edition headers) to build `OpenTextCatalogEntry[]`.
 */
export function buildPatrologiaLatinaOpenTextEntries(
  options: BuildPatrologiaLatinaOptions
): {
  readonly sourceMeta: OpenTextSourceRepoMeta;
  readonly entries: OpenTextCatalogEntry[];
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

  const entries: OpenTextCatalogEntry[] = [];

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

        const rawTitle = extractWorkTitleFromCts(workCtsXml, urn, headerXml);
        const volumeNumber = extractPlVolumeNumber(
          headerXml,
          groupDir,
          sortedMetadataLines
        );
        const volumeLabel =
          volumeNumber !== undefined ? `PL ${volumeNumber}` : undefined;
        const title =
          /^\(\([\s\S]+\)\)$/.test(rawTitle) && volumeLabel
            ? `${rawTitle} [${volumeLabel} · ${groupDir}]`
            : rawTitle;
        const period: OpenTextPeriod =
          volumeNumber !== undefined &&
          volumeNumber > PATROLOGIA_LATINA_PATRISTIC_MAX_VOLUME
            ? "medieval"
            : "patristic";
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

  return {
    sourceMeta,
    entries: sortOpenTextCatalogEntries(entries),
  };
}

function resolveExistingRoot(
  envKey: string,
  candidates: readonly string[],
  fallback: string
): string {
  const configured = envVar(envKey, "unsafe");
  if (
    configured !== undefined &&
    configured.trim() !== "" &&
    fs.existsSync(configured)
  ) {
    return configured;
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return configured !== undefined && configured.trim() !== ""
    ? configured
    : fallback;
}

/**
 * Resolves the default local checkout root and pinned commit for
 * `patrologia_latina-dev` from `.env` and `upstream_sources.lock.json`.
 */
export function resolveDefaultPatrologiaLatinaOptions(): BuildPatrologiaLatinaOptions {
  const locked = upstreamSource("patrologia_latina-dev");
  const rootDir = resolveExistingRoot(
    "PATROLOGIA_LATINA_ROOT",
    ["patrologia_latina-dev", "../patrologia_latina-dev"],
    "patrologia_latina-dev"
  );
  return {
    rootDir,
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
  const rootDir = resolveExistingRoot(
    "THELATINLIBRARY_ROOT",
    [
      "TheLatinLibrary",
      "thelatinlibrary",
      "../TheLatinLibrary",
      "../thelatinlibrary",
    ],
    "thelatinlibrary"
  );
  return {
    rootDir,
    commit: locked.commit,
    repo: extractGithubOwnerRepo(locked.repo ?? THE_LATIN_LIBRARY_DEFAULT_REPO),
  };
}

/**
 * Builds the complete `OpenTextCatalogBundle` from pinned upstream sources.
 */
export function buildOpenTextsCatalogBundle(
  options: BuildOpenTextsCatalogOptions = {}
): OpenTextCatalogBundle {
  const defaultPl = resolveDefaultPatrologiaLatinaOptions();
  const plOptions: BuildPatrologiaLatinaOptions = {
    rootDir: options.patrologiaLatina?.rootDir ?? defaultPl.rootDir,
    commit: options.patrologiaLatina?.commit ?? defaultPl.commit,
    repo: options.patrologiaLatina?.repo ?? defaultPl.repo,
  };

  const plResult = buildPatrologiaLatinaOpenTextEntries(plOptions);
  const sources: Partial<Record<OpenTextSourceId, OpenTextSourceRepoMeta>> = {
    patrologia_latina: plResult.sourceMeta,
  };
  const combinedEntries: OpenTextCatalogEntry[] = [...plResult.entries];

  const shouldIncludeLl =
    options.theLatinLibrary !== false &&
    (options.theLatinLibrary !== undefined ||
      options.patrologiaLatina === undefined);

  if (shouldIncludeLl) {
    const defaultLl = resolveDefaultTheLatinLibraryOptions();
    const llOverride =
      typeof options.theLatinLibrary === "object"
        ? options.theLatinLibrary
        : undefined;
    const llOptions: BuildLatinLibraryFromRootOptions = {
      rootDir: llOverride?.rootDir ?? defaultLl.rootDir,
      commit: llOverride?.commit ?? defaultLl.commit,
      repo: llOverride?.repo ?? defaultLl.repo,
    };
    if (
      llOverride !== undefined ||
      fs.existsSync(path.join(llOptions.rootDir, "work_index.json"))
    ) {
      const llResult = buildLatinLibraryOpenTextEntriesFromRoot(llOptions);
      sources.thelatinlibrary = llResult.sourceMeta;
      combinedEntries.push(...llResult.entries);
    }
  }

  Object.assign(sources, options.additionalSources);
  if (options.additionalEntries) {
    combinedEntries.push(...options.additionalEntries);
  }

  const allEntries = sortOpenTextCatalogEntries(combinedEntries);

  return {
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sources,
    entries: allEntries,
  };
}

/**
 * Writes an `OpenTextCatalogBundle` to disk (creating parent directories as needed).
 */
export function writeOpenTextsCatalogBundle(
  bundle: OpenTextCatalogBundle,
  outputPath: string = DEFAULT_OPEN_TEXTS_CATALOG_PATH
): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
}

/**
 * Builds and writes `build/open_texts/open_texts_catalog.json`.
 */
export function buildOpenTextsCatalog(
  outputPath: string = DEFAULT_OPEN_TEXTS_CATALOG_PATH,
  options?: BuildOpenTextsCatalogOptions
): OpenTextCatalogBundle {
  const bundle = buildOpenTextsCatalogBundle(options);
  writeOpenTextsCatalogBundle(bundle, outputPath);
  return bundle;
}
