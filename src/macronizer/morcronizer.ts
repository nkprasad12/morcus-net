import { assert } from "@/common/assert";
import { singletonOf } from "@/common/misc_utils";
import { processWords } from "@/common/text_cleaning";
import { latincyAnalysis } from "@/latincy/latincy_client";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";

const INPUT_MAX_LENGTH = 10000;

const INFLECTION_PROVIDER = singletonOf(() => {
  const tables = MorceusTables.CACHED.get();
  const cruncher = MorceusCruncher.make(tables);
  return (word: string) => cruncher(word, CruncherOptions.DEFAULT);
});

export async function macronizeInput(text: string) {
  assert(
    text.length <= INPUT_MAX_LENGTH,
    `Input longer than ${INPUT_MAX_LENGTH} characters.`
  );
  // Kick this off first, since the bulk of the work is done
  // in a different process.
  const nlpPromise = latincyAnalysis(text);
  const chunked = processWords(text, (word) => ({
    text: word,
    data: INFLECTION_PROVIDER.get()(word),
  }));
  return [await nlpPromise, chunked];
}
