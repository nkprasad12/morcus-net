/**
 * The macronizer's result types. Dependency-free so browser-bound UI V2
 * modules (`*.common.ts`) can share them with the server.
 */

export interface FormOptions {
  lemma: string;
  morph: string[];
}

export type MacronizedConfidence = "weak" | "tied" | "confident";

export interface MacronizedWord {
  /**
   * The input word with diacritics removed (format characters such as soft
   * hyphens are kept). For a word with no `options`, it's the word exactly as
   * typed, so macrons the user typed on an unknown word survive.
   */
  word: string;
  options: {
    form: string;
    kind?: "numeral";
    options: FormOptions[];
  }[];
  /** Index into `options` of the POS tagger's pick, if any. */
  suggested?: number;
  /** Present exactly when `suggested` is. */
  confidence?: MacronizedConfidence;
}

export type MacronizedResult = (MacronizedWord | string)[];
