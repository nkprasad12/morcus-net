import { envVar } from "@/common/env_vars";
import { LOCAL_REPO_WORKS } from "@/common/library/library_constants";
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
} from "@/common/library/library_types";
import { processTei2 } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseRawXml } from "@/common/xml/xml_utils";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
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
]);

const NAME_TO_DISPLAY_NAME = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "Germania"],
]);

const NAME_TO_URL_LOOKUP = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "germania"],
  ["The Catilinarian Conspiracy", "catalina1"],
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

function processTeiCts2(
  root: XmlNode,
  patches?: LibraryPatch[]
): ProcessedWork2 {
  const words: string[] = [];
  const onWord = (word: string) => {
    const trimmed = word.trim();
    const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
    if (cruncher(trimmed, CruncherOptions.DEFAULT).length === 0) {
      words.push(trimmed);
    }
  };
  const debugRoot: string | undefined = envVar("DEBUG_OUT", "unsafe");
  const debugHelper = debugRoot === undefined ? undefined : { onWord };
  const result = processTei2(root, { patches, sideChannel: debugHelper });
  const debugName = result.info.title.replaceAll(" ", "_");
  const outputPath = debugRoot?.concat("/", debugName, ".debug.txt");
  if (outputPath !== undefined) {
    fs.writeFileSync(outputPath, words.sort().join("\n"));
  }
  return result;
}

export function processLibrary(
  outputDir: string = LIB_DEFAULT_DIR,
  works: string[] = LOCAL_REPO_WORK_PATHS
) {
  const patches = loadPatches();
  const index: LibraryIndex = {};
  for (const workPath of works) {
    // We should use the Perseus URN instead.
    const workId = path.basename(workPath).replace(/\.[^/.]+$/, "");
    const rawXml = parseRawXml(fs.readFileSync(workPath), {
      keepWhitespace: true,
    });
    const result = processTeiCts2(rawXml, patches.get(workId));
    const rawTitle = result.info.title;
    const title = NAME_TO_DISPLAY_NAME.get(rawTitle) ?? rawTitle;
    const metadata: LibraryWorkMetadata = {
      id: workId,
      author: result.info.author,
      name: title,
      urlAuthor: urlifyAuthor(result.info.author),
      urlName: urlifyName(result.info.title),
    };
    const encoded = stringifyMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = [outputPath, metadata];
    fs.writeFileSync(outputPath, encoded);
    console.log("Wrote processed file to %s", outputPath);
  }
  // TODO: We should verify here that there are no duplicates.
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}
