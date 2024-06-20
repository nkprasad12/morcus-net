/* istanbul ignore file */

// Central place collecting utitity for debugging or manual result inspection.

import { arrayMap } from "@/common/data_structures/collect_map";
import {
  processNomIrregEntries,
  processVerbIrregEntries,
} from "@/morceus/irregular_stems";
import { allNounStems, allVerbStems, type Lemma } from "@/morceus/stem_parsing";
import { IndexMode, makeEndIndexAndSave } from "@/morceus/tables/indices";
import { expandTemplatesAndSave } from "@/morceus/tables/templates";
import { compareEndTables } from "@/scripts/compare_morceus_results";
import { compareEndIndices } from "@/scripts/compare_morceus_results";

import fs from "fs";

const INDEX_OUTPUT_DIR = "build/morceus/indices";

/** Creates a stem index in a format matching Morpheus. */
function indexStems(lemmata: Lemma[]): Map<string, string[]> {
  const index = arrayMap<string, string>();
  for (const lemma of lemmata) {
    for (const stem of lemma.stems) {
      const cleanSteam = stem.stem.replaceAll(/[\^_-]/g, "");
      const data: string[] = [lemma.lemma, stem.inflection];
      if (stem.other !== undefined) {
        data.push(stem.other);
      }
      const pos = stem.pos;
      console.log(pos);
      const prefix =
        pos === "vb" ? "1" : pos === "wd" ? "2" : pos === "de" ? "3" : "";
      const suffix = stem.stem === cleanSteam ? "" : stem.stem;
      const key = `${prefix}${cleanSteam} ${suffix}`;
      index.add(key, data.join(":"));
    }
  }
  return index.map;
}

function writeStemIndex(lemmata: Lemma[], tag: string) {
  const destination = `${INDEX_OUTPUT_DIR}/${tag}.stemindex`;
  fs.writeFileSync(
    destination,
    Array.from(indexStems(lemmata).entries())
      .map(([k, v]) => `${k}:${v}`)
      .sort()
      .join("\n")
  );
}

export namespace Stems {
  export const makeNomIrregs = processNomIrregEntries;
  export const makeVerbIrregs = processVerbIrregEntries;
  export const createIndices = () => {
    fs.mkdirSync(INDEX_OUTPUT_DIR, { recursive: true });
    writeStemIndex(allNounStems(), "nouns");
    writeStemIndex(allVerbStems(), "verbs");
  };
}

export namespace Endings {
  export const createTables = expandTemplatesAndSave;
  export const compareTables = compareEndTables;

  export const createIndices = makeEndIndexAndSave;
  export const createIndicesForComparison = () => {
    makeEndIndexAndSave(IndexMode.NOUNS);
    makeEndIndexAndSave(IndexMode.VERBS);
  };

  export const compareIndices = compareEndIndices;
}

Stems.createIndices();
