import { assertEqual } from "@/common/assert";

// The last two are tilde characters. This look the same in VS code.
export const MACRONS = "āēīōūȳĀĒĪŌŪÃÕ";
export const BREVES = "ăĕĭŏŭўĂĬĔŎŬ";
export const MACRON_COMBINER = "\u0304";
export const BREVE_COMBINER = "\u0306";

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
    let long: number[] = [];
    let short: number[] = [];
    for (let i = 0; i < input.length; i++) {
      if (input[i] === MACRON_COMBINER) {
        long.push(resultString.length - 1);
      } else if (input[i] === BREVE_COMBINER) {
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
      const hasLong =
        firstLength === "Long" ||
        firstLongs.includes(k) ||
        secondLength === "Long" ||
        secondLongs.includes(k);
      const hasShort =
        firstLength === "Short" ||
        firstShorts.includes(k) ||
        secondLength === "Short" ||
        secondShorts.includes(k);
      if (hasLong && hasShort) {
        return false;
      }
    }
    return true;
  }
}
