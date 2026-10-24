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

/**
 * Quotation renditions: the kind of quotation marks (`single`, `double`) and
 * `merge`, which marks a quotation continued from the previous one:
 * <l>blah blah <q>blah </q></l>
 * <l><q rend="merge">blah</q> blah</l>
 * Continued quotes are very hard to handle, so these are all ignored.
 */
export const QUOTE_RENDS: ReadonlySet<string> = new Set([
  "merge",
  "double",
  "single",
]);

/** Rendition tokens that are recognised but deliberately not rendered. */
const KNOWN_REND = new Set<string>([
  "bold",
  "sup",
  ...QUOTE_RENDS,
  // Letter-spaced (Sperrdruck) quotations in the 2026 upstream re-encoding.
  "spacing",
  // Added upstream to `<head>`s and `<label>`s, which render as headings.
  "align(center)",
  // Short verse fragments set flush right in the edition (De Oratore 3).
  "align(right)",
]);

const ALL_KNOWN_REND = new Set<string>([...HANDLED_REND, ...KNOWN_REND]);

function isVisualGap(rend: string): boolean {
  return /^[.*](\s*[.*])*$/.test(rend.trim());
}

/**
 * The tokens of a `rend` value. Upstream joins several renditions with `;`,
 * e.g. `rend="single; smallcaps"` on a quotation that is also small caps.
 */
export function rendTokens(rend: string): string[] {
  return rend
    .split(";")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/** Whether `rend` is absent or has tokens, every one of them in `known`. */
export function allRendTokensIn(
  rend: string | undefined,
  known: ReadonlySet<string | undefined>
): boolean {
  if (rend === undefined) {
    return true;
  }
  const tokens = rendTokens(rend);
  return tokens.length > 0 && tokens.every((token) => known.has(token));
}

export function isKnownRend(rend: string | undefined): boolean {
  return (
    (rend !== undefined && isVisualGap(rend)) ||
    allRendTokensIn(rend, ALL_KNOWN_REND)
  );
}

export function isHandledRend(rend: string | undefined): boolean {
  return (
    rend !== undefined && rendTokens(rend).some((t) => HANDLED_REND.has(t))
  );
}

/** Whether `rend` is present and every one of its tokens is rendered. */
export function isFullyHandledRend(rend: string | undefined): boolean {
  return rend !== undefined && allRendTokensIn(rend, HANDLED_REND);
}

/**
 * The rendition to emit for a handled `rend`: its handled tokens, with
 * upstream aliases folded, space-separated. A single-token `rend` maps to a
 * single token, so works without compound renditions are unaffected.
 */
export function canonicalRend(rend: string): string {
  const tokens = rendTokens(rend)
    .filter((token) => HANDLED_REND.has(token))
    .map((token) => REND_ALIASES.get(token) ?? token);
  return Array.from(new Set(tokens)).join(" ");
}
