import type { CitationStyle } from "@/common/library/library_types";

export type { CitationStyle };

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
  // The theme printed before a declamation (pseudo-Quintilian, Calpurnius).
  ["thema", "Thema"],
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

/** A numbered appendix item such as the Res Gestae's `appendix2`. */
function numberedAppendixLabel(token: string): string | undefined {
  const match = /^appendix(\d+)$/i.exec(token);
  return match === null ? undefined : `Appendix ${match[1]}`;
}

/**
 * Formats a single citation coordinate for display.
 *
 * @param partName The name of the citation level, e.g. `chapter`.
 * @param token The citation token at that level, e.g. `2` or `pr`.
 * @param parentToken The token one level up, if any (`prologue` in
 * `prologue.pr`).
 * @param citationStyle Optional `CitationStyle` (`"default" | "roman_law"`).
 * @returns E.g. `Chapter 2`, `Praefatio`, or `Principium` for Roman law `pr`.
 */
export function formatSectionLabel(
  partName: string,
  token: string,
  parentToken?: string,
  citationStyle?: CitationStyle
): string {
  if (
    citationStyle === "roman_law" &&
    partName.toLowerCase() === "title" &&
    token === "0"
  ) {
    return "";
  }

  const fromParent = parentNamedLabel(token, parentToken);
  if (fromParent !== undefined) {
    return fromParent;
  }

  if (citationStyle === "roman_law") {
    if (token.toLowerCase() === "pr") {
      return "Principium";
    }
    const compactMatch = /^(\d+[a-z]?)pr$/i.exec(token);
    if (compactMatch !== null) {
      const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
      return `${capitalized} ${compactMatch[1]}, Principium`.trim();
    }
  }

  const named =
    numberedAppendixLabel(token) ??
    NAMED_SECTION_TOKENS.get(token.toLowerCase());
  if (named !== undefined) {
    return named;
  }
  const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
  return `${capitalized} ${token}`.trim();
}

/**
 * Expands compact Roman-law `pr` tokens (e.g. `["1", "1", "1pr"]` -> `["1", "1", "1", "pr"]`).
 */
export function expandRomanLawCompactPrTokens(
  tokens: readonly string[]
): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    const match = /^(\d+[a-z]?)pr$/i.exec(tok);
    if (match !== null) {
      out.push(match[1], "pr");
    } else {
      out.push(tok);
    }
  }
  return out;
}

/**
 * Compacts Roman-law `pr` tokens by attaching `"pr"` directly to a preceding
 * numeric law/chapter token (e.g. `["1", "1", "1", "pr"]` -> `["1", "1", "1pr"]`).
 */
export function compactRomanLawTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    if (
      tok.toLowerCase() === "pr" &&
      out.length > 0 &&
      /^\d+[a-z]?$/i.test(out[out.length - 1])
    ) {
      out[out.length - 1] = `${out[out.length - 1]}pr`;
    } else {
      out.push(tok);
    }
  }
  return out;
}

/**
 * Elides a synthetic `"0"` token at the `"title"` level (Digest Books 30–32)
 * when formatting dot-joined Roman-law citations.
 */
export function elideRomanLawTitleZero(
  tokens: readonly string[],
  partNames?: readonly string[]
): string[] {
  if (!partNames || tokens.length <= 1) {
    return [...tokens];
  }
  const filtered = tokens.filter(
    (tok, i) => !(partNames[i]?.toLowerCase() === "title" && tok === "0")
  );
  return filtered.length > 0 ? filtered : [...tokens];
}

/**
 * Formats a citation token tuple as a dot-joined string, applying Roman-law
 * compact `pr` formatting (`1.1.1pr`) and title-`0` elision (`30.79.1`, `30.1pr`)
 * when `citationStyle === "roman_law"`.
 */
export function formatCitationId(
  tokens: readonly string[],
  citationStyle?: CitationStyle,
  partNames?: readonly string[]
): string {
  if (citationStyle !== "roman_law") {
    return tokens.join(".");
  }
  return compactRomanLawTokens(elideRomanLawTitleZero(tokens, partNames)).join(
    "."
  );
}

/**
 * Computes the canonical section ID (`dotId`, always the raw `secId.join(".")`
 * so corpus `matchText` keys and `#sec-...` target highlights align), the
 * display local gutter label (`localId`), the display gutter prefix (`prefix`),
 * and any compact/elided lookup alias IDs (`aliasIds`) for a section row on a
 * page.
 */
