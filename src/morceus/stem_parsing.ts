import { assert, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import {
  InflectionContext,
  toInflectionData,
} from "@/morceus/inflection_data_utils";
import {
  processNomIrregEntries,
  processVerbIrregEntries,
} from "@/morceus/irregular_stems";
import fs from "fs";

const NOUN_STEM_FILES: string[] = [
  "stemlib/Latin/stemsrc/ls.nom",
  "stemlib/Latin/stemsrc/nom.01",
  "stemlib/Latin/stemsrc/nom.02",
  "stemlib/Latin/stemsrc/nom.03",
  "stemlib/Latin/stemsrc/nom.04",
  "stemlib/Latin/stemsrc/nom.latin.bas",
  "stemlib/Latin/stemsrc/nom.livy",
  "stemlib/Latin/stemsrc/nom.smithbio.latin",
  "stemlib/Latin/stemsrc/nom.cic.pname",
  "stemlib/Latin/stemsrc/nom.smithgeo",
];

const VERB_STEM_FILES: string[] = [
  "stemlib/Latin/stemsrc/vbs.latin",
  "stemlib/Latin/stemsrc/vbs.latin.bas",
  "stemlib/Latin/stemsrc/vbs.latin.irreg",
];

// :le: 	lemma or headword
// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
export type StemCode = "no" | "aj" | "wd" | "vs" | "vb" | "de";
export namespace StemCode {
  export function parse(chunk: string): StemCode | undefined {
    if (chunk.startsWith(":no:")) {
      return "no";
    }
    if (chunk.startsWith(":aj:")) {
      return "aj";
    }
    if (chunk.startsWith(":wd:")) {
      return "wd";
    }
    if (chunk.startsWith(":vs:")) {
      return "vs";
    }
    if (chunk.startsWith(":vb:")) {
      return "vb";
    }
    if (chunk.startsWith(":de:")) {
      return "de";
    }
    return undefined;
  }

  export function parseStrict(chunk: string): StemCode {
    return checkPresent(parse(chunk), "Invalid stem code.");
  }
}

export interface Stem extends InflectionContext {
  code?: StemCode;
  stem: string;
  inflection: string;
}

export interface IrregularForm extends InflectionContext {
  code?: StemCode;
  form: string;
}

export interface Lemma {
  lemma: string;
  stems?: Stem[];
  irregularForms?: IrregularForm[];
}

// export function expandLemma(lemma: Lemma): InflectionTable {
//   const templates = EXPANDED_TEMPLATES.get();
//   const endings: InflectionEnding[] = [];
//   for (const stem of lemma.stems) {
//     expandTemplate(
//       {
//         name: stem.stem,
//         templates: [
//           {
//             name: stem.inflection,
//             prefix: stem.stem,
//             args: InflectionContext.toStringArray(stem),
//           },
//         ],
//       },
//       templates
//     );
//   }
//   return { name: lemma.lemma, endings };
// }

export function parseNounStemFile(filePath: string): Lemma[] {
  const content = fs.readFileSync(filePath).toString();
  const lines = content.split("\n");
  const results: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const isEmpty = line.trim().length === 0;
    const isValid = line[0] === ":";
    if (!isValid && !isEmpty) {
      continue;
    }

    if (isEmpty) {
      if (current.length > 0) {
        results.push(current);
        current = [];
      }
      continue;
    }

    assert(isEmpty === false);
    assert(isValid === true);
    if (line.startsWith(":le:")) {
      if (current.length > 0) {
        results.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  return results.map(processStem);
}

// TODO: Consolidate this with `parseNounStemFile`.
export function parseVerbStemFile(filePath: string): Lemma[] {
  const content = fs.readFileSync(filePath).toString();
  const lines = content.split("\n");
  const results: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line[0] === "#") {
      continue;
    }
    if (line[0] === "@") {
      console.warn("Skipping @ line for debugging. HANDLE THIS LATER!");
      continue;
    }
    if (line.length === 0) {
      continue;
    }
    assert(line[0] === ":", line[0]);
    if (line.startsWith(":le:")) {
      if (current.length > 0) {
        results.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length > 0) {
    results.push(current);
  }
  return results.map(processStem);
}

function processStem(lines: string[]): Lemma {
  assert(lines.length > 1);
  assert(lines[0].startsWith(":le:"));
  const stems: Stem[] = [];
  const irregulars: IrregularForm[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s/).filter((p) => p.length > 0);
    assert(parts.length >= 2, JSON.stringify(lines));
    const code = StemCode.parseStrict(parts[0]);
    if (code === "vb" || code === "wd") {
      try {
        irregulars.push({
          form: parts[0].substring(4),
          code,
          ...toInflectionData(parts.slice(1)),
        });
      } catch (e) {
        console.log(lines);
        throw e;
      }
    } else {
      stems.push({
        stem: parts[0].substring(4),
        code,
        inflection: parts[1],
        ...toInflectionData(parts.length >= 3 ? parts.slice(2) : []),
      });
    }
  }
  const result: Lemma = { lemma: lines[0].substring(4).trimEnd() };
  if (stems.length > 0) {
    result.stems = stems;
  }
  if (irregulars.length > 0) {
    result.irregularForms = irregulars;
  }
  return result;
}

export function allNounStems(stemFiles: string[] = NOUN_STEM_FILES): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemPaths = stemFiles.map((f) => root + "/" + f).concat();
  const regulars = stemPaths.flatMap(parseNounStemFile);
  const irregulars = processNomIrregEntries();
  return [...regulars, ...irregulars];
}

export function allVerbStems(stemFiles: string[] = VERB_STEM_FILES): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemPaths = stemFiles.map((f) => root + "/" + f).concat();
  const regulars = stemPaths.flatMap(parseVerbStemFile);
  const irregulars = processVerbIrregEntries();
  return [...regulars, ...irregulars];
}
