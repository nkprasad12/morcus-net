import type {
  InflectionContext,
  InflectionEnding,
} from "@/morceus/inflection_data_utils";
import type { IrregularForm, Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndsResult, InflectionLookup } from "@/morceus/tables/indices";
import type { InflectionTable } from "@/morceus/tables/templates";

export interface CrunchResult extends InflectionContext {
  lemma: string;
  form: string;
  stem?: Stem;
  end?: InflectionEnding;
  relaxedCase?: true;
  relaxedVowelLengths?: true;
  enclitic?: string;
  isVerb?: boolean;
}

export interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: CrunchResult[];
  }[];
}

// [Stem / Form, lemma, isVerb]
export type StemMapValue = [Stem | IrregularForm, string, boolean];
export type StemMap = Map<string, StemMapValue[]>;

export interface CruncherTables {
  endsMap: Map<string, string[]>;
  stemMap: StemMap;
  inflectionLookup: InflectionLookup;
  numerals: Lemma[];
  rawTables: Map<string, InflectionTable>;
  rawLemmata: Map<string, Lemma[]>;
}

export interface CruncherOptions {
  vowelLength?: "strict" | "relaxed";
  relaxCase?: boolean;
  relaxUandV?: boolean;
  relaxIandJ?: boolean;
  handleEnclitics?: boolean;
}

export namespace CruncherOptions {
  export const DEFAULT: CruncherOptions = {
    vowelLength: "relaxed",
    relaxCase: true,
    relaxIandJ: true,
    relaxUandV: true,
    handleEnclitics: true,
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
