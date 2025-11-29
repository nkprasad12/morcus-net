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
export const CORPUS_INFLECTIONS_RAW_DATA =
  "latin_corpus_inflections_raw_data.bin";
export const CORPUS_INFLECTIONS_OFFSETS =
  "latin_corpus_inflections_offsets.bin";
export const CORPUS_SUGGESTION_PREFIX = "latin_corpus_suggestions";
export const CORPUS_AUTHORS_LIST = `${CORPUS_SUGGESTION_PREFIX}_authors.json`;
export const CORPUS_LEMMATA_LIST = `${CORPUS_SUGGESTION_PREFIX}_lemmata.json`;

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

export interface PageData {
  resultIndex: number;
  resultId: number;
  candidateIndex: number;
}

export const isPageData = matchesObject<PageData>({
  resultIndex: isNumber,
  resultId: isNumber,
  candidateIndex: isNumber,
});

export interface QueryGlobalInfo {
  estimatedResults: number;
}

const isQueryGlobalInfo = matchesObject<QueryGlobalInfo>({
  estimatedResults: isNumber,
});

// Replaced: CorpusQueryResult now matches Rust shape (omitting timing)
export interface CorpusQueryResult {
  matches: CorpusQueryMatch[];
  resultStats: QueryGlobalInfo;
  nextPage?: PageData;
}

export namespace CorpusQueryResult {
  export const isMatch = matchesObject<CorpusQueryResult>({
    matches: isArray(CorpusQueryMatch.isMatch),
    resultStats: isQueryGlobalInfo,
    // nextPage is optional: allow undefined or a valid PageData
    nextPage: (v: unknown) => v === undefined || isPageData(v),
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
export interface CorpusStringKeyIndexTypes {
  word: string;
  lemma: string;
  breaks: "hard";
}
export interface CorpusIndexKeyTypes
  extends LatinInflectionTypes,
    CorpusStringKeyIndexTypes {}

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
  /** The encoded inflection options for each word in the corpus. */
  inflectionsRawBufferPath: string;
  /** The offsets for the encoded inflection options for each word in the corpus. */
  inflectionsOffsetsPath: string;
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
    [K in keyof CorpusIndexKeyTypes]: number[][];
  };
  idTable: {
    [K in keyof CorpusStringKeyIndexTypes]: Map<string, number>;
  };
  numTokens: number;
};

export function createEmptyCorpusIndex(): InProgressLatinCorpus {
  return {
    workLookup: [],
    authorLookup: {},
    rawBufferPath: CORPUS_BUFFERS,
    rawTextPath: CORPUS_RAW_TEXT,
    inflectionsRawBufferPath: CORPUS_INFLECTIONS_RAW_DATA,
    inflectionsOffsetsPath: CORPUS_INFLECTIONS_OFFSETS,
    tokenStarts: [],
    breakStarts: [],
    indices: {
      word: [],
      breaks: [],
      lemma: [],
      case: [],
      number: [],
      gender: [],
      tense: [],
      person: [],
      mood: [],
      voice: [],
    },
    idTable: {
      word: new Map(),
      breaks: new Map(),
      lemma: new Map(),
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
