/* istanbul ignore file */

// Central place collecting utitity for debugging or manual result inspection.

import { assert, checkPresent } from "@/common/assert";
import { arrayMap, setMap } from "@/common/data_structures/collect_map";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { envVar } from "@/common/env_vars";
import { removeDiacritics } from "@/common/text_cleaning";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { InflectionContext } from "@/morceus/inflection_data_utils";
import {
  processNomIrregEntries,
  processVerbIrregEntries,
} from "@/morceus/irregular_stems";
import {
  StemCode,
  allNounStems,
  allVerbStems,
  type Lemma,
  type Stem,
} from "@/morceus/stem_parsing";
import { IndexMode, makeEndIndexAndSave } from "@/morceus/tables/indices";
import {
  EXPANDED_TEMPLATES,
  expandSingleTable,
  expandTemplatesAndSave,
} from "@/morceus/tables/templates";
import { compareEndTables } from "@/scripts/compare_morceus_results";
import { compareEndIndices } from "@/scripts/compare_morceus_results";

import fs from "fs";

const INDEX_OUTPUT_DIR = "build/morceus/indices";
const IRREGS_OUTPUT_DIR = "build/morceus/irregs";

const TEMPLATE_STEM_CODES = new Set<StemCode>(["aj", "de", "no", "vs"]);

const DE_MAP = new Map<string, [string, string][]>([
  ["ire_vb", [["", "conj4"]]],
  ["are_vb", [["", "conj1"]]],
]);

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
  lemmata: Lemma[],
  mode: "noms" | "verbs"
): Map<string, string[]> {
  const index = setMap<string, string>();
  const baseCode = mode === "noms" ? "wd" : "vb";
  for (const lemma of lemmata) {
    for (const stem of lemma.stems || []) {
      if (stem.code === undefined) {
        const table = checkPresent(
          EXPANDED_TEMPLATES.get().get(stem.inflection)
        );
        const prefix = baseCode === "vb" ? "1" : baseCode === "wd" ? "2" : "";
        assert(prefix.length > 0);
        for (const ending of expandSingleTable(stem.stem, stem, table)) {
          const [key, entryForm] = computeIndexInfo(baseCode, ending.ending);
          const inflection = InflectionContext.toStringArray(ending);
          index.add(key, [entryForm, lemma.lemma].concat(inflection).join(":"));
        }
        continue;
      }
      assert(TEMPLATE_STEM_CODES.has(stem.code));
      if (stem.code === "de") {
        const pattern = checkPresent(
          DE_MAP.get(stem.inflection),
          JSON.stringify(lemma, undefined, 2)
        );
        for (const [infix, inflection] of pattern) {
          const [key, entryForm] = computeIndexInfo("vs", stem.stem + infix);
          const entry: string[] = [
            entryForm,
            lemma.lemma,
            inflection,
            stem.inflection,
          ];
          const inflectionData = InflectionContext.toStringArray(stem);
          index.add(key, entry.concat(inflectionData).join(":"));
        }
      }
      const [key, entryForm] = computeIndexInfo(stem.code, stem.stem);
      const inflectionData = InflectionContext.toStringArray(stem);
      const entry: string[] = [entryForm, lemma.lemma, stem.inflection];
      index.add(key, entry.concat(inflectionData).join(":"));
    }
    for (const form of lemma.irregularForms || []) {
      const code = form.code === undefined ? baseCode : form.code;
      const [key, entryForm] = computeIndexInfo(code, form.form);
      const inflection = InflectionContext.toStringArray(form);
      index.add(key, [entryForm, lemma.lemma].concat(inflection).join(":"));
    }
  }
  return new Map([...index.map.entries()].map(([k, v]) => [k, [...v]]));
}

function writeStemIndex(lemmata: Lemma[], tag: "noms" | "verbs") {
  const destination = `${INDEX_OUTPUT_DIR}/${tag}.stemindex`;
  fs.writeFileSync(
    destination,
    Array.from(indexStems(lemmata, tag).entries())
      .map(([k, v]) => `${k} ${v.join(" ")}`)
      .sort()
      .join("\n")
  );
}

function stringifyIrreg(irreg: Lemma, mode: "noms" | "verbs"): string {
  const baseCode = mode === "noms" ? ":wd:" : ":vb:";
  const lines: string[] = [`:le:${irreg.lemma}`];
  for (const form of irreg.irregularForms || []) {
    const context = InflectionContext.toString(form);
    const code = form.code === undefined ? baseCode : `:${form.code}:`;
    lines.push(`${code}${form.form} ${context}`);
  }
  for (const form of irreg.stems || []) {
    if (
      form.code === "aj" ||
      form.code === "no" ||
      form.code === "vs" ||
      form.code === "de"
    ) {
      const code = `:${form.code}:`;
      const contextString = InflectionContext.toString(form);
      lines.push(`${code}${form.stem} ${form.inflection} ${contextString}`);
      continue;
    }
    const table = checkPresent(EXPANDED_TEMPLATES.get().get(form.inflection));
    lines.push(
      ...expandSingleTable(form.stem, form, table).map(
        (ending) =>
          `${baseCode}${ending.ending} ${InflectionContext.toString(ending)}`
      )
    );
  }
  return lines.join("\n");
}

