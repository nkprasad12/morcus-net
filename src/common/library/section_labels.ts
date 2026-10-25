/**
 * Citation tokens that name a section rather than number it. When a token
 * matches (case-insensitively), the label is the name alone, without the
 * part name: `Book 1, Chapter pr` displays as `Book 1, Praefatio`.
 *
 * Only add tokens whose meaning is the same in every work they appear in.
 * Work-specific codes (e.g. Suetonius's `Jul`, Tibullus's `dm`) and lettered
 * sub-parts (e.g. `4a`) are deliberately absent.
 */
const NAMED_SECTION_TOKENS: ReadonlyMap<string, string> = new Map([
  ["pr", "Praefatio"],
  ["prologus", "Prologus"],
  ["epilogus", "Epilogus"],
  ["appendix", "Appendix"],
  ["index", "Index"],
]);

/**
 * Formats a single citation coordinate for display.
 *
 * @param partName The name of the citation level, e.g. `chapter`.
 * @param token The citation token at that level, e.g. `2` or `pr`.
 * @returns E.g. `Chapter 2`, or `Praefatio` for a named token.
 */
export function formatSectionLabel(partName: string, token: string): string {
  const named = NAMED_SECTION_TOKENS.get(token.toLowerCase());
  if (named !== undefined) {
    return named;
  }
  const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
  return `${capitalized} ${token}`.trim();
}
