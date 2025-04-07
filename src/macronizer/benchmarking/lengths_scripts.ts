/* istanbul ignore file */

import fs from "fs";

import { processGaffiot } from "@/common/gaffiot/process_gaffiot";
import { removeDiacritics } from "@/common/text_cleaning";

function checkForMacronsBefore(rawInput: string, target: string): boolean {
  const input = rawInput.normalize("NFD");
  let i = 0;
  let missingMacron = false;
  while (true) {
    i = input.indexOf(target, i + 1);
    if (i === -1) {
      break;
    }
    if (input[i - 1] !== "\u0304") {
      missingMacron = true;
      console.log(`Found ${target} at ${i} in ${input} without macron.`);
    }
  }
  return missingMacron;
}

export function nonLongVowelsBeforeNSorNF() {
  const gaffiot = processGaffiot();
  for (const entry of gaffiot) {
    for (const key of entry.keys) {
      let missingMacron = false;
      if (key.includes("nf")) {
        missingMacron = missingMacron || checkForMacronsBefore(key, "nf");
      }
      if (key.includes("ns")) {
        missingMacron = missingMacron || checkForMacronsBefore(key, "ns");
      }
      if (missingMacron) {
        console.log(key);
      }
    }
  }
}

export function findDifferingVowelLegnths() {
  const gaffiot = processGaffiot();
  for (const entry of gaffiot) {
    for (const key of entry.keys) {
      let odd = false;
      if (key.includes("nf")) {
        odd = odd || checkForMacronsBefore(key, "nf");
      }
      if (key.includes("ns")) {
        odd = odd || checkForMacronsBefore(key, "ns");
      }
    }
  }
}

function unmacronizeFile(filePath: string) {
  const content = fs.readFileSync(filePath).toString();
  console.log(removeDiacritics(content));
}

export function unmacronizeGolden(name: string) {
  unmacronizeFile(`src/macronizer/benchmarking/macronized_goldens/${name}`);
}
