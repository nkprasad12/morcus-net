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

export type LatinCase =
  | "Nominative"
  | "Accusative"
  | "Dative"
  | "Genitive"
  | "Ablative"
  | "Vocative"
  | "Locative";

export type LatinNumber = "Singular" | "Plural";

export type LatinGender = "Masculine" | "Feminine" | "Neuter";

export type LatinPerson = "1st" | "2nd" | "3rd";

export type LatinMood = "Indicative | Imperative | Subjunctive";

export type LatinVoice = "Active" | "Passive";

export type LatinTense =
  | "Present"
  | "Imperfect"
  | "Perfect"
  | "Future Perfect"
  | "Future"
  | "Pluperfect";

export interface NounInflection {
  case: LatinCase;
  number: LatinNumber;
}

export interface AdjectiveInflection extends NounInflection {
  gender: LatinCase;
}

export interface VerbInflection {
  number: LatinNumber;
  person: LatinPerson;
  voice: LatinVoice;
  mood: LatinMood;
  tense: LatinTense;
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
  token: string,
  options?: AnalyzerOptions
) => TokenAnalysis[];
