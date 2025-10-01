import { checkPresent } from "@/common/assert";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import {
  LIB_DEFAULT_DIR,
  LIBRARY_INDEX,
  type LibraryIndex,
} from "@/common/library/library_lookup";
import { ProcessedWork2 } from "@/common/library/library_types";
import type { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import { ServerMessage } from "@/web/utils/rpc/rpc";

import fs from "fs";
import { gunzipSync } from "zlib";

// This is a duplicate of Heroides, which we have the macronized edition of.
const SKIPS = new Set(["phi0959.phi002.perseus-lat2"]);

const AUTHOR_CODE_MAP = new Map<string, string>([
  ["Julius Caesar", "Caesar"],
  ["P. Ovidius Naso", "Ovid"],
  ["Cornelius Tacitus", "Tacitus"],
  ["C. Valerius Catullus", "Catullus"],
  ["M. Tullius Cicero", "Cicero"],
  ["Ammianus Marcellinus", "Ammianius"],
  ["Calpurnius Siculus", "Calpurnius"],
  ["Cornelius Nepos", "Nepos"],
  ["Minucius Felix", "Minucius"],
]);

function toAuthorCode(author: string): string {
  if (author.split(" ").length === 1) {
    return author;
  }
  return checkPresent(
    AUTHOR_CODE_MAP.get(author),
    "No code for author " + author
  );
}

function extractRowText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children.map(extractRowText).join("");
}

function convertToCorpusInputWork(work: ProcessedWork2): CorpusInputWork {
  return {
    id: work.info.workId,
    workName: work.info.title,
    author: work.info.author,
    authorCode: toAuthorCode(work.info.author),
    rows: work.rows.map(([_, root]) => extractRowText(root)),
    rowIds: work.rows.map(([id]) => id),
    sectionDepth: work.textParts.length,
  };
}

function readFilesFromLibraryIndex(): string[] {
  const indexPath = `${LIB_DEFAULT_DIR}/${LIBRARY_INDEX}`;
  const rawContent = fs.readFileSync(indexPath, "utf8");
  const libraryIndex: LibraryIndex = JSON.parse(rawContent);
  return Object.values(libraryIndex)
    .filter(
      ([, metadata]) =>
        metadata.isTranslation !== true && !SKIPS.has(metadata.id)
    )
    .sort(
      (a, b) =>
        toAuthorCode(a[1].author).localeCompare(toAuthorCode(b[1].author)) ||
        a[1].name.localeCompare(b[1].name)
    )
    .map(([path]) => path);
}

function* latinWorksInFiles(filePaths: string[]): Generator<ProcessedWork2> {
  const validator = ServerMessage.validator(ProcessedWork2.isMatch);
  const registry = [XmlNodeSerialization.DEFAULT];
  for (const workPath of filePaths) {
    const compressed = fs.readFileSync(workPath);
    const raw = gunzipSync(compressed).toString();
    yield decodeMessage(raw, validator, registry).data;
  }
}

export function* latinWorksFromLibrary(): Generator<CorpusInputWork> {
  const filePaths = readFilesFromLibraryIndex();
  for (const work of latinWorksInFiles(filePaths)) {
    yield convertToCorpusInputWork(work);
    if (process.env.SIMULATE_LARGE_CORPUS === "1") {
      const converted = convertToCorpusInputWork(work);
      for (let i = 0; i < 10; i++) {
        yield {
          ...converted,
          id: `${converted.id}-${i + 1}`,
        };
      }
    }
  }
}
