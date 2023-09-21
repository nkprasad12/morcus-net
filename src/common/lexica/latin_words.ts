import { readFileSync } from "fs";
import { checkPresent } from "@/common/assert";

/** Loads Latin words from a generated list. */
function loadLatinWords(
  rawPath: string = checkPresent(process.env.RAW_LATIN_WORDS)
): Set<string> {
  const dbLines = readFileSync(rawPath, "utf8").split("\n");
  const result = new Set<string>();
  dbLines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      result.add(trimmed);
    }
  });
  return result;
}

let cache: Set<string> | undefined = undefined;

export function getLatinWords(): Set<string> {
  if (cache === undefined) {
    cache = loadLatinWords();
  }
  return cache;
}
