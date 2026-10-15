import type {
  MacronizedResult,
  MacronizedWord,
} from "@/macronizer/macronizer_types";
import {
  encodePriorShown,
  encodeSuggestions,
  type DecodedSuggestion,
  type PriorShownEntry,
} from "@/web/v2/macronizer/macronizer_params.server";
import {
  VOWELS,
  buildFromVowels,
  computeWordTier,
  splitMacrons,
  wordBase,
  type MacronizerTier,
  type WordDecisionKind,
} from "@/web/v2/macronizer/macronizer_tiers.common";

export interface ResolvedMacronizerWord {
  wordIndex: number;
  word: MacronizedWord;
  tier: MacronizerTier;
  decision: WordDecisionKind;
  chosenOptionIndex?: number;
  shownForm: string;
  base: string;
  baseChars: string[];
  longAt: Set<number>;
}

export interface MacronizerTierCounts {
  unresolved: number;
  toCheck: number;
  unknown: number;
}

export interface ResolvedMacronizerDocument {
  tokens: (string | ResolvedMacronizerWord)[];
  words: ResolvedMacronizerWord[];
  plainText: string;
  encodedSug: string;
  encodedShown: string;
  counts: MacronizerTierCounts;
}

function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

function filterValidVowelPositions(
  baseChars: readonly string[],
  positions: ReadonlySet<number>
): Set<number> {
  const valid = new Set<number>();
  for (const p of positions) {
    if (p >= 0 && p < baseChars.length && VOWELS.has(baseChars[p])) {
      valid.add(p);
    }
  }
  return valid;
}

function defaultFormForWord(word: MacronizedWord): string {
  if (word.options.length === 0) {
    // As typed (including any macrons), minus format characters, like the
    // forms of known words.
    return word.word.replace(/\p{Cf}/gu, "").normalize("NFC");
  }
  if (word.options.length === 1) {
    return word.options[0].form.normalize("NFC");
  }
  const idx =
    word.suggested !== undefined &&
    word.suggested >= 0 &&
    word.suggested < word.options.length
      ? word.suggested
      : 0;
  return word.options[idx].form.normalize("NFC");
}

/**
 * Computes unchosen attention counts across all resolved words.
 * Words with `decision !== "default"` ("chosen" or "edited") have been
 * resolved by the user and do not count as remaining to review.
 */
export function computeTierCounts(
  words: readonly ResolvedMacronizerWord[]
): MacronizerTierCounts {
  const counts: MacronizerTierCounts = {
    unresolved: 0,
    toCheck: 0,
    unknown: 0,
  };
  for (const w of words) {
    if (w.decision !== "default") {
      continue;
    }
    switch (w.tier) {
      case 1:
        counts.unresolved++;
        break;
      case 2:
      case 3:
      case 4:
        counts.toCheck++;
        break;
      case 5:
        counts.unknown++;
        break;
    }
  }
  return counts;
}

/**
 * Resolves a first-run `MacronizedResult` into display state for rendering.
 * It's Apply with no choices made yet, so the first render and every later
 * Apply go through the same code.
 */
export function resolveInitialResult(
  result: MacronizedResult
): ResolvedMacronizerDocument {
  const suggestions = new Map<number, DecodedSuggestion>();
  let wordIndex = 0;
  for (const token of result) {
    if (typeof token === "string") {
      continue;
    }
    if (token.suggested !== undefined) {
      suggestions.set(wordIndex, {
        index: token.suggested,
        confidence: token.confidence ?? "confident",
      });
    }
    wordIndex++;
  }
  return applyChoices(result, {
    suggestions,
    wordChoices: new Map(),
    vowelSubmissions: new Map(),
  });
}

export interface ApplyChoicesOptions {
  suggestions: ReadonlyMap<number, DecodedSuggestion>;
  priorShown?: ReadonlyMap<number, PriorShownEntry>;
  wordChoices: ReadonlyMap<number, number>;
  vowelSubmissions: ReadonlyMap<number, Set<number>>;
}

