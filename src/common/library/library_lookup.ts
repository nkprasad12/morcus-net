import {
  LibraryWorkMetadata,
  ProcessedWork,
} from "@/common/library/library_types";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseMessage } from "@/web/utils/rpc/parsing";
import { readFile } from "fs/promises";

export const LIB_DEFAULT_DIR = "library_processed";
export const LIBRARY_INDEX = "morcus_library_index.json";

export interface LibraryIndex {
  [workId: string]: [string, LibraryWorkMetadata];
}

const indices = new Map<string, Promise<LibraryIndex>>();

async function getIndex(
  resultDir: string = LIB_DEFAULT_DIR
): Promise<LibraryIndex> {
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
  resultDir: string = LIB_DEFAULT_DIR
): Promise<LibraryWorkMetadata[]> {
  const index = await getIndex(resultDir);
  return Object.values(index).map(([_k, v]) => v);
}

export async function retrieveWorkStringified(
  workId: string,
  resultDir: string = LIB_DEFAULT_DIR
): Promise<string> {
  const index = await getIndex(resultDir);
  const workPath = index[workId];
  if (workPath === undefined) {
    return Promise.reject({ status: 404, message: `Invalid id: ${workId}` });
  }
  return (await readFile(workPath[0])).toString();
}

export async function retrieveWork(
  workId: string,
  resultDir: string = LIB_DEFAULT_DIR
): Promise<ProcessedWork> {
  return parseMessage(
    await retrieveWorkStringified(workId, resultDir),
    ProcessedWork.isMatch,
    [XmlNodeSerialization.DEFAULT]
  );
}
