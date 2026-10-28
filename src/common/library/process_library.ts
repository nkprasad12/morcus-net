import { assert, assertEqual } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import {
  latinWorksFromLibrary,
  LIB_CORPUS_INPUT_DIR,
  saveAsCorpusInputWork,
} from "@/common/library/corpus/corpus_library_utils";
import {
  EnglishTranslations,
  LOCAL_REPO_WORKS,
} from "@/common/library/library_constants";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import {
  loadPatches,
  type LibraryPatch,
  type LibraryPatchMap,
} from "@/common/library/library_patches";
import {
  LibraryWorkMetadata,
  type DocumentInfo,
  type ProcessedWork2,
  type TranslationInfo,
} from "@/common/library/library_types";
import { processHypotactic } from "@/common/library/process_hypotactic";
import { processPhiJson } from "@/common/library/process_phi_json";
import { processTei2 } from "@/common/library/process_work";
import { preprocessWorkToV2 } from "@/common/library/preprocess/work_preprocessor";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import { readCtsMetadata, type CtsMetadata } from "@/common/xml/tei_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";
import { saveV2LibraryDb } from "@/web/ui/reader/reader_loader.server";
import fs from "fs";
import path from "path";

// TODO: We should just crawl some root.
const LOCAL_REPO_ROOT = "texts/latin/perseus";

const LOCAL_REPO_WORK_PATHS = LOCAL_REPO_WORKS.map(
  (work) => `${LOCAL_REPO_ROOT}/${work}`
);

const AUTHOR_TO_URL_LOOKUP = new Map<string, string>([
  ["Julius Caesar", "caesar"],
  ["P. Ovidius Naso", "ovid"],
  ["Cornelius Tacitus", "tacitus"],
  ["C. Valerius Catullus", "catullus"],
  ["M. Tullius Cicero", "cicero"],
  ["C. Suetonius Tranquillus", "suetonius"],
  ["L. Annaeus Seneca iunior", "seneca_minor"],
  ["Titus Livius (Livy)", "livy"],
  ["Pseudo-Caesar", "pseudo_caesar"],
  ["Sextus Propertius", "propertius"],
  ["Valerius Flaccus", "valerius_flaccus"],
  ["Vitruvius Pollio", "vitruvius"],
  ["Aulus Gellius", "gellius"],
  // Seneca the Younger's Perseus works joined his PHI ones in Phase 2B. The
  // old `seneca,_lucius_annaeus` slug still resolves and redirects; see
  // `LEGACY_AUTHOR_SLUGS` in reader_loader.server.ts.
  ["Seneca, Lucius Annaeus", "seneca_minor"],
  ["Scriptores Historiae Augustae", "historia_augusta"],
  ["Ausonius, Decimus Magnus", "ausonius"],
  ["Q. Tullius Cicero", "quintus_cicero"],
  ["Sidonius Apollinaris", "sidonius"],
  ["Silius Italicus", "silius_italicus"],
  ["Cato, Marcus Porcius", "cato"],
  ["Jerome, Saint", "jerome"],
  // Slugs from before `urlify` dropped punctuation, kept so links still work.
  ["Curtius Rufus, Quintus", "curtius_rufus,_quintus"],
  ["Florus, Lucius Annaeus", "florus,_lucius_annaeus"],
]);

const NAME_TO_DISPLAY_NAME = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "Germania"],
  ["De Vita Iulii Agricolae", "Agricola"],
  ["The Catilinarian Conspiracy", "Bellum Catilinae"],
  ["Laelius De Amicitia", "De Amicitia"],
  ["Pro P. Quinctio", "Pro Quinctio"],
  ["Medicamina faciei femineae", "Medicamina"],
  [
    "Pro C. Rabirio Perduellionis Reo Ad Quirites",
    "Pro Rabirio Perduellionis Reo",
  ],
  ["In L. Catilinam", "In Catilinam"],
  ["De domo sua ad pontifices", "de Domo Sua"],
  ["De haruspicum responso in P. Clodium", "De Haruspicum Responso"],
  ["In P. Vatinium testem interrogatio", "In P. Vatinium"],
  ["Pro L. Cornelio Balbo", "Pro Balbo"],
  ["In L. Calpurnium Pisonem", "In Pisonem"],
  ["Pro C. Rabirio Postumo", "Pro Rabirio Postumo"],
  ["Pro M. Tullio", "Pro Tullio"],
  ["De Imperio Cn. Pompei Ad Quirites", "De Imperio Cn. Pompei"],
  ["Pro A. Cluentio", "Pro Cluentio"],
  ["Pro L. Murena", "Pro Murena"],
]);

