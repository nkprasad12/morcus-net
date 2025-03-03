import { assert, assertEqual } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { singletonOf } from "@/common/misc_utils";
import { isTextBreakChar, processWords } from "@/common/text_cleaning";
import { latincyAnalysis, type LatinToken } from "@/latincy/latincy_client";
import { crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions, type CrunchResult } from "@/morceus/cruncher_types";
import {
  compareGrammaticalData,
  convertUpos,
  wordInflectionDataToArray,
} from "@/morceus/inflection_data_utils";
import type {
  MacronizedResult,
  MacronizedWord,
  FormOptions,
} from "@/web/api_routes";

const INPUT_MAX_LENGTH = 10000;

interface IntermediateResult {
  word: string;
  crunched: CrunchResult[];
}

const INFLECTION_PROVIDER = singletonOf(() => {
  const tables = MorceusTables.CACHED.get();
  return (word: string) => crunchWord(word, tables, CruncherOptions.DEFAULT);
});

function sortByLemma(results: CrunchResult[]): FormOptions[] {
  const byLemma = arrayMap<string, CrunchResult>();
  for (const result of results) {
    byLemma.add(result.lemma, result);
  }
  const options: FormOptions[] = [];
  for (const [lemma, results] of byLemma.map) {
    options.push({
      lemma,
      morph: results.map((r) =>
        wordInflectionDataToArray(r.grammaticalData).join(" ")
      ),
    });
  }
  return options;
}

function formDisplayText(crunched: CrunchResult): string {
  const form = crunched.form + (crunched.enclitic ?? "");
  return form.replaceAll(/[+^-]/g, "").replaceAll("_", "\u0304");
}

function processWord(crunchResults: CrunchResult[]): MacronizedWord["options"] {
  const byForm = arrayMap<string, CrunchResult>();
  for (const crunched of crunchResults) {
    byForm.add(formDisplayText(crunched), crunched);
  }
  const options: MacronizedWord["options"] = [];
  for (const [form, results] of byForm.map) {
    options.push({
      form,
      options: sortByLemma(results),
    });
  }
  return options;
}

function extractNlpTokenText(nlp: LatinToken): string {
  const raw = nlp.text;
  let i = 0;
  while (i < raw.length && isTextBreakChar(raw[i])) {
    i++;
  }
  if (i === raw.length) {
    return raw;
  }
  let j = raw.length - 1;
  while (i < j && isTextBreakChar(raw[j])) {
    j--;
  }
  return raw.substring(i, j + 1);
}

function findBestMatch(
  crunched: CrunchResult[],
  nlp: Omit<LatinToken, "text">
): string | undefined {
  const nlpInflection = convertUpos(nlp.morph);
  for (const result of crunched) {
    const lemma = result.lemma.split("#")[0];
    if (lemma !== nlp.lemma) {
      continue;
    }
    const comparison = compareGrammaticalData(
      nlpInflection,
      result.grammaticalData
    );
    if (comparison === -1 || comparison === 0) {
      // We could have other matches, later in the list, but with no way
      // to decide which one is better, we just return this match.
      return formDisplayText(result);
    }
  }
  return undefined;
}

/**
 * Attaches guesses for each token in the Morceus result.
 *
 * @param rawResult The (non-statistical) results from a morphological analyzer.
 * @param nlpResult Statistical POS guesses from NLP analyiss.
 * @returns The formatted macronized result.
 */
function attachGuesses(
  rawResult: (string | IntermediateResult)[],
  nlpResult: LatinToken[]
): MacronizedResult {
  const result: MacronizedResult = [];
  let j = 0;
  for (let i = 0; i < rawResult.length; i++) {
    const raw = rawResult[i];
    if (typeof raw === "string") {
      result.push(raw);
      continue;
    }
    const macronized: MacronizedWord = {
      word: raw.word,
      options: processWord(raw.crunched),
    };

    // The NLP tokenizer has some odd behavior - for example in the
    // text "[Hello hi]", it will produce ["[Hello", "hi", "]"]. This
    // code attempts to remove the extra bits and makes sure we are advancing
    // in both token lists correctly.
    let nlpText = extractNlpTokenText(nlpResult[j]);
    while (!raw.word.startsWith(nlpText)) {
      j++;
      nlpText = extractNlpTokenText(nlpResult[j]);
    }
    const nlpToken: Omit<LatinToken, "text"> = nlpResult[j];
    j++;

    // Handle enclitics. LatinCy splits them off.
    if (raw.word !== nlpText) {
      const extra = raw.word.substring(nlpText.length);
      assertEqual(extra, extractNlpTokenText(nlpResult[j]));
      j++;
    }

    // If there aren't options to choose from, we don't need to guess.
    const forms = macronized.options.map((o) => o.form.toLowerCase());
    if (new Set(forms).size <= 1) {
      result.push(macronized);
      continue;
    }

    const guessForm = findBestMatch(raw.crunched, nlpToken);
    const guessIndex = macronized.options.findIndex(
      (o) => o.form === guessForm
    );
    if (guessIndex !== -1) {
      macronized.suggested = guessIndex;
    }
    result.push(macronized);
  }
  return result;
}

function restoreOriginalCase(macronized: MacronizedResult) {
  macronized.forEach((t) => {
    if (typeof t === "string") {
      return;
    }
    for (const form of t.options) {
      const wordChunks: string[] = [];
      const formChunks = form.form.split("\u0304");
      const formLen = formChunks.reduce((acc, c) => acc + c.length, 0);
      assertEqual(formLen, t.word.length);

      let i = 0;
      for (const formChunk of formChunks) {
        const wordChunk = t.word.substring(i, i + formChunk.length);
        wordChunks.push(wordChunk);
        i += formChunk.length;
      }
      form.form = wordChunks.join("\u0304");
    }
  });
}

export async function macronizeInput(text: string): Promise<MacronizedResult> {
  assert(
    text.length <= INPUT_MAX_LENGTH,
    `Input longer than ${INPUT_MAX_LENGTH} characters.`
  );
  // Kick this off first so it can run in parallel with the Morceus call.
  const nlpPromise = latincyAnalysis(text);
  const crunched = processWords(text, (word) => ({
    word,
    crunched: INFLECTION_PROVIDER.get()(word),
  }));
  const macronized = attachGuesses(crunched, await nlpPromise);
  restoreOriginalCase(macronized);
  return macronized;
}
