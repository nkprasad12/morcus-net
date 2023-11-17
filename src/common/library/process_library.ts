import { ProcessedWork, processTei } from "@/common/library/process_work";
import { parseTeiXml } from "@/common/xml/xml_files";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage, encodeMessage } from "@/web/utils/rpc/parsing";
import fs from "fs";
import { readFile } from "fs/promises";

const OUTPUT_DIR = "library_processed";
const LIBRARY_INDEX = "morcus_library_index.json";
// TODO: We should just crawl some root.
const ALL_WORKS = [
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml",
];

interface LibraryIndex {
  [workId: string]: string;
}

export function processLibrary(
  outputDir: string = OUTPUT_DIR,
  works: string[] = ALL_WORKS
) {
  const index: LibraryIndex = {};
  for (const workPath of works) {
    const result = processTei(parseTeiXml(workPath));
    // We should use the Perseus URN instead.
    const workId = workPath
      .split("/")
      .slice(-1)[0]
      .replace(/\.[^/.]+$/, "");
    const encoded = encodeMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = outputPath;
    fs.writeFileSync(outputPath, encoded);
  }
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}

const indices = new Map<string, Promise<LibraryIndex>>();

export async function retrieveWork(
  workId: string,
  resultDir: string = OUTPUT_DIR
): Promise<ProcessedWork> {
  if (!indices.has(resultDir)) {
    indices.set(
      resultDir,
      readFile(`${resultDir}/${LIBRARY_INDEX}`).then((v) =>
        JSON.parse(v.toString())
      )
    );
  }
  const index = await indices.get(resultDir)!;
  const workPath = index[workId];
  const rawWork = await readFile(workPath);
  return decodeMessage(rawWork.toString(), ProcessedWork.isMatch, [
    XmlNodeSerialization.DEFAULT,
  ]);
}