const NAME_TO_URL_LOOKUP = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "germania"],
  ["De Vita Iulii Agricolae", "agricola"],
  ["The Catilinarian Conspiracy", "catalina1"],
  ["Medicamina faciei femineae", "medicamina"],
  ["Pro P. Quinctio", "pro_quinctio"],
  [
    "Pro C. Rabirio Perduellionis Reo Ad Quirites",
    "pro_rabirio_perduellionis_reo",
  ],
  ["In L. Catilinam", "in_catilinam"],
  ["De domo sua ad pontifices", "de_domo_sua"],
  ["De haruspicum responso in P. Clodium", "de_haruspicum_responso"],
  ["In P. Vatinium testem interrogatio", "in_p_vatinium"],
  ["Pro L. Cornelio Balbo", "pro_balbo"],
  ["In L. Calpurnium Pisonem", "in_pisonem"],
  ["Pro C. Rabirio Postumo", "pro_rabirio_postumo"],
  ["Pro M. Tullio", "pro_tullio"],
  ["De Imperio Cn. Pompei Ad Quirites", "de_imperio_cn_pompei"],
  ["Pro A. Cluentio", "pro_cluentio"],
  ["Pro L. Murena", "pro_murena"],
]);

/** Index just past the `<!DOCTYPE ...>` that starts at `start`. */
function endOfDoctype(xml: string, start: number): number {
  let inSubset = false;
  let quote: string | undefined = undefined;
  for (let i = start + "<!DOCTYPE".length; i < xml.length; i++) {
    const c = xml[i];
    if (quote !== undefined) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (inSubset && xml.startsWith("<!--", i)) {
      const close = xml.indexOf("-->", i + 4);
      assert(close >= 0, "Unterminated comment in DOCTYPE");
      i = close + 2;
    } else if (c === "[") {
      inSubset = true;
    } else if (c === "]") {
      inSubset = false;
    } else if (c === ">" && !inSubset) {
      return i + 1;
    }
  }
  throw new Error("Unterminated DOCTYPE");
}

/**
 * Removes the XML prolog: everything before the root element. That is the
 * XML declaration, processing instructions (upstream Perseus files carry one
 * or two `<?xml-model ...?>`), comments, and a `<!DOCTYPE>` with or without an
 * internal subset (the TEI P4 one that remains in some files declares
 * parameter entities, which the XML parser cannot handle). The parser expects
 * exactly one top-level element, so none of these may reach it.
 *
 * Exported for testing.
 */
export function stripXmlProlog(xml: string): string {
  let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (;;) {
    while (i < xml.length && /\s/.test(xml[i])) i++;
    if (xml.startsWith("<?", i)) {
      const close = xml.indexOf("?>", i + 2);
      assert(close >= 0, "Unterminated processing instruction");
      i = close + 2;
    } else if (xml.startsWith("<!--", i)) {
      const close = xml.indexOf("-->", i + 4);
      assert(close >= 0, "Unterminated comment");
      i = close + 3;
    } else if (xml.startsWith("<!DOCTYPE", i)) {
      i = endOfDoctype(xml, i);
    } else {
      return xml.slice(i);
    }
  }
}

/**
 * URL slugs pinned by work id. Slugs are derived from the TEI title, so when
 * upstream retitles a work its reader URL would move; pinning keeps old links
 * and saved spots working. Add an entry whenever a sync changes a slug.
 */
