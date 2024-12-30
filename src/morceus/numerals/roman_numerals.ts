import { assertEqual } from "@/common/assert";

function valueOf(c: string): number | undefined {
  switch (c) {
    case "M":
      return 1000;
    case "D":
      return 500;
    case "C":
      return 100;
    case "L":
      return 50;
    case "X":
      return 10;
    case "V":
      return 5;
    case "I":
      return 1;
  }
}

/**
 * Parses the input string as a Roman numeral.
 *
 * @returns the decimal value if the input is a valid
 * Roman numeral, or `undefined` otherwise.
 */
export function parseRomanNumeral(rawInput: string): number | undefined {
  const input = rawInput.toUpperCase();

  let total = 0;
  let lastAdded: number | undefined = undefined;

  let i = 0;
  for (; i < input.length - 1; i++) {
    const n = valueOf(input[i]);
    if (n === undefined) {
      return undefined;
    }
    const m = valueOf(input[i + 1]);
    if (m === undefined) {
      return undefined;
    }
    // Numbers must go in descending order.
    if (Math.max(n, m) > (lastAdded ?? Infinity)) {
      return undefined;
    }
    lastAdded = Math.max(n, m);
    if (n > m) {
      // Just consume n, because m could be subtractive. For example,
      // consider XIV and i = 0, where n -> X = 10 and m -> I = 1.
      total += n;
    } else if (n === m) {
      // We can consume both, since we can't have two subtractive characters.
      total += n + m;
      i++;
    } else {
      total += m - n;
      i++;
    }
  }
  // Consume the last character, if needed.
  if (i < input.length) {
    assertEqual(i, input.length - 1);
    const n = valueOf(input[i]);
    if (n === undefined) {
      return undefined;
    }
    if (n > (lastAdded ?? Infinity)) {
      return undefined;
    }
    total += n;
  }

  return total;
}
