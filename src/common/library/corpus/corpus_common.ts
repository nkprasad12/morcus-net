import { deserializeWithMaps, serializeWithMaps } from "@/common/misc_utils";
import fs from "fs";

const CORPUS_DIR = "build/corpus";
export const CORPUS_FILE = `${CORPUS_DIR}/latin_corpus.json`;

/** Defines a work that the corpus can consume. */
export interface CorpusInputWork {
  /** The unique ID of the work. */
  id: string;
  /** The text of the work, optionally broken down into chunks. */
  rows: string[];
  /** IDs for each row in the work. */
  rowIds: string[];
}

export type WorkRowRange = [
  /** Index of the work in the corpus. */
  workIdx: number,
  /**
   * Ranges of token indices for each row in the work.
   * The startTokenId is inclusive, and the endTokenId is exclusive.
   */
  rowData: [rowIdx: number, startTokenId: number, endTokenId: number][]
];
export interface CorpusStats {
  totalWords: number;
  totalWorks: number;
  uniqueWords: number;
  uniqueLemmata: number;
}
export interface LatinCorpusIndex {
  /** Data about each work in the corpus. */
  workLookup: [id: string, rowIds: string[]][];
  /** Ranges of token indices for each work in the corpus, split by row. */
  workRowRanges: WorkRowRange[];
  indices: {
    /** Reverse index mapping normalized words to their token IDs. */
    word: Map<string, number[]>;
    /** Reverse index mapping lemmata to their token IDs. */
    lemma: Map<string, number[]>;
  };
  /** Statistics about the corpus. */
  stats: CorpusStats;
}

export function writeCorpusToFile(
  corpus: LatinCorpusIndex,
  corpusFile: string = CORPUS_FILE
) {
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }
  fs.writeFileSync(corpusFile, serializeWithMaps(corpus));
  console.debug(`Corpus written to ${corpusFile}`);
}

export function loadCorpus(corpusFile: string = CORPUS_FILE): LatinCorpusIndex {
  const raw = fs.readFileSync(corpusFile, "utf8");
  return deserializeWithMaps(raw);
}
