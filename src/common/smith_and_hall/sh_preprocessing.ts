import {
  assert,
  assertEqual,
  checkPresent,
  checkSatisfies,
} from "@/common/assert";

const DASH = "----";
const KEPT_EDITOR_NOTE = /\[\*\*[ ]?([^\]])\]/g;
const MISSING_CHAR_NOTE = /\[\*\*[A-Z0-9]+: missing (.+)\]/g;
const REMOVED_EDITOR_NOTE = /\[\*\*[^\]]*\]/g;

const BASE_ENTRY_KEY_PATTERN =
  /^<b>([^<>]+)+<\/b>(?: \([a-zA-Z ,\.(?:<i>)(?:<i\/>)=]+\))?$/;
const MULTI_KEY_PATTERN = /<b>([^<>]+)<\/b>/g;

const UNMARKED_COMPOUNDS = new Map<string, string[]>([
  ["roundhead", ["round", "head"]],
  ["talebearer", ["tale", "bearer"]],
  ["therein", ["there", "in"]],
  ["thimbleful", ["thimble", "ful"]],
  ["waterfall", ["water", "fall"]],
  ["waterman", ["water", "man"]],
  ["woodland", ["wood", "land"]],
]);

type KeyChunk = "D" | "W" | "," | "-" | " ";

const SEPARATORS = [",", "-", " "];

/** Normalizes ---- and combines `/ *` (no space) based articles  */
export interface NormalizedArticle {
  keys: string[];
  text: string[];
}

export function handleEditorNotes(input: string): string {
  return input
    .replace(KEPT_EDITOR_NOTE, "$1")
    .replace(MISSING_CHAR_NOTE, "$1")
    .replace(",[**P2: : ?]", ":")
    .replace(".[**P2: : ?]", ":")
    .replace("[** ----]", "<b>----</b>")
    .replace(REMOVED_EDITOR_NOTE, "");
}

function attemptEntryKeyExtraction(chunk: string): string | null {
  const matches = chunk.match(BASE_ENTRY_KEY_PATTERN);
  if (matches !== null && matches.length === 2) {
    return matches[1];
  }
  return null;
}

function replaceEndPunctuation(chunk: string) {
  if (chunk.endsWith(";") || chunk.endsWith(".")) {
    return chunk.slice(0, -1);
  }

  return chunk;
}

function interpolate(array: string[], inBetween: string): string[] {
  return array
    .flatMap((v, i) => (i === 0 ? v : [inBetween, v]))
    .filter((v) => v !== "");
}

export function decomposeKey(rawKey: string): string[] {
  let result = interpolate(rawKey.split(DASH), "%");
  result = result.flatMap((v) => interpolate(v.split(" -"), "-"));
  result = result.flatMap((v) => interpolate(v.split("-"), "-"));
  result = result.flatMap((v) => interpolate(v.split(", "), ","));
  result = result.flatMap((v) => interpolate(v.split(" "), " "));
  return result.flatMap((v) =>
    v === "%" ? DASH : interpolate(UNMARKED_COMPOUNDS.get(v) || [v], "-")
  );
}

function keyParts(rawKey: string): { roles: KeyChunk[]; chunks: string[] } {
  const chunks = decomposeKey(rawKey);
  const roles = chunks.map((c) =>
    c === "," || c === " " || c === "-" ? c : c === DASH ? "D" : "W"
  );
  return { roles, chunks };
}

export function extractEntryKeyFromLine(line: string): string[] {
  const parts = line.split(":");
  const chunk = parts[0];
  const modifiers: ((chunk: string) => string)[] = [
    (s) => s,
    replaceEndPunctuation,
    (s) => s.replaceAll(".:", ":"),
    (s) => s.replaceAll(";", ":"),
  ];
  for (const modifier of modifiers) {
    let attempt = attemptEntryKeyExtraction(modifier(chunk));
    if (attempt !== null) {
      return [attempt];
    }
  }
  const matches = chunk.matchAll(MULTI_KEY_PATTERN);
  const allMatches = [...matches].map((match) => {
    assertEqual(match.length, 2);
    return match[1];
  });
  return checkSatisfies(allMatches, (a) => a.length > 0, "Unhandled: " + chunk);
}

