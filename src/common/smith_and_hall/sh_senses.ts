import { checkPresent } from "@/common/assert";
import { RawSense, ShSense } from "@/common/smith_and_hall/sh_entry";

const LEVELS = [
  new Set<string>(["A", "B", "C", "D"]),
  new Set<string>(["I", "V", "X"]),
  new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
];

function computeLevel(bulletText: string): number {
  const firstChar = bulletText[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].has(firstChar)) {
      return i + 1;
    }
  }
  return 1;
}

function computeBullet(bulletText: string): string {
  return bulletText === "U" ? " • " : bulletText + ".";
}

export function processRawSense(rawSense: Partial<RawSense>): ShSense {
  const rawBullet = checkPresent(rawSense.bullet).trim();
  const text = checkPresent(rawSense.text);
  const level = computeLevel(rawBullet);
  return { bullet: computeBullet(rawBullet), text, level };
}
