import { assert, assertEqual, checkPresent } from "@/common/assert";
import fs from "fs";

export type PosType = "no" | "aj";
export interface Stem {
  stem: string;
  inflection: string;
  other?: string;
}
export interface Lemma {
  lemma: string;
  pos: PosType;
  stems: Stem[];
}

export function parseStemFile(filePath: string): Lemma[] {
  const content = fs.readFileSync(filePath).toString();
  const lines = content.split("\n");
  const results: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const isBreak = line.trim().length === 0;
    if (isBreak) {
      if (current.length > 0) {
        results.push(current);
        current = [];
      }
      continue;
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
  throw Error("Unexpected chunk: " + chunk);
}

function processStem(lines: string[]): Lemma {
  assert(lines.length > 1, lines.join("\n"));
  assert(lines[0].startsWith(":le:"));
  const stems: Stem[] = [];
  let pos: PosType | undefined = undefined;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s/).filter((p) => p.length > 0);
    assert(parts.length >= 2, line);
    const candidatePos = findPos(parts[0]);
    if (pos === undefined) {
      pos = candidatePos;
    } else {
      assertEqual(pos, candidatePos);
    }
    stems.push({
      stem: parts[0].substring(4),
      inflection: parts[1],
      other: parts.length >= 3 ? parts.slice(2).join(" ") : undefined,
    });
  }

  return {
    lemma: lines[0].substring(4),
    pos: checkPresent(pos),
    stems,
  };
}
