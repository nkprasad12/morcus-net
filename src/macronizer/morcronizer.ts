import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  stripDiacritics,
  type DiacriticStripped,
} from "@/common/text_cleaning";
import {
  latincyAnalysis,
  stanzaAnalysis,
  type LatinToken,
} from "@/latincy/latincy_client";
import { type CrunchResult } from "@/morceus/cruncher_types";
import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";
import {
  compareGrammaticalData,
  convertUpos,
  isWordInflectionDataNonEmpty,
  wordInflectionDataToArray,
} from "@/morceus/inflection_data_utils";
import type { WordInflectionData } from "@/morceus/types";
import { preprocessText, type TokenResult } from "@/nlp/text_tokenization";
import type {
  MacronizedConfidence,
  MacronizedResult,
  MacronizedWord,
  FormOptions,
} from "@/macronizer/macronizer_types";

const INPUT_MAX_LENGTH = 20000;

/** Classical praenomen abbreviations that precede a period. */
const PRAENOMEN_ABBREVS = new Set([
  "a",
  "c",
  "cn",
  "d",
  "l",
  "m",
  "m'",
  "p",
  "q",
  "ser",
  "sex",
  "sp",
  "t",
  "ti",
]);

const SINGLE_LETTER_RE = /^\p{L}$/u;

export type Tagger = (
  words: string[],
  spaces: boolean[]
) => Promise<LatinToken[]>;

type InternalFormOptions = Omit<FormOptions, "morph"> & {
  morph: WordInflectionData[];
};

interface OptionsForForm {
  form: string;
  kind?: "numeral";
  options: InternalFormOptions[];
}

interface AnalyzedToken {
  raw: TokenResult;
  optionsByForm: OptionsForForm[];
}

export interface MorceusAnalysis {
  tokens: (string | AnalyzedToken)[];
  words: string[];
  spaces: boolean[];
}

function convertOptionsForForm(
  options: OptionsForForm[]
): MacronizedWord["options"] {
  return options.map((option) => {
    const out: MacronizedWord["options"][number] = {
      form: option.form,
      options: option.options.map((o) => ({
        lemma: o.lemma,
        morph: o.morph.map((m) => wordInflectionDataToArray(m).join(" ")),
      })),
    };
    if (option.kind !== undefined) {
      out.kind = option.kind;
    }
    return out;
  });
}

function sortByLemma(results: CrunchResult[]): InternalFormOptions[] {
  const byLemma = arrayMap<string, CrunchResult>();
  for (const result of results) {
    byLemma.add(result.lemma, result);
  }
  const options: InternalFormOptions[] = [];
  for (const [lemma, results] of byLemma.map) {
    options.push({
      lemma,
      morph: results.map((r) => r.grammaticalData),
    });
  }
  return options;
}

function formDisplayText(crunched: CrunchResult, strippedWord: string): string {
  const baseForm = crunched.form + (crunched.enclitic ?? "");
  const longsOnly = baseForm.replaceAll(/[+^-]/g, "");
  const formChunks = longsOnly.split("_");
  const formLen = formChunks.reduce((acc, c) => acc + c.length, 0);
  assertEqual(formLen, strippedWord.length);

  let i = 0;
  const resultChunks: string[] = [];
  for (const formChunk of formChunks) {
    const wordChunk = strippedWord.substring(i, i + formChunk.length);
    resultChunks.push(wordChunk);
    i += formChunk.length;
  }

  return resultChunks.join("\u0304");
}

function sortCrunchResults(
  crunchResults: CrunchResult[],
  strippedWord: string
): OptionsForForm[] {
  const byForm = arrayMap<string, CrunchResult>();
  for (const crunched of crunchResults) {
    byForm.add(formDisplayText(crunched, strippedWord), crunched);
  }
  const options: OptionsForForm[] = [];
  for (const [form, results] of byForm.map) {
    options.push({
      form,
      options: sortByLemma(results),
    });
  }
  return options;
}

function safeConvertUpos(morph: string): WordInflectionData | undefined {
  try {
    return convertUpos(morph);
  } catch {
    return undefined;
  }
}

interface BestMatch {
  index: number;
  confidence: MacronizedConfidence;
}

