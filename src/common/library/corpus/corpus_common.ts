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
  isNumber,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export const CORPUS_DIR = "build/corpus";
export const CORPUS_FILE = `latin_corpus.json`;
export const CORPUS_RAW_TEXT = `latin_corpus_raw.txt`;

// // // // // // // // // //
// Corpus Querying Types   //
// // // // // // // // // //

export interface WordQuery {
  word: string;
}

export interface LemmaQuery {
  lemma: string;
}

export interface InflectionQuery {
  category: keyof LatinInflectionTypes;
  value: LatinInflectionTypes[keyof LatinInflectionTypes];
}

export type CorpusQueryAtom = WordQuery | LemmaQuery | InflectionQuery;

export interface ComposedQuery {
  composition: "and";
  atoms: CorpusQueryAtom[];
}

export interface GapSpec {
  maxDistance: number;
  directed: boolean;
}

export interface CorpusQueryPart {
  token: CorpusQueryAtom | ComposedQuery;
  gap?: GapSpec;
}

export interface CorpusQuery {
  parts: CorpusQueryPart[];
}

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
  text: string;
  leftContext?: string;
  rightContext?: string;
}

export namespace CorpusQueryMatch {
  export const isMatch = matchesObject<CorpusQueryMatch>({
    metadata: isCorpusQueryMatchMetadata,
    text: isString,
    leftContext: maybeUndefined(isString),
    rightContext: maybeUndefined(isString),
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
  /** The text of the work, optionally broken down into chunks. */
  rows: string[];
  /** IDs for each row in the work. */
  rowIds: string[][];
  /** The depth of leaf sections in the work. */
  sectionDepth: number;
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

export interface FilterOptions {
  /**
   * The offset to apply to the candidates before filtering.
   * For example, if the candidates are [1, 5] and the offset is 2, we
   * would check if the filter matches 3 and 7 to determine membership.
   */
  offset?: number;
  /**
   * By default, the filter will keep a candidate if the underlying index
   * contains that candidate. If this is set to true, the filter will remove
   * the candidate if the underlying index does not contain it.
   */
  keepMisses?: boolean;
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
  workLookup: [id: string, rowIds: string[][], workData: WorkData][];
  /** Ranges of token indices for each work in the corpus, split by row. */
  workRowRanges: WorkRowRange[];
  /** Statistics about the corpus. */
  stats: CorpusStats;
  /** The utf-8 encoded text of the full corpus. */
  rawTextPath: string;
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
    workRowRanges: [],
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
export interface PackedBitMask {
  format: "bitmask";
  data: Readonly<Uint32Array>;
  numSet?: number;
}
export type PackedIndexData = PackedNumbers | PackedBitMask;
