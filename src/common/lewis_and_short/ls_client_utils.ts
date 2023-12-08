const GREEK_BULLET_MAP = new Map<string, string>([
  ["a", "α"],
  ["b", "β"],
  ["g", "γ"],
  ["d", "δ"],
  ["e", "ε"],
  ["z", "ζ"],
]);

/** Returns the expected header bullet for the input. */
export function getBullet(input: string): string {
  if (input[0] !== "(") {
    return input;
  }
  const result = GREEK_BULLET_MAP.get(input[1]);
  if (result === undefined) {
    return input;
  }
  return result;
}