/**
 * Pure server-side Apply algorithm:
 * 1. Starts from `analyzeOnly(text)` (`unsuggestedResult`).
 * 2. Overlays first-run suggestions `sug` (validating `k < options.length`).
 * 3. Determines each word's pre-render vowel set and compares against submitted
 *    vowel checkboxes `mN` and radio selections `wN`.
 * 4. Rebuilds resolved word states and the plain macronized text string.
 */
export function applyChoices(
  unsuggestedResult: MacronizedResult,
  options: ApplyChoicesOptions
): ResolvedMacronizerDocument {
  const tokens: (string | ResolvedMacronizerWord)[] = [];
  const words: ResolvedMacronizerWord[] = [];
  const textParts: string[] = [];
  const nextPriorShown = new Map<number, PriorShownEntry>();
  const overlaidResult: MacronizedResult = [];
  let wordIndex = 0;

  for (const token of unsuggestedResult) {
    if (typeof token === "string") {
      tokens.push(token);
      overlaidResult.push(token);
      textParts.push(token);
      continue;
    }

    const n = wordIndex++;
    const sug = options.suggestions.get(n);
    const word: MacronizedWord = {
      word: token.word,
      options: token.options,
    };
    if (
      sug !== undefined &&
      word.options.length > 1 &&
      sug.index >= 0 &&
      sug.index < word.options.length
    ) {
      word.suggested = sug.index;
      word.confidence = sug.confidence;
    }
    overlaidResult.push(word);

    const tier = computeWordTier(word);
    const { base, chars: baseChars } = wordBase(word.word);
    const defaultForm = defaultFormForWord(word);
    const defaultLongs = splitMacrons(defaultForm).longAt;

    const prior = options.priorShown?.get(n);
    let preRenderLongs = defaultLongs;
    if (prior?.kind === "chosen" && prior.optionIndex < word.options.length) {
      preRenderLongs = splitMacrons(
        word.options[prior.optionIndex].form
      ).longAt;
    } else if (prior?.kind === "edited") {
      preRenderLongs = filterValidVowelPositions(
        baseChars,
        prior.longPositions
      );
    }

    const rawWn = options.wordChoices.get(n);
    const validWn =
      rawWn !== undefined &&
      word.options.length > 1 &&
      rawWn >= 0 &&
      rawWn < word.options.length
        ? rawWn
        : undefined;

    const rawMn = options.vowelSubmissions.get(n);
    const submittedLongs =
      rawMn !== undefined
        ? filterValidVowelPositions(baseChars, rawMn)
        : undefined;

    const checkboxesChanged =
      submittedLongs !== undefined &&
      !setsEqual(submittedLongs, preRenderLongs);
    const stayEdited = prior?.kind === "edited" && validWn === undefined;

    let decision: WordDecisionKind = "default";
    let chosenOptionIndex: number | undefined;
    let shownForm = defaultForm;
    let longAt = defaultLongs;

    if (word.options.length !== 1 && (checkboxesChanged || stayEdited)) {
      decision = "edited";
      longAt = submittedLongs ?? preRenderLongs;
      shownForm = buildFromVowels(base, longAt);
      nextPriorShown.set(n, { kind: "edited", longPositions: longAt });
    } else if (validWn !== undefined) {
      decision = "chosen";
      chosenOptionIndex = validWn;
      shownForm = word.options[validWn].form.normalize("NFC");
      longAt = splitMacrons(shownForm).longAt;
      nextPriorShown.set(n, { kind: "chosen", optionIndex: validWn });
    }

    const resolved: ResolvedMacronizerWord = {
      wordIndex: n,
      word,
      tier,
      decision,
      chosenOptionIndex,
      shownForm,
      base,
      baseChars,
      longAt,
    };
    tokens.push(resolved);
    words.push(resolved);
    textParts.push(shownForm);
  }

  return {
    tokens,
    words,
    plainText: textParts.join(""),
    encodedSug: encodeSuggestions(overlaidResult),
    encodedShown: encodePriorShown(nextPriorShown),
    counts: computeTierCounts(words),
  };
}
