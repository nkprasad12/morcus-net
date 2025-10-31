import {
  LatinCase,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";
import {
  isArray,
  isBoolean,
  isNumber,
  isPair,
  isString,
  matchesObject,
} from "@/web/utils/rpc/parsing";

export const CORPUS_DIR = "build/corpus";
export const CORPUS_FILE = `latin_corpus.json`;
export const CORPUS_RAW_TEXT = `latin_corpus_raw.txt`;
export const CORPUS_BUFFERS = `latin_corpus_buffers.bin`;
export const CORPUS_TOKEN_STARTS = `latin_corpus_token_starts.bin`;

export const CORPUS_AUTHORS_LIST = "latin_corpus_authors.json";

// // // // // // // // // //
// Corpus Result Types   //
// // // // // // // // // //

export interface CorpusQueryMatchMetadata {
  workId: string;
  workName: string;
  author: string;
  section: string;
  offset: number;
}

const isCorpusQueryMatchMetadata = matchesObject<CorpusQueryMatchMetadata>({
  workId: isString,
  workName: isString,
  author: isString,
  section: isString,
  offset: isNumber,
});

export interface CorpusQueryMatch {
  metadata: CorpusQueryMatchMetadata;
  text: [content: string, isMatchText: boolean][];
}

export namespace CorpusQueryMatch {
  export const isMatch = matchesObject<CorpusQueryMatch>({
    metadata: isCorpusQueryMatchMetadata,
    text: isArray(isPair(isString, isBoolean)),
  });
}

export interface CorpusQueryResult {
  totalResults: number;
  matches: CorpusQueryMatch[];
  pageStart: number;
}

export namespace CorpusQueryResult {
  export const isMatch = matchesObject<CorpusQueryResult>({
    totalResults: isNumber,
    matches: isArray(CorpusQueryMatch.isMatch),
    pageStart: isNumber,
  });
}

// // // // // // // // // //
// Corpus Interface Types  //
// // // // // // // // // //

/** Defines a work that the corpus can consume. */
export interface CorpusInputWork {
  /** The unique ID of the work. */
  id: string;
  /** The name of the work. */
  workName: string;
  /** The author of the work. */
  author: string;
  /** A short and single-word code for the author. */
  authorCode: string;
  /** The text of the work, optionally broken down into chunks. */
  rows: string[];
  /** IDs for each row in the work. */
  rowIds: string[][];
  /** The depth of leaf sections in the work. */
  sectionDepth: number;
}

export interface CorpusStats {
  totalWords: number;
  totalWorks: number;
  uniqueWords: number;
  uniqueLemmata: number;
}

export interface LatinInflectionTypes {
  case: LatinCase;
  number: LatinNumber;
  gender: LatinGender;
  tense: LatinTense;
  person: LatinPerson;
  mood: LatinMood;
  voice: LatinVoice;
}
export interface CorpusIndexKeyTypes extends LatinInflectionTypes {
  word: string;
  lemma: string;
  breaks: "hard";
}

interface WorkData {
  author: string;
  name: string;
}

interface CoreCorpusIndex {
  /** Data about each work in the corpus. */
  workLookup: [
    id: string,
    rowData: [rowId: string, startTokenId: number, endTokenId: number][],
    workData: WorkData
  ][];
  /** Maps author names to their ranges in the `workLookup` array. */
  authorLookup: Record<string, [startIdx: number, endIdx: number]>;
  /** Statistics about the corpus. */
  stats: CorpusStats;
  /** The utf-8 encoded text of the full corpus. */
  rawTextPath: string;
  /** The binary buffers for the corpus (e.g., packed indices). */
  rawBufferPath: string;
  /** The start indices of each token in the raw text. */
  tokenStarts: number[];
  /** The start indices of each break in the raw text. */
  breakStarts: number[];
}

export interface LatinCorpusIndex extends CoreCorpusIndex {
  indices: {
    [K in keyof CorpusIndexKeyTypes]: Map<
      CorpusIndexKeyTypes[K],
      PackedIndexData
    >;
  };
}

export type InProgressLatinCorpus = CoreCorpusIndex & {
  indices: {
    [K in keyof CorpusIndexKeyTypes]: Map<CorpusIndexKeyTypes[K], number[]>;
  };
  numTokens: number;
};

export function createEmptyCorpusIndex(): InProgressLatinCorpus {
  return {
    workLookup: [],
    authorLookup: {},
    rawBufferPath: CORPUS_BUFFERS,
    rawTextPath: CORPUS_RAW_TEXT,
    tokenStarts: [],
    breakStarts: [],
    indices: {
      word: new Map(),
      breaks: new Map(),
      lemma: new Map(),
      case: new Map(),
      number: new Map(),
      gender: new Map(),
      tense: new Map(),
      person: new Map(),
      mood: new Map(),
      voice: new Map(),
    },
    numTokens: 0,
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

export type PackedNumbers = Readonly<Uint8Array>;
export interface BitMask {
  format: "bitmask";
  data: Readonly<Uint32Array>;
  numSet?: number;
}
export type PackedIndexData = PackedNumbers | BitMask;
