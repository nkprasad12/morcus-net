import {
  LatinCase,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";

export const CORPUS_DIR = "build/corpus";
export const CORPUS_FILE = `${CORPUS_DIR}/latin_corpus.json`;

// // // // // // // // // //
// Corpus Querying Types   //
// // // // // // // // // //

export interface WordQuery {
  word: string;
}

export interface LemmaQuery {
  lemma: string;
}

export type CorpusQueryPart = WordQuery | LemmaQuery;

export interface CorpusQuery {
  parts: CorpusQueryPart[];
}

export interface CorpusQueryResult {
  workId: string;
  section: string;
  offset: number;
}

// // // // // // // // // //
// Corpus Interface Types  //
// // // // // // // // // //

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

export interface GenericReverseIndex<T> {
  formatOf(key: T): "bitmask" | undefined;
  get(key: T): number[] | undefined;
  keys(): Iterable<T>;
}
export type CorpusIndexKeyTypes = {
  word: string;
  lemma: string;
  case: LatinCase;
  number: LatinNumber;
  gender: LatinGender;
  tense: LatinTense;
  person: LatinPerson;
  mood: LatinMood;
  voice: LatinVoice;
};
interface CoreCorpusIndex {
  /** Data about each work in the corpus. */
  workLookup: [id: string, rowIds: string[]][];
  /** Ranges of token indices for each work in the corpus, split by row. */
  workRowRanges: WorkRowRange[];
  /** Statistics about the corpus. */
  stats: CorpusStats;
}

export interface LatinCorpusIndex extends CoreCorpusIndex {
  indices: {
    [K in keyof CorpusIndexKeyTypes]: GenericReverseIndex<
      CorpusIndexKeyTypes[K]
    >;
  };
}

export type InProgressLatinCorpus = CoreCorpusIndex & {
  indices: {
    [K in keyof CorpusIndexKeyTypes]: Map<CorpusIndexKeyTypes[K], number[]>;
  };
  /** The maximum token ID. */
  maxTokenId: number;
};

export function createEmptyCorpusIndex(): InProgressLatinCorpus {
  return {
    workLookup: [],
    workRowRanges: [],
    indices: {
      word: new Map(),
      lemma: new Map(),
      case: new Map(),
      number: new Map(),
      gender: new Map(),
      tense: new Map(),
      person: new Map(),
      mood: new Map(),
      voice: new Map(),
    },
    maxTokenId: -1,
    stats: {
      totalWords: 0,
      totalWorks: 0,
      uniqueWords: 0,
      uniqueLemmata: 0,
    },
  };
}

// // // // // // // // // // //
// Corpus Serialization Types //
// // // // // // // // // // //

export type PackedNumbers = Uint8Array;
export interface PackedBitMask {
  format: "bitmask";
  data: Uint8Array;
}
export type PackedIndexData = PackedNumbers | PackedBitMask;
