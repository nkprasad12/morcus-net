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
import path from "path";

const STEMS_SUBDIR = "stemlib/Latin/stemsrc";
const EXCLUDED_STEM_FILES = new Set<string>(["nom.irreg", "vbs.irreg"]);

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
  isVerb?: true;
}

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
  return results.map((lines) => processStem(lines));
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
  return results.map((lines) => processStem(lines, true));
}

function processStem(lines: string[], isVerb?: boolean): Lemma {
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
  if (isVerb === true) {
    result.isVerb = true;
  }
  if (stems.length > 0) {
    result.stems = stems;
  }
  if (irregulars.length > 0) {
    result.irregularForms = irregulars;
  }
  return result;
}

function findStemFiles(mode: "vbs" | "nom"): string[] {
  return fs
    .readdirSync(path.join(envVar("MORPHEUS_ROOT"), STEMS_SUBDIR))
    .filter(
      (fileName) =>
        !EXCLUDED_STEM_FILES.has(fileName) &&
        (fileName.startsWith(mode) || (mode === "nom" && fileName === "ls.nom"))
    )
    .map((fileName) => path.join(STEMS_SUBDIR, fileName));
}

export function allNounStems(stemFiles?: string[]): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemPaths = (stemFiles ?? findStemFiles("nom")).map((fileName) =>
    path.join(root, fileName)
  );
  const regulars = stemPaths.flatMap(parseNounStemFile);
  const irregulars = processNomIrregEntries();
  return [...regulars, ...irregulars];
}

export function allVerbStems(stemFiles?: string[]): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemPaths = (stemFiles ?? findStemFiles("vbs")).map((fileName) =>
    path.join(root, fileName)
  );
  const regulars = stemPaths.flatMap(parseVerbStemFile);
  const irregulars = processVerbIrregEntries();
  return [...regulars, ...irregulars];
}
