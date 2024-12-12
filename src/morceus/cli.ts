/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";
import { inLsButNotMorceus, writeIrregs } from "@/morceus/debug";
import { InflectionContext } from "@/morceus/inflection_data_utils";
import { expandTemplatesAndSave } from "@/morceus/tables/templates";
import * as dotenv from "dotenv";

dotenv.config();

const ANALYZE_WORD = "analyzeWord";
const BUILD_TABLES = "buildTables";
const BUILD_IRREGS = "buildIrregs";
const IN_LS_BUT_NOT_MORCEUS = "inLsButNotMorceus";

const ALL_COMMANDS = [
  ANALYZE_WORD,
  BUILD_TABLES,
  BUILD_IRREGS,
  IN_LS_BUT_NOT_MORCEUS,
];

function printWordAnalysis(input: LatinWordAnalysis) {
  console.log(`lemma: ${input.lemma}`);
  for (const form of input.inflectedForms) {
    console.log(`  - ${form.form}: `);
    for (const data of form.inflectionData) {
      console.log(`    - ${InflectionContext.toString(data)}`);
    }
  }
}

function analyzeWord(word: string) {
  const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
  const start = performance.now();
  const result = cruncher(word, CruncherOptions.DEFAULT);
  console.log(`${performance.now() - start} ms`);
  result.forEach(printWordAnalysis);
}

const command = process.argv[2];
if (command === ANALYZE_WORD) {
  analyzeWord(
    checkPresent(
      process.argv[3],
      `${ANALYZE_WORD} requires an argument (e.g. ${ANALYZE_WORD} habeas)`
    )
  );
} else if (command === BUILD_TABLES) {
  expandTemplatesAndSave();
} else if (command === BUILD_IRREGS) {
  const arg = process.argv[3];
  if (arg !== "noms" && arg !== "verbs") {
    throw new Error(`Argument can only be "noms" or "verbs"`);
  }
  writeIrregs(arg);
} else if (command === IN_LS_BUT_NOT_MORCEUS) {
  const output_file = "in_ls_but_not_in_morceus.txt";
  inLsButNotMorceus(output_file);
  console.log(`Wrote to ${output_file}`);
} else {
  console.error(
    `Unknown command ${command}. Valid commands: ${ALL_COMMANDS.join(", ")}`
  );
}
