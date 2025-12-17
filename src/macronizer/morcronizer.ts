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
import {
  compareGrammaticalData,
  convertUpos,
  wordInflectionDataToArray,
} from "@/morceus/inflection_data_utils";
import type { WordInflectionData } from "@/morceus/types";
import { preprocessText, type TokenResult } from "@/nlp/text_tokenization";
import type {
  MacronizedResult,
  MacronizedWord,
  FormOptions,
} from "@/web/api_routes";

const INPUT_MAX_LENGTH = 20000;

type InternalFormOptions = Omit<FormOptions, "morph"> & {
  morph: WordInflectionData[];
};

interface OptionsForForm {
  form: string;
  options: InternalFormOptions[];
}

function convertOptionsForForm(
  options: OptionsForForm[]
): MacronizedWord["options"] {
  return options.map((option) => ({
    form: option.form,
    options: option.options.map((o) => ({
      lemma: o.lemma,
      morph: o.morph.map((m) => wordInflectionDataToArray(m).join(" ")),
    })),
  }));
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

function findBestMatch(
  crunched: OptionsForForm[],
  nlp: Omit<LatinToken, "text">
): number | undefined {
  const nlpInflection = safeConvertUpos(nlp.morph);
  if (nlpInflection === undefined) {
    return undefined;
  }
  for (let i = 0; i < crunched.length; i++) {
    const options = crunched[i].options;
    for (const option of options) {
      const lemma = option.lemma.split("#")[0];
      if (lemma !== nlp.lemma) {
        continue;
      }
      for (const morph of option.morph) {
        const comparison = compareGrammaticalData(nlpInflection, morph);
        if (comparison !== undefined) {
          return i;
        }
      }
    }
  }

  // let mostMatches = -1;
  // let bestIndex = -1;
  for (let i = 0; i < crunched.length; i++) {
    const options = crunched[i].options;
    for (const option of options) {
      for (const morph of option.morph) {
        const comparison = compareGrammaticalData(nlpInflection, morph);
        if (comparison === 0) {
          return i;
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

function attachGuesses(
  preprocessed: (string | TokenResult)[],
  nlpResult: LatinToken[]
) {
  const result: MacronizedResult = [];
  let j = 0;
  for (let i = 0; i < preprocessed.length; i++) {
    const raw = preprocessed[i];
    if (typeof raw === "string") {
      result.push(raw);
      j++;
      continue;
    }
    const nlpToken = nlpResult[j];
    j++;
    assert(raw.word.startsWith(nlpToken.text));
    if (raw.nlpEnclitic !== undefined) {
      assertEqual(raw.nlpEnclitic, nlpResult[j].text);
      j++;
    }

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
    const rawOptionsByForm = sortCrunchResults(raw.crunched, raw.word)
      .map((form) => {
        const stripped = stripDiacritics(form.form);
        const matches = vowelsMatches(stripped, long, short);
        return { form, matches };
      })
      .filter(({ matches }) => matches !== -1);
    const maxMatches = Math.max(...rawOptionsByForm.map((o) => o.matches));
    const optionsByForm = rawOptionsByForm
      .filter((o) => o.matches === maxMatches)
      .map((o) => o.form);

    const macronized: MacronizedWord = {
      word: raw.word,
      options: convertOptionsForForm(optionsByForm),
    };

    // If there aren't options to choose from, we don't need to guess.
    if (optionsByForm.length <= 1) {
      result.push(macronized);
      continue;
    }

    const guessIndex = findBestMatch(optionsByForm, nlpToken);
    if (guessIndex !== undefined) {
      macronized.suggested = guessIndex;
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

export async function macronizeInput(
  text: string,
  useStanza?: boolean
): Promise<MacronizedResult> {
  assert(
    text.length <= INPUT_MAX_LENGTH,
    `Input longer than ${INPUT_MAX_LENGTH} characters.`
  );
  const [processed, words, spaces] = preprocessText(text);
  if (useStanza) {
    const nlpResult = await stanzaAnalysis(sentenceSegement(words));
    return attachGuesses(processed, nlpResult);
  }
  const nlpResult = await latincyAnalysis(words, spaces);
  return attachGuesses(processed, nlpResult);
}
