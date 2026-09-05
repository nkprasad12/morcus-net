const HANDLED_REND = new Set<string>([
  "indent",
  "ital",
  "italic",
  "italics",
  "blockquote",
  "uppercase",
  "smallcaps",
  "7",
  "overline",
]);
// `merge` occurs infrequently, when we have a continued quote:
// <l>blah blah <q>blah </q></l>
// <l><q rend="merge">blah</q> blah</l>
// so the `merge` is supposed to indicate that the quote is merged with the
// previous quote.
// This is very hard to handle, so we just ignore it.
const KNOWN_REND = new Set([
  undefined,
  "bold",
  "sup",
  "merge",
  "align(indent)",
  "merge;double",
  "double",
  "double; merge",
  "single",
  "single; merge",
  "align(blockquote)",
]);

function isVisualGap(rend: string): boolean {
  return /^[.*](\s*[.*])*$/.test(rend.trim());
}

export function isKnownRend(rend: string | undefined): boolean {
  return (
    isHandledRend(rend) ||
    KNOWN_REND.has(rend) ||
    (rend !== undefined && isVisualGap(rend))
  );
}

export function isHandledRend(rend: string | undefined): boolean {
  return HANDLED_REND.has(rend ?? "");
}
