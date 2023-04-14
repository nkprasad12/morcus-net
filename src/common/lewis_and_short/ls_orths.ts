import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { assert } from "../assert";

// const LOWER_CONSONANTS = "bcdfghjklmnpqrstvxz";
// const UPPER_CONSONANTS = "BCDFGHJKLMNPQRSTVXZ";
// const CONSONANTS = LOWER_CONSONANTS + UPPER_CONSONANTS;
const MACRONS = "āēīōūȳÃĒĪÕŪ";
const BREVES = "ăĕĭŏŭўĬ";
const OTHER_ACCENTED = "áïìëèöüúùÿ";
const ALPHA_ACC = MACRONS + BREVES + OTHER_ACCENTED;
const LOWER_CASE = "abcdefghijklmnopqrstuvwxyz";
const UPPER_CASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHA_REG = LOWER_CASE + UPPER_CASE;
const BASE_CHARS = new Set(ALPHA_ACC + ALPHA_REG + " '");
const SPLITS = [", ", " (", "; "];

const ENDINGS_MAP = new Map<string[], string[]>([
  [
    ["-tius", "-tĭus"],
    ["cius", "cĭus"],
  ],
  [
    ["-os", "-ŏs"],
    // Heptăpўlos has "-os" listed as a variant for whatever reason
    ["us", "os"],
  ],
  [["-us"], ["os"]],
  [["-us"], ["is"]],
  [["-on"], ["um"]],
  [["-phus"], ["ptus"]],
  [["-cles"], ["clus"]],
  [["-vos"], ["vus"]],
  [["-nos"], ["nos"]],
  [["-cunque"], ["cumque"]],
  [["-tisco"], ["tesco"]],
]);
const STARTS_MAP = new Map<string[], string[]>([
  [["ădŏl-"], ["ădŭl"]],
  [["adf-"], ["aff"]],
  [["adp-"], ["ap-p"]],
  [["adp-"], ["app"]],
  [["esc-"], ["aesc"]],
]);

export function rawOrths(root: XmlNode): string[] {
  const orths: string[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      continue;
    }
    if (child.name !== "orth") {
      continue;
    }
    if (child.getAttr("type") === "alt") {
      continue;
    }
    orths.push(XmlNode.getSoleText(child));
  }
  return orths;
}

function nonAlphabetics(text: string): [string, number][] {
  const result: [string, number][] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!BASE_CHARS.has(c)) {
      result.push([c, i]);
    }
  }
  return result;
}

export function isRegularOrth(orth: string): boolean {
  const nonAlphas = nonAlphabetics(orth);
  for (const [c, i] of nonAlphas) {
    if (c === "^") {
      continue;
    }
    if (c === "_") {
      continue;
    }
    if (c === "-" && i > 0 && i < orth.length - 1) {
      continue;
    }
    if (["!", "?"].includes(c) && i === orth.length - 1) {
      continue;
    }
    return false;
  }
  return true;
}

function splitOrth(orth: string): string[] {
  let results: string[] = [orth];
  for (const splitter of SPLITS) {
    results = results.flatMap((token) => token.split(splitter));
  }
  return results;
}

function removeHapaxMark(orth: string): string {
  if (orth.startsWith("† ")) {
    return orth.substring(2);
  }
  return orth;
}

function replaceWeirds(orth: string): string {
  // TODO: We have at least one instance `hălĭÆĕtos` where Ae occurs
  // in the middle of a word. We should probably normalize this.
  return orth
    .replaceAll("œ", "ae")
    .replaceAll("Æ", "Ae")
    .replaceAll("o︤︥y", "oy")
    .replaceAll("u͡s", "us")
    .replaceAll(" -", "-")
    .replaceAll("af-f", "aff");
}

export function cleanOrths(orths: string[]): string[] {
  return orths.flatMap(splitOrth).map(removeHapaxMark).map(replaceWeirds);
}

export interface OrthResult {
  orth: string;
  isRegular: boolean;
}

function any(input: boolean[]) {
  for (const item of input) {
    if (item) {
      return true;
    }
  }
  return false;
}

