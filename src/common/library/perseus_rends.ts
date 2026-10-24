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
  // Upstream spellings of the renditions above; see `canonicalRend`.
  "align(indent)",
  "align(blockquote)",
]);

/**
 * Renditions that upstream spells more than one way, mapped to the rendition
 * the pipeline emits. canonical-latinLit is migrating `rend="indent"` to
 * `rend="align(indent)"` (and `blockquote` likewise); both must render alike.
 */
const REND_ALIASES = new Map<string, string>([
  ["ital", "italic"],
  ["italics", "italic"],
  ["align(indent)", "indent"],
  ["align(blockquote)", "blockquote"],
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
  "merge;double",
  "double",
  "double; merge",
  "single",
  "single; merge",
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

/** The rendition to emit for a handled `rend`, folding upstream aliases. */
export function canonicalRend(rend: string): string {
  return REND_ALIASES.get(rend) ?? rend;
}
