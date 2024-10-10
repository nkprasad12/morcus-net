import { envVar } from "@/common/env_vars";
import {
  LIBRARY_INDEX,
  LIB_DEFAULT_DIR,
  LibraryIndex,
} from "@/common/library/library_lookup";
import {
  LibraryWorkMetadata,
  type ProcessedWork,
} from "@/common/library/library_types";
import { processTei } from "@/common/library/process_work";
import { parseCtsTeiXml, type TeiCtsDocument } from "@/common/xml/tei_utils";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseRawXml } from "@/common/xml/xml_utils";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { stringifyMessage } from "@/web/utils/rpc/parsing";
import fs from "fs";

// TODO: We should just crawl some root.
const LOCAL_ROOT = envVar("LIB_XML_ROOT", "unsafe") || "texts/latin/perseus";
const ALL_WORKS = [
  // // Ovid Amores.
  // `${LOCAL_ROOT}/data/phi0959/phi001/phi0959.phi001.perseus-lat2.xml`,
  // // Tacitus Germania
  // `${LOCAL_ROOT}/data/phi1351/phi002/phi1351.phi002.perseus-lat1.xml`,
  `${LOCAL_ROOT}/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml`,
  `${LOCAL_ROOT}/data/phi0975/phi001/phi0975.phi001.perseus-lat2.xml`,
  // Juvenal Satires.
  // `${LOCAL_ROOT}/data/phi1276/phi001/phi1276.phi001.perseus-lat2.xml`,
];

const AUTHOR_TO_URL_LOOKUP = new Map<string, string>([
  ["Julius Caesar", "caesar"],
  ["P. Ovidius Naso", "ovid"],
  ["Cornelius Tacitus", "tacitus"],
]);

const NAME_TO_DISPLAY_NAME = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "Germania"],
]);

const NAME_TO_URL_LOOKUP = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "germania"],
]);

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

function processTeiCts(tei: TeiCtsDocument): ProcessedWork {
  const words: string[] = [];
  const onWord = (word: string) => {
    const trimmed = word.trim();
    const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
    if (cruncher(trimmed, CruncherOptions.DEFAULT).length === 0) {
      words.push(trimmed);
    }
  };
  const debugRoot: string | undefined = envVar("DEBUG_OUT", "unsafe");
  const debugName = tei.info.title.replaceAll(" ", "_");
  const outputPath = debugRoot?.concat("/", debugName, ".debug.txt");
  const debugHelper = outputPath === undefined ? undefined : { onWord };
  const result = processTei(tei, debugHelper);
  if (outputPath !== undefined) {
    fs.writeFileSync(outputPath, words.sort().join("\n"));
  }
  return result;
}

export function processLibrary(
  outputDir: string = LIB_DEFAULT_DIR,
  works: string[] = ALL_WORKS
) {
  const index: LibraryIndex = {};
  for (const workPath of works) {
    // We should use the Perseus URN instead.
    const workId = workPath
      .split("/")
      .slice(-1)[0]
      .replace(/\.[^/.]+$/, "");
    const tei = parseCtsTeiXml(parseRawXml(fs.readFileSync(workPath)));
    const title = NAME_TO_DISPLAY_NAME.get(tei.info.title) || tei.info.title;
    const metadata: LibraryWorkMetadata = {
      id: workId,
      author: tei.info.author,
      name: title,
      urlAuthor: urlifyAuthor(tei.info.author),
      urlName: urlifyName(tei.info.title),
    };
    const result = processTeiCts(tei);
    const encoded = stringifyMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = [outputPath, metadata];
    fs.writeFileSync(outputPath, encoded);
    console.log("Wrote processed file to %s", outputPath);
  }
  // TODO: We should verify here that there are no duplicates.
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}
