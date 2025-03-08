import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { singletonOf } from "@/common/misc_utils";
import {
  processWords,
  stripDiacritics,
  type DiacriticStripped,
} from "@/common/text_cleaning";
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

    const macronized: MacronizedWord = {
      word: raw.word,
      options: processWord(raw.crunched),
    };

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

/** For unit tests only. */
export interface TokenResult extends DiacriticStripped {
  word: string;
  crunched: CrunchResult[];
  nlpEnclitic?: string;
}

export function preprocessText(
  input: string
): [(string | TokenResult)[], string[], boolean[]] {
  const strippedWords = processWords(input, stripDiacritics);
  const processed: (string | TokenResult)[] = [];
  const words: Array<string> = [];
  const spaces: Array<boolean> = [];
  for (let i = 0; i < strippedWords.length; i++) {
    const word = strippedWords[i];
    if (typeof word === "string") {
      processed.push(word);
      words.push(word);
      spaces.push(true);
      continue;
    }

    const crunch = INFLECTION_PROVIDER.get()(word.word);
    const currentProcessed: TokenResult = { ...word, crunched: crunch };
    processed.push(currentProcessed);
    spaces.push(false);
    const formsWithEnclitics = crunch.filter((c) => c.enclitic !== undefined);
    if (formsWithEnclitics.length === crunch.length && crunch.length > 0) {
      const firstEnclitic = checkPresent(formsWithEnclitics[0].enclitic);
      currentProcessed.nlpEnclitic = firstEnclitic;
      const baseLength = word.word.length - firstEnclitic.length;
      words.push(word.word.substring(0, baseLength));
      words.push(word.word.substring(baseLength));
      spaces.push(false);
      continue;
    }
    words.push(word.word);
  }
  return [processed, words, spaces];
}

export async function macronizeInput(text: string): Promise<MacronizedResult> {
  assert(
    text.length <= INPUT_MAX_LENGTH,
    `Input longer than ${INPUT_MAX_LENGTH} characters.`
  );
  const [processed, words, spaces] = preprocessText(text);
  const nlpResult = await latincyAnalysis(words, spaces);
  const macronized = attachGuesses(processed, nlpResult);
  restoreOriginalCase(macronized);
  return macronized;
}