function findBestMatch(
  crunched: OptionsForForm[],
  nlp: LatinToken
): BestMatch | undefined {
  const nlpInflection = safeConvertUpos(nlp[2]);
  if (nlpInflection === undefined) {
    return undefined;
  }

  // Pass 1: same lemma and a compatible morph (subset or superset). An empty
  // tagger morph (LatinCy gives none for ADV, CCONJ, ...) is compatible with
  // everything, so this pass is then lemma-only; that's where most "tied"
  // results come from.
  const pass1FormIndices: number[] = [];
  for (let i = 0; i < crunched.length; i++) {
    if (crunched[i].kind === "numeral") {
      continue;
    }
    const options = crunched[i].options;
    let formMatched = false;
    for (const option of options) {
      const lemma = option.lemma.split("#")[0];
      if (lemma !== nlp[1]) {
        continue;
      }
      for (const morph of option.morph) {
        const comparison = compareGrammaticalData(nlpInflection, morph);
        if (comparison !== undefined) {
          formMatched = true;
          break;
        }
      }
      if (formMatched) {
        break;
      }
    }
    if (formMatched) {
      pass1FormIndices.push(i);
    }
  }

  if (pass1FormIndices.length === 1) {
    return { index: pass1FormIndices[0], confidence: "confident" };
  }
  if (pass1FormIndices.length > 1) {
    return { index: pass1FormIndices[0], confidence: "tied" };
  }

  if (!isWordInflectionDataNonEmpty(nlpInflection)) {
    return undefined;
  }

  for (let i = 0; i < crunched.length; i++) {
    if (crunched[i].kind === "numeral") {
      continue;
    }
    const options = crunched[i].options;
    for (const option of options) {
      for (const morph of option.morph) {
        const comparison = compareGrammaticalData(nlpInflection, morph);
        if (comparison === 0) {
          return { index: i, confidence: "weak" };
        }
      }
    }
  }
  return undefined;
}

function vowelsMatches(
  stripped: DiacriticStripped,
  longs: Set<number>,
  shorts: Set<number>
): number {
  let longMatches = 0;
  for (let i = 0; i < (stripped.diacritics?.length ?? 0); i++) {
    const c = checkPresent(stripped?.diacritics?.[i]);
    const p = checkPresent(stripped?.positions?.[i]);
    const isLong = c === "\u0304";
    if (isLong && shorts.has(p)) {
      return -1;
    }
    if (c === "\u0306" && longs.has(p)) {
      return -1;
    }
    if (isLong && longs.has(p)) {
      longMatches++;
    }
  }
  return longMatches;
}

function isAllCapsLetters(word: string): boolean {
  return (
    word.length > 0 &&
    word === word.toUpperCase() &&
    word !== word.toLowerCase()
  );
}

function isAbbreviationBeforePeriod(
  word: string,
  nextToken: string | TokenResult | undefined
): boolean {
  if (typeof nextToken !== "string") {
    return false;
  }
  const lower = word.toLowerCase();
  if (nextToken.startsWith(".")) {
    return SINGLE_LETTER_RE.test(word) || PRAENOMEN_ABBREVS.has(lower);
  }
  if (lower === "m" && nextToken.startsWith("'.")) {
    return true;
  }
  return false;
}

function buildOptionsForToken(raw: TokenResult): OptionsForForm[] {
  const diacritics = raw.diacritics ?? [];
  const positions = raw.positions ?? [];
  const long = new Set<number>();
  const short = new Set<number>();
  for (let i = 0; i < diacritics.length; i++) {
    if (diacritics[i] === "\u0304") {
      long.add(positions[i]);
    } else if (diacritics[i] === "\u0306") {
      short.add(positions[i]);
    }
  }
  const strippedWord = raw.strippedWord ?? raw.word;
  const rawOptionsByForm = sortCrunchResults(raw.crunched, strippedWord)
    .map((form) => {
      const stripped = stripDiacritics(form.form);
      const matches = vowelsMatches(stripped, long, short);
      return { form, matches };
    })
    .filter(({ matches }) => matches !== -1);
  if (rawOptionsByForm.length === 0) {
    return [];
  }
  const maxMatches = Math.max(...rawOptionsByForm.map((o) => o.matches));
  const optionsByForm = rawOptionsByForm
    .filter((o) => o.matches === maxMatches)
    .map((o) => o.form);

  // Only offer the numeral reading when it changes the output, i.e. every
  // Morceus form has a macron somewhere (`VI` -> `vī`). Otherwise (`C` for
  // Gaius) both readings print the same and the flag would just be noise.
  if (
    long.size === 0 &&
    isAllCapsLetters(strippedWord) &&
    parseRomanNumeral(strippedWord) !== undefined &&
    optionsByForm.every((o) => o.form.includes("\u0304"))
  ) {
    optionsByForm.push({
      form: raw.word,
      kind: "numeral",
      options: [],
    });
  }

  return optionsByForm;
}

/**
 * Runs tokenization and Morceus morphological analysis synchronously without
 * calling the external POS tagger.
 */
