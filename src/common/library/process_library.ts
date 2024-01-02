import {
  LIBRARY_INDEX,
  LIB_DEFAULT_DIR,
  LibraryIndex,
} from "@/common/library/library_lookup";
import { LibraryWorkMetadata } from "@/common/library/library_types";
import { processTei } from "@/common/library/process_work";
import { parseCtsTeiXml } from "@/common/xml/tei_utils";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseRawXml } from "@/common/xml/xml_utils";
import { stringifyMessage } from "@/web/utils/rpc/parsing";
import fs from "fs";

// TODO: We should just crawl some root.
const ALL_WORKS = [
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml",
  "texts/latin/perseus/data/phi0975/phi001/phi0975.phi001.perseus-lat2.xml",
];

const AUTHOR_TO_URL_LOOKUP = new Map<string, string>([
  ["Julius Caesar", "caesar"],
]);

const NAME_TO_URL_LOOKUP = new Map<string, string>();

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
    const metadata: LibraryWorkMetadata = {
      id: workId,
      author: tei.info.author,
      name: tei.info.title,
      urlAuthor: urlifyAuthor(tei.info.author),
      urlName: urlifyName(tei.info.title),
    };
    const result = processTei(tei);
    const encoded = stringifyMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = [outputPath, metadata];
    fs.writeFileSync(outputPath, encoded);
    console.log("Wrote processed file to %s", outputPath);
  }
  // TODO: We should verify here that there are no duplicates.
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}
