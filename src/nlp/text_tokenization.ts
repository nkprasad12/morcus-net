import { checkPresent } from "@/common/assert";
import { singletonOf } from "@/common/misc_utils";
import {
  processWords,
  stripDiacritics,
  type DiacriticStripped,
} from "@/common/text_cleaning";
import { crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions, type CrunchResult } from "@/morceus/cruncher_types";

const INFLECTION_PROVIDER = singletonOf(() => {
  const tables = MorceusTables.CACHED.get();
  return (word: string) => crunchWord(word, tables, CruncherOptions.DEFAULT);
});

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