export const URL_NAME_BY_WORK_ID = new Map<string, string>([
  // canonical-latinLit 0700a6b7 (2026-10) retitled these.
  ["phi0474.phi003.perseus-lat2", "quintus_roscius"],
  ["phi0474.phi007.perseus-lat2", "pro_fonteio"],
  ["phi0474.phi018.perseus-lat2", "cum_populo_gratias_egi"],
  ["phi0474.phi020.perseus-lat2", "de_domo_sua"],
  ["phi0474.phi021.perseus-lat2", "de_haruspicum_responso"],
  ["phi0474.phi023.perseus-lat2", "in_p_vatinium"],
  ["phi0474.phi025.perseus-lat2", "de_provinciis_consularibus"],
  ["phi0474.phi034.perseus-lat2", "pro_rege_deiotaro"],
  ["phi0474.phi038.perseus-lat2", "de_partitione_oratoria"],
  ["phi0474.phi043.perseus-lat2", "de_republica"],
  ["phi0474.phi051.perseus-lat2", "de_senectute"],
  ["phi1351.phi001.perseus-lat2", "agricola"],
  // Slugs from before `urlify` dropped punctuation, kept so links still work.
  ["phi0474.phi004.perseus-lat2", "divinatio_in_q._caecilium"],
  ["phi0474.phi008.perseus-lat2", "pro_a._caecina"],
  ["phi0474.phi015.perseus-lat2", "pro_p._sulla"],
  ["phi0474.phi017.perseus-lat2", "pro_l._flacco"],
  ["phi0474.phi022.perseus-lat2", "pro_p._sestio"],
  ["phi0474.phi024.perseus-lat2", "pro_m._caelio"],
  ["phi0474.phi028.perseus-lat2", "pro_cn._plancio"],
  ["phi0474.phi029.perseus-lat2", "pro_m._scauro"],
  ["phi0474.phi031.perseus-lat2", "pro_t._annio_milone"],
  ["phi0474.phi032.perseus-lat2", "pro_m._marcello"],
  ["phi0474.phi033.perseus-lat2", "pro_q._ligario"],
  // Phase 2B: TEI titles that are too long, or wrong (stoa014's is OCR'd
  // with a line break), to make a good slug. Named after `__cts__.xml`.
  ["stoa0045.stoa010.perseus-lat2", "epigrammata"],
  // Both are titled "Epistularum" in the TEI.
  ["stoa0045.stoa011.perseus-lat2", "epistulae"],
  ["stoa0045.stoa014.perseus-lat2", "gratiarum_actio"],
  ["stoa0045.stoa016.perseus-lat2", "protrepticus_ad_nepotem"],
  ["stoa0058.stoa023.perseus-lat1", "contra_eutychen_et_nestorium"],
  ["stoa0058.stoa025.perseus-lat1", "de_trinitate"],
  ["stoa0058.stoa028.perseus-lat1", "utrum_pater_et_filius"],
  ["stoa0162.stoa004.perseus-lat2", "epistulae"],
  ["phi0845.phi002.perseus-lat3", "res_rustica"],
  ["stoa0261.stoa002.perseus-lat1", "epistulae"],
]);

/** Short display titles pinned by work id, for the same reason. */
export const SHORT_TITLE_BY_WORK_ID = new Map<string, string>([
  ["phi0474.phi020.perseus-lat2", "de Domo Sua"],
  ["phi0474.phi021.perseus-lat2", "De Haruspicum Responso"],
  ["phi0474.phi023.perseus-lat2", "In P. Vatinium"],
  ["phi1351.phi001.perseus-lat2", "Agricola"],
  ["stoa0045.stoa010.perseus-lat2", "Epigrammata"],
  ["stoa0045.stoa011.perseus-lat2", "Epistulae"],
  ["stoa0045.stoa014.perseus-lat2", "Gratiarum Actio"],
  ["stoa0045.stoa016.perseus-lat2", "Protrepticus ad Nepotem"],
  ["stoa0058.stoa023.perseus-lat1", "Contra Eutychen et Nestorium"],
  ["stoa0058.stoa025.perseus-lat1", "De Trinitate"],
  ["stoa0058.stoa028.perseus-lat1", "Utrum Pater et Filius"],
  ["stoa0162.stoa004.perseus-lat2", "Epistulae"],
  ["phi0845.phi002.perseus-lat3", "Res Rustica"],
  ["stoa0261.stoa002.perseus-lat1", "Epistulae"],
]);

