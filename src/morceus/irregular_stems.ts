import { assert, assertEqual, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import type { Lemma, PosType, Stem } from "@/morceus/stem_parsing";
import { readFileSync } from "fs";
import path from "path";

const NOM_PATH = "stemlib/Latin/stemsrc/irreg.nom.src";
// @ts-expect-error
const VERB_PATH = "stemlib/Latin/stemsrc/irreg.vbs.src";

export function parseEntries(filePath: string): string[][] {
  const contents = readFileSync(filePath).toString().split("\n");
  const results: string[][] = [];
  let currentLemma: string[] = [];
  for (const rawLine of contents) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith(":le:")) {
      currentLemma.length > 0 && results.push(currentLemma);
      currentLemma = [line];
      continue;
    }
    currentLemma.push(line);
  }
  currentLemma.length > 0 && results.push(currentLemma);
  return results;
}

function includesAny(input: string, posList: PosType[]): PosType | undefined {
  for (const pos of posList) {
    if (input.includes(pos)) {
      return pos;
    }
  }
}

function resolvePos(input: string): PosType {
  if (input.includes("irreg_adj")) {
    return "aj";
  }
  if (input.includes("irreg_nom")) {
    return "no";
  }
  const exactMatch = includesAny(input, [
    "pron3",
    "numeral",
    "demonstr",
    "interrog",
    "indef",
    "rel_pron",
  ]);
  return checkPresent(exactMatch, `Could not parse input: ${input}`);
}

function splitNomIrregLine(line: string): string[] {
  const tabChunks = line
    .split("\t")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (tabChunks.length === 2) {
    return tabChunks;
  }
  if (tabChunks.length > 2) {
    return [tabChunks[0], tabChunks.slice(1).join(" ")];
  }
  const firstSpace = line.indexOf(" ");
  assert(firstSpace !== -1);
  return [line.substring(0, firstSpace), line.substring(firstSpace + 1)];
}

export function processEntry(entry: string[]): Lemma {
  assert(entry[0].startsWith(":le:"));
  const lemma = entry[0].substring(4);
  const stems: Stem[] = [];
  for (const line of entry.slice(1)) {
    const lineChunks = splitNomIrregLine(line);
    assertEqual(lineChunks.length, 2, `"Line: ${line}"`);
    const [first, second] = lineChunks;
    if (first.includes("@")) {
      const pos = resolvePos(second);
      assert(!first.startsWith(":"));
      const chunks = first.split("@");
      assertEqual(chunks.length, 2);
      stems.push({
        pos,
        stem: chunks[0],
        inflection: chunks[1],
        other: second,
      });
    } else if (first.startsWith(":aj:")) {
      const word = first.slice(4);
      const chunks = second
        .split(" ")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      assert(chunks.length === 1 || chunks.length === 2, second);
      stems.push({
        pos: "aj",
        stem: word,
        inflection: chunks[0],
        other: chunks.length > 1 ? chunks[1] : undefined,
      });
    } else if (first.startsWith(":no:")) {
      const word = first.slice(4);
      const chunks = second
        .split(" ")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (chunks[0] === "irreg_nom2") {
        chunks.shift();
      }
      assert(chunks.length >= 1, second);
      stems.push({
        pos: "no",
        stem: word,
        inflection: chunks[0],
        other: chunks.length > 1 ? chunks.slice(1).join(" ") : undefined,
      });
    } else {
      const hasPrefix = first.startsWith(":");
      assert(!hasPrefix || first.startsWith(":wd:"), first);
      const word = first.slice(hasPrefix ? 4 : 0);
      stems.push({
        pos: "wd",
        stem: word,
        inflection: "N/A",
        other: second,
      });
    }
  }
  return { lemma, stems };
}

export function processNomEntries(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), NOM_PATH)
): Lemma[] {
  return parseEntries(filePath).map(processEntry);
}
