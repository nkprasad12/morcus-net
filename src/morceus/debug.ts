/* istanbul ignore file */

// Central place collecting utitity for debugging or manual result inspection.

import { assert, checkPresent } from "@/common/assert";
import { setMap } from "@/common/data_structures/collect_map";
import {
  InflectionContext,
  toInflectionData,
} from "@/morceus/inflection_data_utils";
import {
  processNomIrregEntries2,
  processVerbIrregEntries2,
} from "@/morceus/irregular_stems";
import {
  allNounStems2,
  allVerbStems2,
  type IrregularLemma,
  type Lemma,
  type StemCode,
} from "@/morceus/stem_parsing";
import { IndexMode, makeEndIndexAndSave } from "@/morceus/tables/indices";
import {
  EXPANDED_TEMPLATES,
  expandSingleTable,
  expandTemplatesAndSave,
} from "@/morceus/tables/templates";
import {
  compareEndTables,
  compareStemIndex,
} from "@/scripts/compare_morceus_results";
import { compareEndIndices } from "@/scripts/compare_morceus_results";

import fs from "fs";

const INDEX_OUTPUT_DIR = "build/morceus/indices";
const IRREGS_OUTPUT_DIR = "build/morceus/irregs";

function computeIndexInfo(code: StemCode, entry: string): [string, string] {
  const prefix =
    code === "vb" ? "1" : code === "wd" ? "2" : code === "de" ? "3" : "";
  const noDashEntry = entry.replaceAll("-", "");
  // TODO: The plus seems to stand for an i that is actually a jj.
  const cleanEntry = noDashEntry.replaceAll(/[\^_-]/g, "").replaceAll("+", "");
  // Check that we never have a nonempty prefix with an empty stem.
  assert(prefix === "" || cleanEntry.length > 0);
  const key = cleanEntry.length === 0 ? "*" : `${prefix}${cleanEntry}`;
  const entryForm = noDashEntry === cleanEntry ? "" : noDashEntry;
  // The key is used to look up the stems starting with a particular prefix. The entryForm
  // is used to show what the actual entry (with length markings) was supposed to be,
  // but is excluded in the case where it matches the key exactly (by Morpheus).
  return [key, entryForm];
}

/** Creates a stem index in a format matching Morpheus. */
function indexStems(
  lemmata: (Lemma | IrregularLemma)[],
  mode: "noms" | "verbs"
): Map<string, string[]> {
  const index = setMap<string, string>();
  for (const lemma of lemmata) {
    if (lemma.lemma === "prosum") {
      console.log(lemma);
    }
    if ("stems" in lemma) {
      for (const stem of lemma.stems) {
        const [key, entryForm] = computeIndexInfo(stem.code, stem.stem);
        const data: string[] = [entryForm, lemma.lemma, stem.inflection];
        const inflectionParts = (stem.other || "")
          .split(/\s+/)
          .filter((part) => part.length > 0)
          .map((part) => part.trim());
        try {
          data.push(
            ...InflectionContext.toStringArray(
              toInflectionData(inflectionParts)
            )
          );
          index.add(key, data.join(":"));
        } catch (e) {
          console.log(lemma);
          throw e;
        }
      }
    } else {
      const baseCode = mode === "noms" ? "wd" : "vb";
      for (const form of lemma.irregularForms || []) {
        const code = form.code === undefined ? baseCode : form.code;
        const [key, entryForm] = computeIndexInfo(code, form.form);
        const inflection = InflectionContext.toStringArray(form);
        index.add(key, [entryForm, lemma.lemma].concat(inflection).join(":"));
      }
      for (const form of lemma.regularForms || []) {
        if (form.code === "aj" || form.code === "no" || form.code === "vs") {
          const [key, entryForm] = computeIndexInfo(form.code, form.stem);
          const inflection = InflectionContext.toStringArray(form);
          const entry = [entryForm, lemma.lemma, form.template].concat(
            inflection
          );
          index.add(key, entry.join(":"));
          continue;
        }
        const table = checkPresent(EXPANDED_TEMPLATES.get().get(form.template));
        const prefix = baseCode === "vb" ? "1" : baseCode === "wd" ? "2" : "";
        assert(prefix.length > 0);
        for (const ending of expandSingleTable(form.stem, form, table)) {
          const [key, entryForm] = computeIndexInfo(baseCode, ending.ending);
          const inflection = InflectionContext.toStringArray(ending);
          index.add(key, [entryForm, lemma.lemma].concat(inflection).join(":"));
        }
      }
    }
  }
  return new Map([...index.map.entries()].map(([k, v]) => [k, [...v]]));
}

function writeStemIndex(
  lemmata: (Lemma | IrregularLemma)[],
  tag: "noms" | "verbs"
) {
  const destination = `${INDEX_OUTPUT_DIR}/${tag}.stemindex`;
  fs.writeFileSync(
    destination,
    Array.from(indexStems(lemmata, tag).entries())
      .map(([k, v]) => `${k} ${v.join(" ")}`)
      .sort()
      .join("\n")
  );
}

function stringifyIrreg(irreg: IrregularLemma, mode: "noms" | "verbs"): string {
  const baseCode = mode === "noms" ? ":wd:" : ":vb:";
  const lines: string[] = [`:le:${irreg.lemma}`];
  for (const form of irreg.irregularForms || []) {
    const context = InflectionContext.toString(form);
    const code = form.code === undefined ? baseCode : `:${form.code}:`;
    lines.push(`${code}${form.form} ${context}`);
  }
  for (const form of irreg.regularForms || []) {
    if (
      form.code === "aj" ||
      form.code === "no" ||
      form.code === "vs" ||
      form.code === "de"
    ) {
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

export namespace Stems {
  export const makeNomIrregs2 = () => writeIrregs2("noms");
  export const makeVerbIrregs = () => writeIrregs2("verbs");
  export const createNomIndex = () => {
    fs.mkdirSync(INDEX_OUTPUT_DIR, { recursive: true });
    writeStemIndex(allNounStems2(), "noms");
  };
  export const createVerbIndex = () => {
    fs.mkdirSync(INDEX_OUTPUT_DIR, { recursive: true });
    writeStemIndex(allVerbStems2(), "verbs");
  };
  export const createIndices = () => {
    createNomIndex();
    createVerbIndex();
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
Stems.createVerbIndex();
compareStemIndex("verbs");
