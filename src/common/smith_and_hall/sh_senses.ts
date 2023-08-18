import { checkPresent } from "@/common/assert";
import { RawSense, ShSense } from "@/common/smith_and_hall/sh_entry";

const LEVELS = [
  new Set<string>(["A", "B", "C", "D"]),
  new Set<string>(["I", "V", "X"]),
  new Set<string>(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
];

const SENSE_LEVELS =
  /^([ABCDEFabcdef]|(?:1|2)?[0-9]|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|U|Phr)$/;
const PAREN_SENSE_START = /^\(<i>[abcde]<\/i>\)\./;
const PAREN_SENSE_START_DOT = /^\(<i>[abcde]\.<\/i>\)/;
const NO_ITAL_SENSE_START_DOT = /^\([1-9]\.\)/;
const PAREN_SENSE_START_SPACE = /^\([A-F]\) /;

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

export function splitSense(rawLine: string): RawSense {
  const line = rawLine.trimStart();
  if (PAREN_SENSE_START_DOT.test(line) || PAREN_SENSE_START.test(line)) {
    return {
      bullet: line[4],
      text: line.substring(11),
    };
  }
  if (NO_ITAL_SENSE_START_DOT.test(line)) {
    return {
      bullet: line[1],
      text: line.substring(4),
    };
  }
  if (PAREN_SENSE_START_SPACE.test(line)) {
    return {
      bullet: line[1],
      text: line.substring(3),
    };
  }
  for (const separator of [".", ",", ":"]) {
    const i = line.indexOf(separator);
    const maybeLevel = line.substring(0, i);
    if (SENSE_LEVELS.test(maybeLevel)) {
      return {
        bullet: maybeLevel,
        text: line.substring(i + 1),
      };
    }
  }
  throw Error(line);
}
