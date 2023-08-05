import { assertEqual, checkSatisfies } from "@/common/assert";

const KEPT_EDITOR_NOTE = /\[\*\*[ ]?([^\]])\]/g;
const MISSING_CHAR_NOTE = /\[\*\*[A-Z0-9]+: missing (.+)\]/g;
const REMOVED_EDITOR_NOTE = /\[\*\*[^\]]*\]/g;

const BASE_ENTRY_KEY_PATTERN =
  /^<b>([^<>]+)+<\/b>(?: \([a-zA-Z ,\.(?:<i>)(?:<i\/>)=]+\))?$/;
const MULTI_KEY_PATTERN = /<b>([^<>]+)<\/b>/g;

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
