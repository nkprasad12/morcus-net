const LEVELS = [
  new Set<string>(["A", "B", "C", "D"]),
  new Set<string>(["I", "V", "X"]),
  new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
];

export function computeLevel(bulletText: string): number {
  const firstChar = bulletText.trimStart()[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].has(firstChar)) {
      return i + 1;
    }
  }
  return 1;
}
