/* istanbul ignore file */

// Central place collecting utitity for debugging or manual result inspection.

import { checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { InflectionContext } from "@/morceus/inflection_data_utils";
import {
  processNomIrregEntries,
  processNomIrregEntries2,
  processVerbIrregEntries2,
} from "@/morceus/irregular_stems";
import {
  allNounStems,
  allVerbStems,
  type IrregularStem,
  type Lemma,
} from "@/morceus/stem_parsing";
import { IndexMode, makeEndIndexAndSave } from "@/morceus/tables/indices";
import {
  EXPANDED_TEMPLATES,
  expandSingleTable,
  expandTemplatesAndSave,
} from "@/morceus/tables/templates";
import {
  compareEndTables,
  compareIrregStems,
} from "@/scripts/compare_morceus_results";
import { compareEndIndices } from "@/scripts/compare_morceus_results";

import fs from "fs";

const INDEX_OUTPUT_DIR = "build/morceus/indices";
const IRREGS_OUTPUT_DIR = "build/morceus/irregs";

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
      const pos = stem.code;
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

function stringifyIrreg(irreg: IrregularStem, mode: "noms" | "verbs"): string {
  const baseCode = mode === "noms" ? ":wd:" : ":vb:";
  const lines: string[] = [`:le:${irreg.lemma}`];
  for (const form of irreg.irregularForms || []) {
    const context = InflectionContext.toString(form);
    const code = form.code === undefined ? baseCode : `:${form.code}:`;
    lines.push(`${code}${form.form} ${context}`);
  }
  for (const form of irreg.regularForms || []) {
    if (form.code === "aj" || form.code === "no") {
      const code = `:${form.code}:`;
      const contextString = InflectionContext.toString(form);
      lines.push(`${code}${form.stem} ${form.template} ${contextString}`);
      continue;
    }
    const table = checkPresent(EXPANDED_TEMPLATES.get().get(form.template));
    lines.push(
      ...expandSingleTable(form.stem, form, table).map(
        (ending) =>
          `${baseCode}${ending.ending} ${InflectionContext.toString(ending)}`
      )
    );
  }
  return lines.join("\n");
}

function writeIrregs2(mode: "noms" | "verbs") {
  const lemmata =
    mode === "noms" ? processNomIrregEntries2() : processVerbIrregEntries2();
  fs.mkdirSync(IRREGS_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    `${IRREGS_OUTPUT_DIR}/${mode}2.irreg`,
    `\n${lemmata.map((l) => stringifyIrreg(l, mode)).join("\n\n")}\n`
  );
}

function writeIrregsFile(lemmata: Lemma[], name: string) {
  const result = lemmata
    .map((lemma) => JSON.stringify(lemma, undefined, 2))
    .join("\n\n");
  fs.mkdirSync(IRREGS_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(`${IRREGS_OUTPUT_DIR}/${name}.irreg`, result);
}

export namespace Stems {
  export const makeNomIrregs = () =>
    writeIrregsFile(processNomIrregEntries(), "nom");
  export const makeNomIrregs2 = () => writeIrregs2("noms");
  export const makeVerbIrregs = () => writeIrregs2("verbs");
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

Stems.makeVerbIrregs();
compareIrregStems("verbs");
