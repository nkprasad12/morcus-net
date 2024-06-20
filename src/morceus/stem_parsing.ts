import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import {
  processNomIrregEntries,
  processVerbIrregEntries,
} from "@/morceus/irregular_stems";
import fs from "fs";

const NOUN_STEM_FILES: string[] = [
  "stemlib/Latin/stemsrc/ls.nom",
  // "stemlib/Latin/stemsrc/nom.livy",
  // And we want to use the rest of the nom.*
];

const VERB_STEM_FILES: string[] = [
  "stemlib/Latin/stemsrc/vbs.latin",
  // We need vbs.latin.irreg too, and all the rest.
];

// :le: 	lemma or headword
// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
export type PosType =
  | "no"
  | "aj"
  | "wd"
  | "vs"
  | "vb"
  | "de"
  // TODO: These should really be split off.
  | "pron3"
  | "numeral"
  | "demonstr"
  | "interrog"
  | "indef"
  | "rel_pron";
export interface Stem {
  pos: PosType;
  stem: string;
  inflection: string;
  other?: string;
}
export interface Lemma {
  lemma: string;
  stems: Stem[];
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
  return results.map(processStem);
}

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
  return results.map(processStem);
}

function findPos(chunk: string): PosType {
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
  throw Error("Unexpected chunk: " + chunk);
}

function processStem(lines: string[]): Lemma {
  assert(lines.length > 1, lines.join("\n"));
  assert(lines[0].startsWith(":le:"), lines.join("\n"));
  const stems: Stem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s/).filter((p) => p.length > 0);
    assert(parts.length >= 2, JSON.stringify(lines));
    stems.push({
      stem: parts[0].substring(4),
      pos: findPos(parts[0]),
      inflection: parts[1],
      other: parts.length >= 3 ? parts.slice(2).join(" ") : undefined,
    });
  }

  return {
    lemma: lines[0].substring(4),
    stems,
  };
}

export function allNounStems(): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemFiles = NOUN_STEM_FILES.map((f) => root + "/" + f).concat();
  return stemFiles.flatMap(parseNounStemFile).concat(processNomIrregEntries());
}

export function allVerbStems(): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemFiles = VERB_STEM_FILES.map((f) => root + "/" + f).concat();
  return stemFiles.flatMap(parseVerbStemFile).concat(processVerbIrregEntries());
}
