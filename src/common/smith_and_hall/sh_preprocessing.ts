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

export function parseComboEntries(rawEntry: string[]): NormalizedArticle {
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
  return expandDashes(keys, [], text);
}

export function replaceDash(template: string, withDash: string): string {
  checkPresent(template);
  checkPresent(withDash);
  // We MUST check whether there is more than one dash and replace those too.
  console.log(withDash + "\n" + template + "\n");
  return withDash.replace(DASH, "FOOO");
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
    keys[i] = replaceDash(template, current);
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
      normalized.push(parseComboEntries(unnormalized));
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
