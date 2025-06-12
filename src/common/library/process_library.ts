import { envVar } from "@/common/env_vars";
import {
  EnglishTranslations,
  LOCAL_REPO_WORKS,
} from "@/common/library/library_constants";
import {
  LIBRARY_INDEX,
  LIB_DEFAULT_DIR,
  LibraryIndex,
} from "@/common/library/library_lookup";
import {
  loadPatches,
  type LibraryPatch,
} from "@/common/library/library_patches";
import {
  LibraryWorkMetadata,
  type ProcessedWork2,
  type TranslationInfo,
} from "@/common/library/library_types";
import { processTei2 } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseRawXml } from "@/common/xml/xml_utils";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";
import { stringifyMessage } from "@/web/utils/rpc/parsing";
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
]);

const PERSEUS_LAT_LIT_DECLARATION = `<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd" [
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd" >
%PersProse;
]>`;

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

export function processLibrary(
  outputDir: string = LIB_DEFAULT_DIR,
  works: string[] = LOCAL_REPO_WORK_PATHS
) {
  const patches = loadPatches();
  const index: LibraryIndex = {};
  const sortedWorks = works
    .map((p) => [p, pathToId(p)])
    .sort((a) => (isTranslationId(a[1]) ? -1 : 1))
    .map((a) => a[0]);
  const translationDataById = new Map<string, TranslationInfo>();

  for (const workPath of sortedWorks) {
    // We should use the Perseus URN instead.
    const workId = pathToId(workPath);
    const rawXml = parseRawXml(
      fs
        .readFileSync(workPath)
        .toString()
        // This is a complete hack to skip the declaration.
        // the fast-xml-parser library has a config option to skip the declaration, but it
        // doesn't actually work.
        .replace(PERSEUS_LAT_LIT_DECLARATION, ""),
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
    const rawTitle = result.info.title;
    const shortName = NAME_TO_DISPLAY_NAME.get(rawTitle);
    const title = shortName ?? rawTitle;
    result.info.shortTitle = shortName;
    const isTranslation = isTranslationId(workId);
    result.info.translationInfo = translationDataById.get(translationId);

    const metadata: LibraryWorkMetadata = {
      id: workId,
      author: result.info.author,
      name: title,
      urlAuthor: urlifyAuthor(result.info.author),
      urlName: urlifyName(result.info.title),
      translationId,
      isTranslation,
    };
    if (isTranslation) {
      translationDataById.set(workId, {
        id: workId,
        translator: result.info.translator,
        title: result.info.title,
      });
    }
    const encoded = stringifyMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = [outputPath, metadata];
    fs.writeFileSync(outputPath, encoded);
    console.log("Wrote processed file to %s", outputPath);
  }
  // TODO: We should verify here that there are no duplicates.
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}
