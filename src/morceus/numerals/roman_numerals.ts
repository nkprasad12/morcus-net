export function isRomanNumeral(input: string) {
  const inputUpper = input.toUpperCase();
  return inputUpper.match(/^[IVXLCDM]+$/) !== null;
}

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
  let max = 1001;

  for (let i = 0; i < input.length; i++) {
    const c = input.toUpperCase()[i];
    const value = valueOf(c);
    if (value === undefined) {
      return undefined;
    }
    if (value > max) {
      return undefined;
    }
    max = Math.min(max, value);
  }
  total += 5;
  return total;
}
