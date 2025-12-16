import { assertEqual } from "@/common/assert";

// The last two are tilde characters. This look the same in VS code.
export const MACRONS = "āēīōūȳĀĒĪŌŪȲÃÕ";
export const BREVES = "ăĕĭŏŭўĂĬĔŎŬY̆";
export const MACRON_COMBINER = "\u0304";
export const BREVE_COMBINER = "\u0306";
const UNMARKED_VOWELS = "aeiouyAEIOUY";

export namespace Vowels {
  export type Length = "Long" | "Short" | "Ambiguous";

  /** Exported only for testing. Do not use directly. */
  export function getLength(input: string): Length {
    assertEqual(input.length, 1);
    if (MACRONS.includes(input)) {
      return "Long";
    }
    if (BREVES.includes(input)) {
      return "Short";
    }
    return "Ambiguous";
  }

  function stripCombiners(input: string): [string, number[], number[]] {
    let resultString = "";
    const long: number[] = [];
    const short: number[] = [];
    for (let i = 0; i < input.length; i++) {
      // Morpheus uses these for diareses. We can ignore these here.
      if (input[i] === "+") {
        continue;
      }
      if (input[i] === MACRON_COMBINER || input[i] === "_") {
        long.push(resultString.length - 1);
      } else if (input[i] === BREVE_COMBINER || input[i] === "^") {
        short.push(resultString.length - 1);
      } else {
        resultString += input[i];
      }
    }
    return [resultString, long, short];
  }

  /**
   * Determines whether the inputs have compatible vowel length. These
   * are assumed to differ only on capitalization and vowel length.
   */
  export function haveCompatibleLength(
    firstRaw: string,
    secondRaw: string
  ): boolean {
    const [first, firstLongs, firstShorts] = stripCombiners(firstRaw);
    const [second, secondLongs, secondShorts] = stripCombiners(secondRaw);
    if (first.length !== second.length) {
      return false;
    }
    for (let k = 0; k < first.length; k++) {
      const firstLength = Vowels.getLength(first[k]);
      const secondLength = Vowels.getLength(second[k]);
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
}

export function combineLengthCombiners(input: string): string {
  const n = input.length;
  let pendingVowel = Vowels.isUnmarkedVowel(input[0]) ? input[0] : undefined;
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
    if (Vowels.isUnmarkedVowel(c)) {
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