export function formatRomanLawGutter(
  secId: readonly string[],
  pageId: readonly string[],
  citationStyle?: CitationStyle,
  partNames?: readonly string[]
): {
  dotId: string;
  localId: string;
  prefix: string;
  aliasIds: string[];
} {
  const dotId = secId.join(".");
  if (citationStyle !== "roman_law") {
    const localTokens = secId.slice(pageId.length);
    const localId =
      localTokens.length > 0
        ? localTokens.join(".")
        : secId[secId.length - 1] ?? "";
    const prefix = dotId.slice(0, dotId.length - localId.length);
    return { dotId, localId, prefix, aliasIds: [] };
  }

  const expanded = expandRomanLawCompactPrTokens(secId);
  const elided = elideRomanLawTitleZero(expanded, partNames);
  const compact = compactRomanLawTokens(elided);
  const localId = compact[compact.length - 1] ?? "";
  const prefix = compact.length > 1 ? `${compact.slice(0, -1).join(".")}.` : "";

  const aliasSet = new Set<string>();
  const addAlias = (candidate: string) => {
    if (candidate && candidate !== dotId) {
      aliasSet.add(candidate);
    }
  };

  addAlias(compact.join("."));
  addAlias(expanded.join("."));
  addAlias(compactRomanLawTokens(expanded).join("."));
  addAlias(elided.join("."));

  // When a principium opens a divided law (`1.1.1.pr`, `30.0.1.pr`), also
  // register the bare law coordinate (`1.1.1`, `30.1`, `30.0.1`) as an alias
  // so jumping to `30.79` or `1.1.1` lands on the start of the law.
  if (
    expanded[expanded.length - 1]?.toLowerCase() === "pr" &&
    expanded.length > pageId.length + 1
  ) {
    const parentLaw = expanded.slice(0, -1);
    addAlias(parentLaw.join("."));
    addAlias(elideRomanLawTitleZero(parentLaw, partNames).join("."));
  }

  return { dotId, localId, prefix, aliasIds: Array.from(aliasSet) };
}

/**
 * Expands a user citation query into candidate lookup/jump strings for
 * Roman-law works, covering compact `pr` (`1.1.1pr` <-> `1.1.1.pr`) and
 * Digest Books 30–32 title-`0` elision (`30.79.1` <-> `30.0.79.1`,
 * `30.1pr` <-> `30.0.1.pr` / `30.0.1pr`).
 */
export function expandRomanLawCitationAliases(
  rawQuery: string,
  partNames?: readonly string[]
): string[] {
  const cleaned = rawQuery
    .replace(/^[§\s]+/, "")
    .trim()
    .replace(/:+/g, ".");
  if (!cleaned) return [];

  const rawTokens = cleaned.split(".").filter((t) => t.length > 0);
  if (rawTokens.length === 0) return [];

  const expandedPr = expandRomanLawCompactPrTokens(rawTokens);
  const compactPr = compactRomanLawTokens(expandedPr);

  const candidates = new Set<string>();
  const addCandidate = (toks: readonly string[]) => {
    if (toks.length > 0) {
      candidates.add(toks.join("."));
    }
  };

  addCandidate(rawTokens);
  addCandidate(expandedPr);
  addCandidate(compactPr);

  const titleIdx = partNames
    ? partNames.findIndex((p) => p.toLowerCase() === "title")
    : 1;

  if (titleIdx >= 0) {
    if (expandedPr.length > titleIdx && expandedPr[titleIdx] !== "0") {
      const withZeroExpanded = [
        ...expandedPr.slice(0, titleIdx),
        "0",
        ...expandedPr.slice(titleIdx),
      ];
      addCandidate(withZeroExpanded);
      addCandidate(compactRomanLawTokens(withZeroExpanded));
    } else if (expandedPr.length > titleIdx && expandedPr[titleIdx] === "0") {
      const withoutZeroExpanded = [
        ...expandedPr.slice(0, titleIdx),
        ...expandedPr.slice(titleIdx + 1),
      ];
      addCandidate(withoutZeroExpanded);
      addCandidate(compactRomanLawTokens(withoutZeroExpanded));
    }
  }

  return Array.from(candidates);
}

/**
 * Formats a whole citation (`["1", "2"]`) as one label, joining the label of
 * each level with `, ` (`Act 1, Scene 2`). A play's `prologue` act is left
 * out before its own prologue scene, so `prologue.pr` reads `Prologus` and
 * Hecyra's `prologue.pr2` `Prologus 2`, not `Prologus, Prologus 2`; likewise
 * Livy's `per.49` reads `Periocha 49`, not `Periochae, Periocha 49`.
 *
 * When `citationStyle === "roman_law"`, `"pr"` is labelled `"Principium"` and
 * synthetic `Title 0` levels (Digest Books 30–32) are omitted.
 */
export function formatSectionPath(
  partNames: readonly string[],
  tokens: readonly string[] | string,
  citationStyle?: CitationStyle
): string {
  const rawTokens =
    typeof tokens === "string"
      ? tokens
          .trim()
          .split(".")
          .filter((t) => t.length > 0)
      : tokens;

  const resolvedTokens =
    citationStyle === "roman_law" && rawTokens.length < partNames.length
      ? expandRomanLawCompactPrTokens(rawTokens)
      : [...rawTokens];

  const labels = resolvedTokens.map((token, i) =>
    formatSectionLabel(
      partNames[i] ?? `Level ${i + 1}`,
      token,
      resolvedTokens[i - 1],
      citationStyle
    )
  );
  return labels
    .filter(
      (label, i) =>
        label.length > 0 &&
        parentNamedLabel(resolvedTokens[i + 1] ?? "", resolvedTokens[i]) ===
          undefined
    )
    .join(", ");
}
