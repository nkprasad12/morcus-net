import { foldLatinLigaturesAndNumerals } from "@/common/text_cleaning";

// The last two are tilde characters. This look the same in VS code.
export const MACRONS = "āēīōūȳĀĒĪŌŪȲÃÕ";
export const BREVES = "ăĕĭŏŭўĂĬĔŎŬY̆";
export const MACRON_COMBINER = "\u0304";
export const BREVE_COMBINER = "\u0306";
const TILDE_COMBINER = "\u0303";
const COMBINING_MARK_CHAR_RE = /\p{M}/u;
const NON_ASCII_RE = /[\u0080-\uffff]/;
const UNMARKED_VOWELS = "aeiouyAEIOUY";

export type VowelLength = "Long" | "Short" | "Ambiguous";

/** Exported only for testing. Do not use directly. */
export function getVowelLength(input: string): VowelLength {
  if (input.length !== 1) {
    return "Ambiguous";
  }
  if (MACRONS.includes(input)) {
    return "Long";
  }
  if (BREVES.includes(input)) {
    return "Short";
  }
  return "Ambiguous";
}

function extractLengthCombiners(input: string): [string, number[], number[]] {
  const normalized = NON_ASCII_RE.test(input)
    ? foldLatinLigaturesAndNumerals(input).normalize("NFD")
    : input;
  let resultString = "";
  const long: number[] = [];
  const short: number[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    // Morpheus uses these for diareses. We can ignore these here.
    if (ch === "+") {
      continue;
    }
    if (ch === MACRON_COMBINER || ch === "_" || ch === TILDE_COMBINER) {
      long.push(resultString.length - 1);
    } else if (ch === BREVE_COMBINER || ch === "^") {
      short.push(resultString.length - 1);
    } else if (COMBINING_MARK_CHAR_RE.test(ch)) {
      // Ignore non-length combining marks (acute ictus, diaeresis, circumflex,
      // underdot, overline, stroke, etc.) so base letters stay aligned.
      continue;
    } else {
      resultString += ch;
    }
  }
  return [resultString, long, short];
}

/**
 * Determines whether the inputs have compatible vowel length. These
 * are assumed to differ only on capitalization and vowel length.
 */
export function haveCompatibleVowelLength(
  firstRaw: string,
  secondRaw: string
): boolean {
  const [first, firstLongs, firstShorts] = extractLengthCombiners(firstRaw);
  const [second, secondLongs, secondShorts] = extractLengthCombiners(secondRaw);
  if (first.length !== second.length) {
    return false;
  }
  for (let k = 0; k < first.length; k++) {
    const firstLength = getVowelLength(first[k]);
    const secondLength = getVowelLength(second[k]);
    const firstLong = firstLength === "Long" || firstLongs.includes(k);
    const secondLong = secondLength === "Long" || secondLongs.includes(k);
    const firstShort = firstLength === "Short" || firstShorts.includes(k);
    const secondShort = secondLength === "Short" || secondShorts.includes(k);
    if ((firstLong && firstShort) || (secondLong && secondShort)) {
      // In this case, one of the letters were marked as either long or short.
      // This means it's automatically compatible with the other one.
      continue;
    }
    const hasLong = firstLong || secondLong;
    const hasShort = firstShort || secondShort;
    if (hasLong && hasShort) {
      return false;
    }
  }
  return true;
}

export function isVowel(input: string): boolean {
  return (
    UNMARKED_VOWELS.includes(input) ||
    MACRONS.includes(input) ||
    BREVES.includes(input)
  );
}

export function isUnmarkedVowel(input: string): boolean {
  return UNMARKED_VOWELS.includes(input);
}

export function combineLengthCombiners(input: string): string {
  const n = input.length;
  let pendingVowel = isUnmarkedVowel(input[0]) ? input[0] : undefined;
  let result = pendingVowel ? "" : input[0];
  for (let i = 1; i < n; i++) {
    const c = input[i];
    const isCombiner = c === MACRON_COMBINER || c === BREVE_COMBINER;
    if (isCombiner) {
      if (pendingVowel !== undefined) {
        result += (pendingVowel + c).normalize("NFC");
        pendingVowel = undefined;
      }
      // If there's no pending vowel, then just skip the combiner.
      continue;
    }
    if (pendingVowel !== undefined) {
      // Since there's no combiner, move the pending vowel to the result.
      result += pendingVowel;
      pendingVowel = undefined;
    }
    if (isUnmarkedVowel(c)) {
      pendingVowel = c;
    } else {
      result += c;
    }
  }
  // Add on any leftover pending vowel if we have one.
  return result + (pendingVowel ?? "");
}

export function stripCombiners(input: string): string {
  return input.replaceAll(/[\u0304\u0306]/g, "");
}
