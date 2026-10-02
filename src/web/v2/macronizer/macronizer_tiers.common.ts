import type { MacronizedConfidence, MacronizedWord } from "@/web/api_routes";

/**
 * Attention tiers for macronized words:
 * - 0: Plain (unambiguous single Morceus form, not user-edited)
 * - 1: Unresolved (multiple forms, no POS-tagger suggestion; includes all-caps Roman numeral flags)
 * - 2: Weak suggestion (Pass 2 morphology-only fallback match)
 * - 3: Tied suggestion (Pass 1 matched multiple forms; first chosen)
 * - 4: Confident suggestion (Pass 1 matched a single form)
 * - 5: Unknown (0 Morceus forms)
 */
export type MacronizerTier = 0 | 1 | 2 | 3 | 4 | 5;

export const VOWELS = new Set([
  "a",
  "e",
  "i",
  "o",
  "u",
  "y",
  "A",
  "E",
  "I",
  "O",
  "U",
  "Y",
]);

export const COMBINING_MACRON = "\u0304";
export const COMBINING_BREVE = "\u0306";

export interface SplitMacronsResult {
  base: string;
  chars: string[];
  longAt: Set<number>;
}

/**
 * Splits a macronized or plain word into its macron-stripped NFD base
 * characters and the set of 0-based character indices carrying a macron.
 * Unlike `stripDiacritics` (`common/text_cleaning.ts`), only macrons and
 * breves are removed, so other marks (a diaeresis) stay in the base.
 */
export function splitMacrons(form: string): SplitMacronsResult {
  const nfd = form.normalize("NFD");
  const chars: string[] = [];
  const longAt = new Set<number>();
  for (const ch of nfd) {
    if (ch === COMBINING_MACRON) {
      if (chars.length > 0) {
        longAt.add(chars.length - 1);
      }
    } else if (ch !== COMBINING_BREVE) {
      chars.push(ch);
    }
  }
  return { base: chars.join(""), chars, longAt };
}

const FORMAT_CHARS_RE = /\p{Cf}/gu;

/**
 * Splits a `MacronizedWord.word` like `splitMacrons`, after removing format
 * characters such as soft hyphens. Morceus forms never contain them, so this
 * is the base whose character positions match the forms' macron positions:
 * use it for vowel checkboxes, `data-orig` and dictionary lookups.
 */
export function wordBase(word: string): SplitMacronsResult {
  return splitMacrons(word.replace(FORMAT_CHARS_RE, ""));
}

/**
 * Reconstructs an NFC-normalized word from a macron-stripped base string and
 * a set of 0-based character indices that should carry a macron.
 */
export function buildFromVowels(
  base: string,
  longAt: ReadonlySet<number>
): string {
  const chars = Array.from(base.normalize("NFD")).filter(
    (ch) => ch !== COMBINING_MACRON && ch !== COMBINING_BREVE
  );
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    out += chars[i];
    if (longAt.has(i)) {
      out += COMBINING_MACRON;
    }
  }
  return out.normalize("NFC");
}

/**
 * Formats a single vowel character as NFC with or without a macron.
 */
export function formatVowelChar(ch: string, isLong: boolean): string {
  return isLong ? (ch + COMBINING_MACRON).normalize("NFC") : ch;
}

/**
 * Strips `#1`, `#2` homograph suffixes from a Morceus lemma for display and
 * dictionary lookup.
 */
export function stripLemmaHomograph(lemma: string): string {
  const hashIdx = lemma.indexOf("#");
  return hashIdx === -1 ? lemma : lemma.slice(0, hashIdx);
}

/**
 * Determines whether a word has a synthetic Roman numeral option (`kind: "numeral"`).
 */
export function hasNumeralOption(word: MacronizedWord): boolean {
  return word.options.some((o) => o.kind === "numeral");
}

/**
 * Maps a `MacronizedWord` to its attention tier (0..5).
 */
export function computeWordTier(word: MacronizedWord): MacronizerTier {
  if (word.options.length === 0) {
    return 5;
  }
  if (word.options.length === 1) {
    return 0;
  }
  if (
    word.suggested === undefined ||
    word.suggested < 0 ||
    word.suggested >= word.options.length
  ) {
    return 1;
  }
  const confidence: MacronizedConfidence = word.confidence ?? "confident";
  switch (confidence) {
    case "weak":
      return 2;
    case "tied":
      return 3;
    case "confident":
      return 4;
  }
}

export type WordDecisionKind = "default" | "chosen" | "edited";

/**
 * Returns the summary tag label for an ambiguous or unknown card.
 */
export function getCardTagInfo(
  word: MacronizedWord,
  tier: MacronizerTier,
  decision: WordDecisionKind
): { label: string; tagClass: string } {
  if (decision === "edited") {
    return { label: "edited", tagClass: "mac-tag-chosen" };
  }
  if (decision === "chosen") {
    return { label: "your choice", tagClass: "mac-tag-chosen" };
  }
  if (tier === 5) {
    return { label: "not in dictionary", tagClass: "mac-tag-unknown" };
  }
  if (tier === 1) {
    if (hasNumeralOption(word)) {
      return {
        label: "possible Roman numeral",
        tagClass: "mac-tag-unresolved",
      };
    }
    return { label: "needs your choice", tagClass: "mac-tag-unresolved" };
  }
  return { label: "auto-picked · to check", tagClass: "mac-tag-auto" };
}