export function analyzeWithMorceus(text: string): MorceusAnalysis {
  assert(
    text.length <= INPUT_MAX_LENGTH,
    `Input longer than ${INPUT_MAX_LENGTH} characters.`
  );
  const [preprocessed, words, spaces] = preprocessText(text);
  const tokens: (string | AnalyzedToken)[] = [];
  for (let i = 0; i < preprocessed.length; i++) {
    const raw = preprocessed[i];
    if (typeof raw === "string") {
      tokens.push(raw);
      continue;
    }
    const strippedWord = raw.strippedWord ?? raw.word;
    const optionsByForm = buildOptionsForToken(raw);
    if (
      optionsByForm.length === 0 &&
      (parseRomanNumeral(strippedWord) !== undefined ||
        isAbbreviationBeforePeriod(strippedWord, preprocessed[i + 1]))
    ) {
      // A token the tagger saw as two words can't become one separator here
      // without shifting the tag alignment in `attachGuesses`.
      assert(raw.nlpEnclitic === undefined);
      tokens.push(raw.word);
      continue;
    }
    tokens.push({ raw, optionsByForm });
  }
  return { tokens, words, spaces };
}

/**
 * The `word` to report for a token. Words Morceus has no form for keep the
 * user's own spelling, including any macrons or other diacritics they typed,
 * since nothing better is known about them.
 */
function reportedWord(token: AnalyzedToken): string {
  return token.optionsByForm.length === 0
    ? token.raw.typed ?? token.raw.word
    : token.raw.word;
}

/**
 * Converts a MorceusAnalysis directly to a MacronizedResult without POS-tagger
 * suggestions (used for Morceus-only mode and tagger fallback).
 */
export function toUnsuggestedResult(
  analysis: MorceusAnalysis
): MacronizedResult {
  const result: MacronizedResult = [];
  for (const token of analysis.tokens) {
    if (typeof token === "string") {
      result.push(token);
      continue;
    }
    result.push({
      word: reportedWord(token),
      options: convertOptionsForForm(token.optionsByForm),
    });
  }
  return result;
}

/**
 * Combines a MorceusAnalysis with POS-tagger output to produce a MacronizedResult
 * with `suggested` indices and `confidence` levels.
 */
function attachGuesses(
  analysis: MorceusAnalysis,
  nlpResult: LatinToken[]
): MacronizedResult {
  const result: MacronizedResult = [];
  let j = 0;
  for (let i = 0; i < analysis.tokens.length; i++) {
    const token = analysis.tokens[i];
    if (typeof token === "string") {
      result.push(token);
      j++;
      continue;
    }
    const { raw, optionsByForm } = token;
    const strippedWord = raw.strippedWord ?? raw.word;
    const nlpToken = nlpResult[j];
    j++;
    assert(strippedWord.startsWith(nlpToken[0]));
    if (raw.nlpEnclitic !== undefined) {
      assertEqual(raw.nlpEnclitic, nlpResult[j][0]);
      j++;
    }

    const macronized: MacronizedWord = {
      word: reportedWord(token),
      options: convertOptionsForForm(optionsByForm),
    };

    // If there aren't options to choose from, we don't need to guess.
    if (optionsByForm.length <= 1) {
      result.push(macronized);
      continue;
    }

    // Tokens with a numeral reading are left for the user to decide. The
    // tagger's numeral reading is unreliable: it tags the imperative `I` as a
    // numeral, and all-caps text gets numeral tags almost everywhere.
    if (optionsByForm.some((o) => o.kind === "numeral")) {
      result.push(macronized);
      continue;
    }

    const bestMatch = findBestMatch(optionsByForm, nlpToken);
    if (bestMatch !== undefined) {
      macronized.suggested = bestMatch.index;
      macronized.confidence = bestMatch.confidence;
    }
    result.push(macronized);
  }
  return result;
}

function sentenceSegement(words: string[]): string[][] {
  const sentences: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (word.includes("?") || word.includes("!") || word.includes(".")) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push(current);
  }
  return sentences;
}

/** Tags with the local Stanza server, one sentence per request item. */
export const stanzaTagger: Tagger = (words) =>
  stanzaAnalysis(sentenceSegement(words));

/**
 * Macronizes `text`: Morceus analysis, then POS tags from `tagger` (the
 * LatinCy server by default) to suggest one form per ambiguous word.
 */
export async function macronizeInput(
  text: string,
  tagger: Tagger = latincyAnalysis
): Promise<MacronizedResult> {
  const analysis = analyzeWithMorceus(text);
  const nlpResult = await tagger(analysis.words, analysis.spaces);
  return attachGuesses(analysis, nlpResult);
}
