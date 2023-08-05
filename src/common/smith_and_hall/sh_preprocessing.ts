const KEPT_EDITOR_NOTE = /\[\*\*[ ]?([^\]]|----)\]/g;
const MISSING_CHAR_NOTE = /\[\*\*[A-Z0-9]+: missing (.+)\]/g;
const REMOVED_EDITOR_NOTE = /\[\*\*[^\]]*\]/g;

const BASE__ENTRY_KEY_PATTERN =
  /<b>([^<>]+)+<\/b>(?: \((?:<i>)?[a-zA-Z ,\.]+(?:<\/i>)?\))?(?:, used as .+)?$/;

export function handleEditorNotes(input: string): string {
  return input
    .replace(KEPT_EDITOR_NOTE, "$1")
    .replace(MISSING_CHAR_NOTE, "$1")
    .replace(",[**P2: : ?]", ":")
    .replace(".[**P2: : ?]", ":")
    .replace(REMOVED_EDITOR_NOTE, "");
}

export function extractEntryKeyFromLine(line: string): string {
  const parts = line.split(":");
  const chunk = parts[0];
  const simpleMatches = chunk.match(BASE__ENTRY_KEY_PATTERN);
  if (simpleMatches === null || simpleMatches.length !== 2) {
    throw new Error("Unhandled: " + chunk);
  }
  return simpleMatches[1];
}