/**
 * The URL slug for `input`: its entry in `customs`, else the lower-cased
 * words joined by `_`, with accents removed and only `[a-z0-9_-]` kept.
 * Exported for testing.
 */
export function urlify(input: string, customs: Map<string, string>): string {
  const custom = customs.get(input);
  if (custom !== undefined) {
    return custom;
  }
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  assert(slug.length > 0, () => `Empty URL slug for "${input}"`);
  return slug;
}

function urlifyAuthor(input: string): string {
  return urlify(input, AUTHOR_TO_URL_LOOKUP);
}

function urlifyName(input: string): string {
  return urlify(input, NAME_TO_URL_LOOKUP);
}

function processTeiCts2(
  root: XmlNode,
  workId: string,
  patches?: LibraryPatch[],
  translationId?: string,
  ctsMetadata?: CtsMetadata
): ProcessedWork2 {
  const words = new Set<string>();
  const onWord = (word: string) => {
    const trimmed = word.trim();
    if (parseRomanNumeral(trimmed) !== undefined) {
      return;
    }
    const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
    if (cruncher(trimmed, CruncherOptions.DEFAULT).length === 0) {
      words.add(trimmed);
    }
  };
  const debugRoot: string | undefined = envVar("DEBUG_OUT", "unsafe");
  const debugHelper = debugRoot === undefined ? undefined : { onWord };
  const result = processTei2(
    root,
    { workId, translationId, ctsMetadata },
    { patches, sideChannel: debugHelper }
  );
  const debugName = result.info.title.replaceAll(" ", "_");
  const outputPath = debugRoot?.concat("/", debugName, ".debug.txt");
  if (outputPath !== undefined) {
    fs.writeFileSync(outputPath, Array.from(words).sort().join("\n"));
  }
  return result;
}

function pathToId(filePath: string): string {
  return path.basename(filePath).replace(/\.[^/.]+$/, "");
}

function isTranslationId(workId: string): boolean {
  return Object.values(EnglishTranslations).some(
    (translation) => translation === workId
  );
}

/** Exported for testing. */
export function decorateDocumentInfo(info: DocumentInfo): DocumentInfo {
  const rawTitle = info.title;
  const shortName =
    SHORT_TITLE_BY_WORK_ID.get(info.workId) ??
    NAME_TO_DISPLAY_NAME.get(rawTitle);
  const decorated: DocumentInfo = { ...info };
  decorated.shortTitle = shortName;
  return decorated;
}

/** Exported for testing. */
export function extractWorkMetadata(
  id: string,
  info: DocumentInfo,
  args?: {
    isTranslation?: boolean;
    translationId?: string;
  }
): LibraryWorkMetadata {
  return {
    id,
    author: info.author,
    name: info.shortTitle ?? info.title,
    urlAuthor: urlifyAuthor(info.author),
    urlName: URL_NAME_BY_WORK_ID.get(id) ?? urlifyName(info.title),
    translationId: args?.translationId,
    isTranslation: args?.isTranslation,
    attribution: info.attribution ?? "perseus",
  };
}

export interface PreprocessPerseusOptions {
  patches: LibraryPatchMap;
  /** Called after `processTei2` succeeds for each file (incl. translations). */
  onProcessed?: (work: ProcessedWork2, isTranslation: boolean) => void;
  /** Called with each non-translation work's V2 output. */
  onV2Work: (v2: V2PreprocessedWork, work: ProcessedWork2) => void;
  /** If set, a throwing work is reported here and skipped; else it throws. */
  onError?: (workId: string, error: unknown) => void;
}

/**
 * Runs the Perseus TEI files at `workPaths` through the reader pipeline:
 * parse → `processTei2` (with patches) → `preprocessWorkToV2`, attaching each
 * work's English translation. Translations are processed first so they can be
 * attached; they produce no V2 work of their own. Returns the ids of the files
 * that processed. Shared by `processLibrary` and `./morcus.sh library render`.
 */
