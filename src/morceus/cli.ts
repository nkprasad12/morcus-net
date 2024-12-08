import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";
import { InflectionContext } from "@/morceus/inflection_data_utils";
import { expandTemplatesAndSave } from "@/morceus/tables/templates";
import * as dotenv from "dotenv";

dotenv.config();

function printWordAnalysis(input: LatinWordAnalysis) {
  console.log(`lemma: ${input.lemma}`);
  for (const form of input.inflectedForms) {
    console.log(`  - ${form.form}: `);
    for (const data of form.inflectionData) {
      console.log(`    - ${InflectionContext.toString(data)}`);
    }
  }
}

function analyzeWord() {
  const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
  const start = performance.now();
  const result = cruncher(process.argv[3], CruncherOptions.DEFAULT);
  console.log(`${performance.now() - start} ms`);
  result.forEach(printWordAnalysis);
}

const command = process.argv[2];
if (command === "analyzeWord") {
  analyzeWord();
} else if (command === "buildTables") {
  expandTemplatesAndSave();
} else {
  console.error(`Unknown command ${command}`);
}
