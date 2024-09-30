import type {
  InflectionContext,
  InflectionEnding,
} from "@/morceus/inflection_data_utils";
import type { IrregularForm, Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndsResult, InflectionLookup } from "@/morceus/tables/indices";

export interface CrunchResult extends InflectionContext {
  lemma: string;
  form: string;
  stem?: Stem;
  end?: InflectionEnding;
  relaxedCase?: true;
  relaxedVowelLengths?: true;
  isVerb?: boolean;
}

export interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: CrunchResult[];
  }[];
}

// key => [Stem / Form, lemma, isVerb]
export type StemMap = Map<string, [Stem | IrregularForm, string, boolean][]>;

export interface CruncherTables {
  endsMap: Map<string, string[]>;
  stemMap: StemMap;
  inflectionLookup: InflectionLookup;
}

export interface CruncherOptions {
  vowelLength?: "strict" | "relaxed";
  relaxCase?: boolean;
  relaxUandV?: boolean;
  relaxIandJ?: boolean;
}

export namespace CruncherOptions {
  export const DEFAULT: CruncherOptions = {
    vowelLength: "relaxed",
    relaxCase: true,
    relaxIandJ: true,
    relaxUandV: true,
  };
}

export type Cruncher = (
  word: string,
  options?: CruncherOptions
) => LatinWordAnalysis[];

export interface CruncherConfig {
  existing?: {
    endsResult: EndsResult;
    lemmata: Lemma[];
  };
  generate?: {
    nomStemFiles: string[];
    verbStemFiles: string[];
  };
}