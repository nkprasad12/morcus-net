import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import {
  LIB_DEFAULT_DIR,
  LIBRARY_INDEX,
  type LibraryIndex,
} from "@/common/library/library_lookup";
import { ProcessedWork2 } from "@/common/library/library_types";
import type { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseMessage } from "@/web/utils/rpc/parsing";

import fs from "fs";

function extractRowText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children.map(extractRowText).join("");
}

function convertToCorpusInputWork(work: ProcessedWork2): CorpusInputWork {
  return {
    id: work.info.workId,
    rows: work.rows.map(([, content]) => extractRowText(content)),
  };
}

function readFilesFromLibraryIndex(): string[] {
  const indexPath = `${LIB_DEFAULT_DIR}/${LIBRARY_INDEX}`;
  const rawContent = fs.readFileSync(indexPath, "utf8");
  const libraryIndex: LibraryIndex = JSON.parse(rawContent);
  return Object.values(libraryIndex).map(([path]) => path);
}

function* latinWorksInFiles(filePaths: string[]): Generator<ProcessedWork2> {
  for (const workPath of filePaths) {
    const work = parseMessage(
      fs.readFileSync(workPath, "utf8"),
      ProcessedWork2.isMatch,
      [XmlNodeSerialization.DEFAULT]
    );
    if (work.info.isTranslation) {
      continue;
    }
    yield work;
  }
}

export function* latinWorksFromLibrary(): Generator<CorpusInputWork> {
  const filePaths = readFilesFromLibraryIndex();
  for (const work of latinWorksInFiles(filePaths)) {
    yield convertToCorpusInputWork(work);
  }
}
