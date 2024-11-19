import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";
import { InflectionContext } from "@/morceus/inflection_data_utils";
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

const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
const start = performance.now();
const result = cruncher(process.argv[2], CruncherOptions.DEFAULT);
console.log(`${performance.now() - start} ms`);
result.forEach(printWordAnalysis);
