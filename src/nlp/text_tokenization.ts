import { checkPresent } from "@/common/assert";
import { singletonOf } from "@/common/misc_utils";
import {
  processTokens,
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

export interface TokenResult extends DiacriticStripped {
  /** The word with diacritics removed, but format characters (`\p{Cf}`) kept. */
  word: string;
  /** The word with diacritics and format characters removed. */
  strippedWord?: string;
  /** The word exactly as it appeared in the input. */
  typed?: string;
  crunched: CrunchResult[];
  nlpEnclitic?: string;
}

const HAS_LETTER_RE = /\p{L}/u;
const FORMAT_CHAR_RE = /\p{Cf}/gu;

export function preprocessText(
  input: string
): [(string | TokenResult)[], string[], boolean[]] {
  // A `\r` isn't a word break, so CRLF (as browsers submit forms) would glue
  // itself onto line-final words.
  const tokens = processTokens(input.replace(/\r\n?/g, "\n"));
  const processed: (string | TokenResult)[] = [];
  const words: Array<string> = [];
  const spaces: Array<boolean> = [];
  for (const [rawToken, isWord] of tokens) {
    if (!isWord || !HAS_LETTER_RE.test(rawToken)) {
      processed.push(rawToken);
      words.push(rawToken);
      spaces.push(true);
      continue;
    }

    const cfStripped = rawToken.replace(FORMAT_CHAR_RE, "");
    const stripped = stripDiacritics(cfStripped);
    const originalWord = stripDiacritics(rawToken).word;
    const crunch = INFLECTION_PROVIDER.get()(stripped.word);
    const currentProcessed: TokenResult = {
      ...stripped,
      word: originalWord,
      strippedWord: stripped.word,
      typed: rawToken,
      crunched: crunch,
    };
    processed.push(currentProcessed);
    spaces.push(false);
    const formsWithEnclitics = crunch.filter((c) => c.enclitic !== undefined);
    if (formsWithEnclitics.length === crunch.length && crunch.length > 0) {
      const firstEnclitic = checkPresent(formsWithEnclitics[0].enclitic);
      currentProcessed.nlpEnclitic = firstEnclitic;
      const baseLength = stripped.word.length - firstEnclitic.length;
      words.push(stripped.word.substring(0, baseLength));
      words.push(stripped.word.substring(baseLength));
      spaces.push(false);
      continue;
    }
    words.push(stripped.word);
  }
  return [processed, words, spaces];
}
