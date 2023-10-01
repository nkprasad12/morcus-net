import { assertEqual } from "@/common/assert";

/**
 * A string containing all the macron and tilde characters.
 */
export const MACRONS = "āēīōūȳĀĒĪŌŪÃÕ";

/**
 * A string containing all the breve and ў characters.
 */
export const BREVES = "ăĕĭŏŭўĂĬĔŎŬ";

/**
 * A namespace containing functions related to vowels.
 */
export namespace Vowels {
  /**
   * The possible lengths of a vowel.
   */
  export type Length = "Long" | "Short" | "Ambiguous";

  /**
   * Returns the length of a vowel.
   * @param input - The vowel to check.
   * @returns The length of the vowel.
   */
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
}
