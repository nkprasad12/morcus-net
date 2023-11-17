import { LibraryWorkMetadata } from "@/common/library/library_types";
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
  [workId: string]: [string, LibraryWorkMetadata];
}

export function processLibrary(
  outputDir: string = OUTPUT_DIR,
  works: string[] = ALL_WORKS
) {
  const index: LibraryIndex = {};
  for (const workPath of works) {
    // We should use the Perseus URN instead.
    const workId = workPath
      .split("/")
      .slice(-1)[0]
      .replace(/\.[^/.]+$/, "");
    const tei = parseTeiXml(workPath);
    const metadata: LibraryWorkMetadata = {
      id: workId,
      author: tei.info.author,
      name: tei.info.title,
    };
    const result = processTei(tei);
    const encoded = encodeMessage(result, [XmlNodeSerialization.DEFAULT]);
    const outputPath = `${outputDir}/${workId}`;
    index[workId] = [outputPath, metadata];
    fs.writeFileSync(outputPath, encoded);
  }
  fs.writeFileSync(`${outputDir}/${LIBRARY_INDEX}`, JSON.stringify(index));
}

const indices = new Map<string, Promise<LibraryIndex>>();

async function getIndex(resultDir: string = OUTPUT_DIR): Promise<LibraryIndex> {
  if (!indices.has(resultDir)) {
    indices.set(
      resultDir,
      readFile(`${resultDir}/${LIBRARY_INDEX}`).then((v) =>
        JSON.parse(v.toString())
      )
    );
  }
  return indices.get(resultDir)!;
}

export async function retrieveWorksList(
  resultDir: string = OUTPUT_DIR
): Promise<LibraryWorkMetadata[]> {
  const index = await getIndex(resultDir);
  return Object.values(index).map(([_k, v]) => v);
}

export async function retrieveWork(
  workId: string,
  resultDir: string = OUTPUT_DIR
): Promise<ProcessedWork> {
  const index = await getIndex(resultDir);
  const workPath = index[workId];
  const rawWork = await readFile(workPath[0]);
  return decodeMessage(rawWork.toString(), ProcessedWork.isMatch, [
    XmlNodeSerialization.DEFAULT,
  ]);
}
