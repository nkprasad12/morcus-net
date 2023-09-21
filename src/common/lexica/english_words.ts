import { readFileSync } from "fs";
import { checkPresent } from "@/common/assert";
import { assert } from "console";

const WORDS = /[A-Za-z]+/g;

function extractAllWords(dbLine: string): string[] {
  if (dbLine === "") {
    return [];
  }
  const result: string[] = [];
  const splitIndex = dbLine.indexOf(":");

  const lemma = dbLine.substring(0, splitIndex);
  const lemmaParts = lemma.split(" ");
  assert(lemmaParts.length > 1);
  result.push(lemmaParts[0]);

  const variants = dbLine.substring(splitIndex + 1);
  result.push(...checkPresent(variants.match(WORDS)));
  return result;
}

/**
 * Loads English words from the AGID list. This can be downloaded at:
 * http://wordlist.aspell.net/other/
 */
function loadEnglishWords(
  rawPath: string = checkPresent(process.env.RAW_ENGLISH_WORDS)
): Set<string> {
  const dbLines = readFileSync(rawPath, "utf8").split("\n");
  const result = new Set<string>();
  dbLines.forEach((line) =>
    extractAllWords(line).forEach((word) => result.add(word))
  );
  return result;
}

let cache: Set<string> | undefined = undefined;

export function getEnglishWords(): Set<string> {
  if (cache === undefined) {
    cache = loadEnglishWords();
  }
  return cache;
}
