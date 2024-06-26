export type ExtraType = "Enclitic" | "Prodelision";

export interface Lemma {
  /**
   * The unique ID for this lemma. This should usually equal the lemma but may
   * require a disambiguating mark if there are multiple lemmata with the same
   * lemma form.
   */
  id: string;
  /** The lemma form of this word. */
  lemma: string;
  /** The inflection paradigm for this word. */
  inflectionType: string;
  /** Tags on usage (such as genre or era) for this word. */
  usageNotes?: string[];
  /** Ids for lemmata that are considered orthographical variants of this lemma. */
  variants?: string[];
}

export enum LatinCase {
  Nominative = 1,
  Accusative = 2,
  Dative = 3,
  Genitive = 4,
  Ablative = 5,
  Vocative = 6,
  Locative = 7,
}

export enum LatinNumber {
  Singular = 1,
  Plural = 2,
}

export enum LatinGender {
  Masculine = 1,
  Feminine = 2,
  Neuter = 3,
  Adverbial = 4,
}

export enum LatinPerson {
  FIRST = 1,
  SECOND = 2,
  THIRD = 3,
}

export enum LatinMood {
  Indicative = 1,
  Imperative = 2,
  Subjunctive = 3,
  Participle = 4,
  Gerundive = 5,
  Infinitive = 6,
  Supine = 7,
}

export enum LatinVoice {
  Active = 1,
  Passive = 2,
}

export enum LatinTense {
  Present = 1,
  Imperfect = 2,
  Perfect = 3,
  FuturePerfect = 4,
  Future = 5,
  Pluperfect = 6,
}

export enum LatinDegree {
  Positive = 1,
  Comparative = 2,
  Superlative = 3,
}

export interface NounInflection {
  case: LatinCase;
  number: LatinNumber;
}

export interface AdjectiveInflection extends NounInflection {
  gender: LatinGender;
  degree: LatinDegree;
}

export interface VerbInflection {
  number: LatinNumber;
  person: LatinPerson;
  voice: LatinVoice;
  mood: LatinMood;
  tense: LatinTense;
}

export interface WordInflectionData {
  case?: LatinCase | LatinCase[];
  number?: LatinNumber | LatinNumber[];
  gender?: LatinGender | LatinGender[];
  person?: LatinPerson | LatinPerson[];
  voice?: LatinVoice | LatinVoice[];
  mood?: LatinMood | LatinMood[];
  tense?: LatinTense | LatinTense[];
  degree?: LatinDegree | LatinDegree[];
}

export interface Word {
  /** The lemma associated with this word. */
  lemma: Lemma;
  /** The inflection data for this word. */
  inflection:
    | NounInflection
    | AdjectiveInflection
    | VerbInflection
    | "Indeclinable";
}

export interface TokenAnalysis {
  /** The main word for this token. */
  word: Word;
  /** Any extra words part of the token, such as enclitics or prodelision. */
  extras?: {
    word: Word;
    extraType: ExtraType;
  }[];
}

export type DiacriticMode = "Exact" | "InflectionOnly" | "Ignore";

export interface AnalyzerOptions {
  diacriticMode?: DiacriticMode;
}

export type Analyzer = (
  tokens: string[],
  options?: AnalyzerOptions
) => TokenAnalysis[][];
