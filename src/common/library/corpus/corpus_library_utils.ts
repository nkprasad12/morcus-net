import { checkPresent } from "@/common/assert";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import {
  LIB_DEFAULT_DIR,
  LIBRARY_INDEX,
  type LibraryIndex,
} from "@/common/library/library_lookup";
import { ProcessedWork2 } from "@/common/library/library_types";
import type { XmlNode } from "@/common/xml/xml_node";

import fs from "fs";

export const LIB_CORPUS_INPUT_DIR = "build-tmp/library_corpus_input";

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

function readFilesFromLibraryIndex(inputDir: string): string[] {
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
    .map(([, metadata]) => `${inputDir}/${metadata.id}.json`);
}

export function saveAsCorpusInputWork(
  work: ProcessedWork2,
  outputDir: string
): void {
  if (work.info.isTranslation || SKIPS.has(work.info.workId)) {
    return;
  }
  const corpusWork = convertToCorpusInputWork(work);
  const outPath = `${outputDir}/${corpusWork.id}.json`;
  fs.writeFileSync(outPath, JSON.stringify(corpusWork), "utf8");
}

export function* latinWorksFromLibrary(
  inputDir: string = LIB_CORPUS_INPUT_DIR
): Generator<CorpusInputWork> {
  const filePaths = readFilesFromLibraryIndex(inputDir);
  for (const filePath of filePaths) {
    const work = JSON.parse(fs.readFileSync(filePath, "utf8"));
    yield work;
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
