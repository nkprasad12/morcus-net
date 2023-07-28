import { assertEqual } from "@/common/assert";

// The last two are tilde characters. This look the same in VS code.
export const MACRONS = "āēīōūȳĀĒĪŌŪÃÕ";
export const BREVES = "ăĕĭŏŭўĂĬĔŎŬ";

export namespace Vowels {
  export type Length = "Long" | "Short" | "Ambiguous";

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
