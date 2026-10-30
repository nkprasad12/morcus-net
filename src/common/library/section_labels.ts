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
  ["praef", "Praefatio"],
  ["prologus", "Prologus"],
  // A play's prologue (Plautus, Terence), cited as an act or a scene.
  ["prologue", "Prologus"],
  ["epilogus", "Epilogus"],
  ["appendix", "Appendix"],
  ["index", "Index"],
  ["sigla", "Sigla"],
  ["arg", "Argumentum"],
  ["fragments", "Fragmenta"],
  // Livy's Periochae, gathered into one group by `collectPeriochae`.
  ["per", "Periochae"],
]);

/**
 * The label of a token that is named by its parent rather than its level:
 *
 * - A scene `pr` (or `pr1`, `pr2`) inside a play's `prologue` act is the
 *   prologue itself, not a praefatio: Plautus' and Terence's `prologue.pr`,
 *   Terence's Hecyra `prologue.pr1` and `prologue.pr2`.
 * - A chapter `N` of Livy's `per` group is the periocha of book N:
 *   `per.49` is `Periocha 49`.
 *
 * The parent's own label is then left out of a whole citation
 * (`formatSectionPath`).
 */
function parentNamedLabel(
  token: string,
  parentToken: string | undefined
): string | undefined {
  if (parentToken?.toLowerCase() === "per") {
    return `Periocha ${token}`;
  }
  if (parentToken?.toLowerCase() !== "prologue") {
    return undefined;
  }
  const match = /^pr(\d*)$/i.exec(token);
  if (match === null) {
    return undefined;
  }
  return match[1] === "" ? "Prologus" : `Prologus ${match[1]}`;
}

/**
 * Formats a single citation coordinate for display.
 *
 * @param partName The name of the citation level, e.g. `chapter`.
 * @param token The citation token at that level, e.g. `2` or `pr`.
 * @param parentToken The token one level up, if any (`prologue` in
 * `prologue.pr`), for tokens whose meaning depends on it.
 * @returns E.g. `Chapter 2`, or `Praefatio` for a named token.
 */
export function formatSectionLabel(
  partName: string,
  token: string,
  parentToken?: string
): string {
  const named =
    parentNamedLabel(token, parentToken) ??
    NAMED_SECTION_TOKENS.get(token.toLowerCase());
  if (named !== undefined) {
    return named;
  }
  const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
  return `${capitalized} ${token}`.trim();
}

/**
 * Formats a whole citation (`["1", "2"]`) as one label, joining the label of
 * each level with `, ` (`Act 1, Scene 2`). A play's `prologue` act is left
 * out before its own prologue scene, so `prologue.pr` reads `Prologus` and
 * Hecyra's `prologue.pr2` `Prologus 2`, not `Prologus, Prologus 2`; likewise
 * Livy's `per.49` reads `Periocha 49`, not `Periochae, Periocha 49`.
 */
export function formatSectionPath(
  partNames: readonly string[],
  tokens: readonly string[]
): string {
  const labels = tokens.map((token, i) =>
    formatSectionLabel(partNames[i] ?? `Level ${i + 1}`, token, tokens[i - 1])
  );
  return labels
    .filter(
      (_, i) => parentNamedLabel(tokens[i + 1] ?? "", tokens[i]) === undefined
    )
    .join(", ");
}