export function parseComboEntries(
  rawEntry: string[],
  lastUndashed?: string[]
): NormalizedArticle & { originalKeys: string[] } {
  const firstLine = rawEntry[0];
  assert(firstLine === "/*" || firstLine.includes("}"));
  const keysPerLine: string[][] = [];
  const keyContent: string[] = [];
  const extraContent: string[] = [];
  let linesConsumed = 0;
  for (let i = 0; i < rawEntry.length; i++) {
    const line = rawEntry[i];
    if (line === "/*" || line === "*/") {
      continue;
    }
    if (line.trim().length === 0) {
      linesConsumed = i;
      break;
    }
    const chunks = line.split("}");
    assert(chunks.length === 2, line);
    keysPerLine.push(extractEntryKeyFromLine(chunks[0]));
    keyContent.push(chunks[0]);
    extraContent.push(...chunks[1].split("{"));
  }

  assert(keysPerLine.length > 1);
  const keys = keysPerLine.reduce(
    (soFar, current) => soFar.concat(current),
    []
  );
  const text = [keyContent.map((s) => s.trim()).join(" ; ")];
  text.push(...extraContent.map((s) => s.trim()).filter((s) => s.length > 0));
  text.push(...rawEntry.slice(linesConsumed));
  return {
    ...expandDashes(keys, lastUndashed || [], text),
    originalKeys: keys,
  };
}

export function replaceDash(dashed: string, undashed: string): string {
  checkPresent(dashed);
  checkPresent(undashed);
  assert(dashed.startsWith(DASH));
  if (dashed === DASH) {
    return undashed;
  }
  if (dashed === "---- ---- ---- over") {
    return "victory, to gain a _ over";
  }

  const dashedParts = keyParts(dashed);
  const undashedParts = keyParts(undashed);

  let result = "";
  let isMatch = true;
  for (let i = 0; i < dashedParts.roles.length; i++) {
    const dashedRole = dashedParts.roles[i];
    const undashedRole = undashedParts.roles[i];
    isMatch =
      undashedRole === undefined ||
      (SEPARATORS.includes(dashedRole) && SEPARATORS.includes(undashedRole)) ||
      (!SEPARATORS.includes(dashedRole) && !SEPARATORS.includes(undashed));
    if (!isMatch) {
      break;
    }

    if (dashedRole === "W") {
      result += dashedParts.chunks[i];
    } else if (dashedRole === "D") {
      result += undashedParts.chunks[i];
    } else if (dashedRole === ",") {
      result += ", ";
    } else {
      result += dashedRole;
    }
  }

  assert(isMatch);
  return result;
}

export function expandDashes(
  keysWithDashes: string[],
  lastUndashedKeys: string[],
  rawText: string[]
): NormalizedArticle {
  const template = keysWithDashes[0].includes(DASH)
    ? lastUndashedKeys[0]
    : keysWithDashes[0];
  const keys = keysWithDashes.map((x) => x);
  const text = rawText.map((x) => x);
  for (let i = 0; i < keysWithDashes.length; i++) {
    const current = keysWithDashes[i];
    if (!current.includes(DASH)) {
      continue;
    }
    try {
      keys[i] = replaceDash(current, template);
    } catch (e) {
      console.log(JSON.stringify(keysWithDashes));
      console.log(JSON.stringify(lastUndashedKeys));
      console.log(JSON.stringify(rawText, undefined, 2));
      throw e;
    }
    let replacements = 0;
    const toBeReplaced = `<b>${current}</b>`;
    for (let j = 0; j < text.length; j++) {
      while (text[j].includes(toBeReplaced)) {
        text[j] = text[j].replace(toBeReplaced, `<b>${keys[i]}</b>`);
        replacements += 1;
      }
    }
    assert(replacements === 1, "Expected exactly one replacement.");
  }

  return { keys, text };
}

export function normalizeArticles(
  rawArticles: string[][]
): NormalizedArticle[] {
  const normalized: NormalizedArticle[] = [];
  let lastUndashed: NormalizedArticle | null = null;
  for (const unnormalized of rawArticles) {
    const firstLine = unnormalized[0];
    if (firstLine === "/*" || firstLine.includes("}")) {
      const result = parseComboEntries(unnormalized, lastUndashed?.keys);
      if (result.originalKeys.filter((k) => k.includes(DASH)).length === 0) {
        lastUndashed = result;
      }
      normalized.push(result);
      continue;
    }
    const keys = extractEntryKeyFromLine(firstLine);
    if (!keys[0].includes(DASH)) {
      // Subsequent keys may still have dashes. but those wil
      // all expand off of the first key.
      lastUndashed = expandDashes(keys, [], unnormalized);
      normalized.push(lastUndashed);
      continue;
    }

    checkPresent(
      lastUndashed,
      "Got a dashed entry without a last undashed entry."
    );
    normalized.push(expandDashes(keys, lastUndashed?.keys!, unnormalized));
  }
  return normalized;
}
