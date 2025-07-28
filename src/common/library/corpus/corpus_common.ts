import { deserializeWithMaps, serializeWithMaps } from "@/common/misc_utils";
import {
  LatinCase,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";
import fs from "fs";

const CORPUS_DIR = "build/corpus";
export const CORPUS_FILE = `${CORPUS_DIR}/latin_corpus.json`;

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
  /** Reverse indices for various corpus features. */
  indices: {
    /** Reverse index mapping normalized words to their token IDs. */
    word: Map<string, number[]>;
    /** Reverse index mapping lemmata to their token IDs. */
    lemma: Map<string, number[]>;
    /** Reverse index mapping cases to their token IDs. */
    case: Map<LatinCase, number[]>;
    /** Reverse index mapping numbers to their token IDs. */
    number: Map<LatinNumber, number[]>;
    /** Reverse index mapping genders to their token IDs. */
    gender: Map<LatinGender, number[]>;
    /** Reverse index mapping tenses to their token IDs. */
    tense: Map<LatinTense, number[]>;
    /** Reverse index mapping persons to their token IDs. */
    person: Map<LatinPerson, number[]>;
    /** Reverse index mapping moods to their token IDs. */
    mood: Map<LatinMood, number[]>;
    /** Reverse index mapping voices to their token IDs. */
    voice: Map<LatinVoice, number[]>;
  };
  /** Statistics about the corpus. */
  stats: CorpusStats;
}

export function createEmptyCorpusIndex(): LatinCorpusIndex {
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
    stats: {
      totalWords: 0,
      totalWorks: 0,
      uniqueWords: 0,
      uniqueLemmata: 0,
    },
  };
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