export function preprocessPerseusWorks(
  workPaths: string[],
  options: PreprocessPerseusOptions
): string[] {
  const { patches, onProcessed, onV2Work, onError } = options;
  const workIds: string[] = [];
  const sortedWorks = workPaths
    .map((p) => [p, pathToId(p)])
    .sort((a) => (isTranslationId(a[1]) ? -1 : 1))
    .map((a) => a[0]);
  const translationDataById = new Map<string, TranslationInfo>();
  const translationWorksById = new Map<string, ProcessedWork2>();

  for (const workPath of sortedWorks) {
    // We should use the Perseus URN instead.
    const workId = pathToId(workPath);
    try {
      const rawXml = parseRawXml(
        // fast-xml-parser has an option to skip the DOCTYPE, but it doesn't
        // work, so the prolog is removed before parsing.
        stripXmlProlog(fs.readFileSync(workPath).toString()),
        {
          keepWhitespace: true,
        }
      );
      const translationId = EnglishTranslations[workId];
      const result = processTeiCts2(
        rawXml,
        workId,
        patches.get(workId),
        translationId,
        readCtsMetadata(workPath)
      );
      const isTranslation = isTranslationId(workId);
      result.info.isTranslation = isTranslation;
      result.info.translationInfo = translationDataById.get(translationId);
      result.info = decorateDocumentInfo(result.info);
      workIds.push(workId);
      onProcessed?.(result, isTranslation);

      if (isTranslation) {
        translationDataById.set(workId, {
          id: workId,
          translator: result.info.translator,
          title: result.info.title,
        });
        translationWorksById.set(workId, result);
        continue;
      }

      const metadata = extractWorkMetadata(workId, result.info, {
        isTranslation,
        translationId,
      });
      const translationWork = translationId
        ? translationWorksById.get(translationId)
        : undefined;
      onV2Work(preprocessWorkToV2(result, metadata, translationWork), result);
    } catch (e) {
      if (onError === undefined) {
        throw e;
      }
      onError(workId, e);
    }
  }
  translationWorksById.clear();
  return workIds;
}

export async function processLibrary({
  outputDir = LIB_DEFAULT_DIR,
  works = LOCAL_REPO_WORK_PATHS,
  shouldBuildCorpus = false,
  corpusInputDir = LIB_CORPUS_INPUT_DIR,
}: {
  outputDir?: string;
  works?: string[];
  shouldBuildCorpus?: boolean;
  corpusInputDir?: string;
} = {}) {
  fs.rmSync(corpusInputDir, { recursive: true, force: true });
  fs.mkdirSync(corpusInputDir, { recursive: true });
  const patches = loadPatches();
  const allWorkIds: string[] = [];
  const v2Works: V2PreprocessedWork[] = [];

  function processGenericWork(work: ProcessedWork2) {
    const workId = work.info.workId;
    work.info = decorateDocumentInfo(work.info);
    saveAsCorpusInputWork(work, corpusInputDir);
    const metadata = extractWorkMetadata(workId, work.info);
    allWorkIds.push(workId);
    v2Works.push(preprocessWorkToV2(work, metadata));
  }

  processPhiJson().forEach(processGenericWork);
  processHypotactic().forEach(processGenericWork);

  allWorkIds.push(
    ...preprocessPerseusWorks(works, {
      patches,
      onProcessed: (work, isTranslation) => {
        if (!isTranslation) {
          saveAsCorpusInputWork(work, corpusInputDir);
        }
      },
      onV2Work: (v2) => v2Works.push(v2),
    })
  );
  const duplicateIds = allWorkIds.filter((id, i, arr) => arr.indexOf(id) !== i);
  assertEqual(
    duplicateIds.length,
    0,
    "Duplicate work IDs found in library index"
  );
  saveV2LibraryDb(outputDir, v2Works);
  console.log(`Preprocessed ${v2Works.length} V2 works into ${outputDir}`);
  v2Works.length = 0;
  if (shouldBuildCorpus) {
    await buildCorpus(latinWorksFromLibrary(corpusInputDir));
  }
}