function lastOrthWithEndings(
  orths: string[],
  endings: string[]
): string | undefined {
  const result = orths.filter((orth) =>
    any(endings.map((ending) => orth.endsWith(ending)))
  );
  if (result.length === 0) {
    return undefined;
  }
  return result[result.length - 1];
}

function lastOrthWithStarts(orths: string[], starts: string[]): string {
  const result = orths.filter((orth) =>
    any(starts.map((start) => orth.startsWith(start)))
  );
  assert(result.length > 0, `${orths} ; ${starts}`);
  return result[result.length - 1];
}

export function attachAltEnd(prevOrths: string[], altEnd: string): string {
  assert(altEnd.startsWith("-"));
  let possibleResults: string[] = [];
  for (const [key, endingsList] of ENDINGS_MAP.entries()) {
    if (!key.includes(altEnd)) {
      continue;
    }
    const base = lastOrthWithEndings(prevOrths, endingsList);
    if (base === undefined) {
      continue;
    }
    possibleResults.push(
      base.substring(0, base.length - endingsList[0].length) +
        altEnd.substring(1)
    );
  }
  if (possibleResults.length === 0) {
    return altEnd;
  }
  assert(
    possibleResults.length === 1,
    `orths: ${prevOrths}; end: ${altEnd}; possibleResults: ${possibleResults}`
  );
  return possibleResults[0];
}

function isStartSubstitutable(
  orth: string,
  altStart: string
): string | undefined {
  assert(altStart.endsWith("-"));
  if (altStart.length > orth.length) {
    return undefined;
  }

  let charDiffs: number = 0;
  for (let i = 0; i < altStart.length - 1; i++) {
    const orthChar = orth[i];
    const altChar = altStart[i];
    if (altChar !== orthChar) {
      charDiffs += 1;
    }
    if (charDiffs >= 2) {
      return undefined;
    }
  }
  return (
    altStart.substring(0, altStart.length - 1) +
    orth.substring(altStart.length - 1)
  );
}

function guessAltStartForm(
  prevOrths: string[],
  altStart: string
): string | undefined {
  assert(altStart.endsWith("-"));
  for (const orth of prevOrths) {
    if (orth.endsWith("-")) {
      continue;
    }
    const result = isStartSubstitutable(orth, altStart);
    if (result !== undefined) {
      console.log(`Guessed ${orth} -> ${result}`);
    }
  }
  return undefined;
}

export function attachAltStart(prevOrths: string[], altStart: string): string {
  assert(altStart.endsWith("-"));
  let startsList: string[] | undefined = undefined;
  for (const [key, value] of STARTS_MAP.entries()) {
    if (key.includes(altStart)) {
      startsList = value;
      break;
    }
  }
  if (startsList === undefined) {
    return guessAltStartForm(prevOrths, altStart) || altStart;
  }
  const base = lastOrthWithStarts(prevOrths, startsList);
  return (
    altStart.substring(0, altStart.length - 1) +
    base.substring(startsList[0].length)
  );
}

export function regularizeOrths(inputOrths: string[]): string[] {
  if (inputOrths.length === 0) {
    return [];
  }
  const orths = inputOrths.map((orth) => orth);
  let regulars = orths.map(isRegularOrth);
  const allNonAlphas = orths.map(nonAlphabetics);
  for (let i = 1; i < orths.length; i++) {
    if (regulars[i]) {
      continue;
    }
    if (!regulars[0]) {
      continue;
    }

    const nonAlphas = allNonAlphas[i];
    let updated = orths[i];
    if (nonAlphas[0][0] === "-" && nonAlphas[0][1] === 0) {
      // TODO: Merge this correctly.
      // updated = orths[0] + updated;
      updated = attachAltEnd(orths.slice(0, i), updated);
    }
    const last = nonAlphas.length - 1;
    if (
      nonAlphas[last][0] === "-" &&
      nonAlphas[last][1] === orths[i].length - 1
    ) {
      // TODO: Merge this correctly.
      updated = attachAltStart(orths.slice(0, i), updated);
      // updated = updated + orths[0];
    }
    orths[i] = updated;
  }
  return orths;
}

export function getOrths(root: XmlNode): string[] {
  return regularizeOrths(cleanOrths(rawOrths(root)));
}
