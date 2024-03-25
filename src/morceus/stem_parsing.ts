import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { processNomEntries } from "@/morceus/irregular_stems";
import fs from "fs";

const STEM_FILES: string[] = [
  "stemlib/Latin/stemsrc/ls.nom",
  "stemlib/Latin/stemsrc/nom.livy",
  // We need to generate the nom.irreg (expand irregular.nom.src using the templates.)
  // And we want to use the rest of the nom.*
];

export type PosType =
  | "no"
  | "aj"
  | "wd"
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

export function parseStemFile(filePath: string): Lemma[] {
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

export function allStems(): Lemma[] {
  const root = envVar("MORPHEUS_ROOT");
  const stemFiles = STEM_FILES.map((f) => root + "/" + f).concat();
  return stemFiles.flatMap(parseStemFile).concat(processNomEntries());
}
