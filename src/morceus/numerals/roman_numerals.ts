/** The value of a Roman numeral symbol (either case), or 0 for anything else. */
function symbolValue(code: number): number {
  // Clearing bit 5 upper-cases ASCII letters; it maps no other code to these.
  switch (code & ~32) {
    case 73: // I
      return 1;
    case 86: // V
      return 5;
    case 88: // X
      return 10;
    case 76: // L
      return 50;
    case 67: // C
      return 100;
    case 68: // D
      return 500;
    case 77: // M
      return 1000;
  }
  return 0;
}

/** A distinct bit for each "five" symbol (V, L, D), or 0 for other values. */
function fiveBit(value: number): number {
  return value === 5 ? 1 : value === 50 ? 2 : value === 500 ? 4 : 0;
}

/**
 * Parses the input (in either case) as a Roman numeral.
 *
 * The numeral is read left to right as groups. A group is either a run of one
 * symbol (`CCC`) or a subtraction (`IX`, `IIX`):
 *
 * - Runs: up to four of the same symbol, with no limit on `M`. Additive forms
 *   such as `IIII` and `VIIII` are standard in classical texts, so they're
 *   accepted. `V`, `L` and `D` never repeat and appear at most once in the
 *   whole numeral.
 * - Subtraction: only `I`, `X` and `C` subtract, and only from the symbol five
 *   or ten times bigger (`IV`, `IX`, `XL`, `XC`, `CD`, `CM`). Two subtracted
 *   symbols are allowed only before the symbol ten times bigger (`IIX`, `XXC`,
 *   `CCM`); `IIV`, `XXL` and `CCD` are rejected.
 * - Order: values go down. Each group's unit must be smaller than the previous
 *   group's unit, a subtraction's larger symbol must not exceed the previous
 *   unit, and whatever follows a subtraction must be smaller than the
 *   subtracted symbol. So `XIX` is fine, but `VIX`, `XLX` and `DIVI` are not.
 *
 * This rejects Latin words made of numeral letters, such as `id`, `dixi` and
 * `vivi`.
 *
 * @returns the decimal value if the input is a valid Roman numeral, or
 * `undefined` otherwise (including for the empty string).
 */
export function parseRomanNumeral(input: string): number | undefined {
  const n = input.length;
  if (n === 0) {
    return undefined;
  }
  let total = 0;
  // The unit of the previous group; every later group must be below it.
  let lastUnit = Infinity;
  let seenFives = 0;
  let i = 0;
  while (i < n) {
    const value = symbolValue(input.charCodeAt(i));
    if (value === 0) {
      return undefined;
    }
    let j = i + 1;
    while (j < n && symbolValue(input.charCodeAt(j)) === value) {
      j++;
    }
    const run = j - i;
    const valueBit = fiveBit(value);
    if (valueBit !== 0 && (run > 1 || (seenFives & valueBit) !== 0)) {
      return undefined;
    }
    const next = j < n ? symbolValue(input.charCodeAt(j)) : 0;
    if (j < n && next === 0) {
      return undefined;
    }
    if (next > value) {
      // A subtraction, such as `IX`, `IIX` or `XL`.
      if (valueBit !== 0 || value >= lastUnit || next > lastUnit) {
        return undefined;
      }
      const ratio = next / value;
      if (!(ratio === 5 && run === 1) && !(ratio === 10 && run <= 2)) {
        return undefined;
      }
      const nextBit = fiveBit(next);
      if ((seenFives & nextBit) !== 0) {
        return undefined;
      }
      seenFives |= nextBit;
      total += next - run * value;
      i = j + 1;
    } else {
      // An additive run, such as `CCCC`.
      if (value >= lastUnit || (run > 4 && value !== 1000)) {
        return undefined;
      }
      seenFives |= valueBit;
      total += run * value;
      i = j;
    }
    lastUnit = value;
  }
  return total;
}