export function writeIrregs(mode: "noms" | "verbs") {
  const lemmata =
    mode === "noms" ? processNomIrregEntries() : processVerbIrregEntries();
  fs.mkdirSync(IRREGS_OUTPUT_DIR, { recursive: true });
  const fileName = `${IRREGS_OUTPUT_DIR}/${mode}2.irreg`;
  fs.writeFileSync(
    fileName,
    `\n${lemmata.map((l) => stringifyIrreg(l, mode)).join("\n\n")}\n`
  );
  console.log(`Wrote irregs to ${fileName}`);
}

export namespace Stems {
  export const makeNomIrregs = () => writeIrregs("noms");
  export const makeVerbIrregs = () => writeIrregs("verbs");
  export const createNomIndex = () => {
    fs.mkdirSync(INDEX_OUTPUT_DIR, { recursive: true });
    writeStemIndex(allNounStems(), "noms");
  };
  export const createVerbIndex = () => {
    fs.mkdirSync(INDEX_OUTPUT_DIR, { recursive: true });
    writeStemIndex(allVerbStems(), "verbs");
  };
  export const createIndices = () => {
    createNomIndex();
    createVerbIndex();
  };
  export const validate = () => {
    const weirdStems: Stem[][] = [];
    const weirdInfls = new Set<string>();
    for (const lemma of allNounStems().concat(allVerbStems())) {
      const weirds: Stem[] = [];
      for (const stem of lemma.stems || []) {
        if (stem.code !== "wd" && stem.code !== "vb") {
          weirds.push(stem);
          weirdInfls.add(stem.inflection);
        }
      }
      if (weirds.length > 0) {
        weirdStems.push(weirds);
      }
    }

    const weirdWithInfl = weirdStems
      .flatMap((x) => x)
      .filter(
        (x) =>
          !EXPANDED_TEMPLATES.get().has(x.inflection) &&
          x.inflection !== "ire_vb" &&
          x.inflection !== "are_vb"
      );
    console.log(weirdWithInfl);
    console.log(weirdWithInfl.length);
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

// Stems.makeNomIrregs();
// Stems.makeVerbIrregs();
// Stems.createVerbIndex();
// Stems.createNomIndex();
// compareStemIndex("noms");
// compareStemIndex("verbs");

function undashLemma(lemma: Lemma) {
  const result: Lemma = { lemma: lemma.lemma };
  if (lemma.irregularForms !== undefined) {
    result.irregularForms = lemma.irregularForms.map((form) => ({
      ...form,
      form: form.form.replaceAll("-", ""),
    }));
  }
  if (lemma.stems !== undefined) {
    result.stems = lemma.stems.map((stem) => ({
      ...stem,
      stem: stem.stem.replaceAll("-", ""),
    }));
  }
  return result;
}

export function findDupes() {
  const vbs = allVerbStems();
  const nouns = allNounStems();

  let dupes = 0;
  let easySubstantives = 0;
  let exacts = 0;
  const knownLemmata = arrayMap<string, Lemma>();
  for (const lemma of vbs.concat(nouns)) {
    const undashed = undashLemma(lemma);
    knownLemmata.add(undashed.lemma, undashed);
  }
  for (const [lemma, values] of knownLemmata.map.entries()) {
    if (values.length <= 1) {
      continue;
    }
    if (new Set(values.map((v) => JSON.stringify(v))).size === 1) {
      exacts += 1;
      continue;
    }
    if (values.length === 2) {
      const sameLemma = values[0].lemma === values[1].lemma;
      const noIrregs =
        values[0].irregularForms === undefined &&
        values[1].irregularForms === undefined;
      const matchingStems =
        values[0].stems?.length === 1 &&
        values[1].stems?.length === 1 &&
        values[0].stems[0].stem === values[1].stems[0].stem;
      const codes = [
        values[0].stems?.at(0)?.code,
        values[1].stems?.at(0)?.code,
      ];
      const nomAndAdj = codes.includes("aj") && codes.includes("no");
      if (sameLemma && noIrregs && matchingStems && nomAndAdj) {
        easySubstantives += 1;
        continue;
      }
    }
    dupes += 1;
    console.log(lemma);
    for (const value of values) console.log(JSON.stringify(value));
    console.log("\n");
  }
  console.log("Exact dupes: " + exacts);
  console.log("easySubstantives: " + easySubstantives);
  console.log(dupes);
}

export function inLsButNotMorceus(outputFile?: string): string[] {
  const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
  const backing = sqliteBacking(envVar("LS_PROCESSED_PATH"));
  const all = backing
    .allEntryNames()
    .filter((orth) => {
      if (orth.orth.includes(" ")) {
        return false;
      }
      const bannedChars = ["'", "-"];
      for (const banned of bannedChars) {
        if (orth.orth.startsWith(banned)) {
          return false;
        }
        if (orth.orth.endsWith(banned)) {
          return false;
        }
      }
      return true;
    })
    .map((orth) => removeDiacritics(orth.orth.replaceAll("-", "")))
    .filter((orth) => cruncher(orth, CruncherOptions.DEFAULT).length === 0);

  if (outputFile) {
    console.log(all.length);
    fs.writeFileSync(outputFile, all.join("\n"));
  }
  return all;
}
