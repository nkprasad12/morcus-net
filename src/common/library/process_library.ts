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

function urlify(input: string, customs: Map<string, string>) {
  const custom = customs.get(input);
  if (custom !== undefined) {
    return custom;
  }
  return input
    .split(" ")
    .map((c) => c.toLowerCase())
    .join("_");
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
  translationId?: string
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
    { workId, translationId },
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

function decorateDocumentInfo(info: DocumentInfo): DocumentInfo {
  const rawTitle = info.title;
  const shortName = NAME_TO_DISPLAY_NAME.get(rawTitle);
  const decorated: DocumentInfo = { ...info };
  decorated.shortTitle = shortName;
  return decorated;
}

function extractWorkMetadata(
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
    urlName: urlifyName(info.title),
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
        translationId
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
