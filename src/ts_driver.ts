/* istanbul ignore file */

import * as dotenv from "dotenv";
import { checkPresent } from "./common/assert";
import { parse } from "./common/lewis_and_short/ls_parser";
import { XmlNode } from "./common/lewis_and_short/xml_node";
dotenv.config();

const MACRONS = "āēīōūȳÃĒĪÕŪ";
const BREVES = "ăĕĭŏŭўĬ";
const OTHER_ACCENTED = "áïìëèöüúùÿ";
const ALPHA_ACC = MACRONS + BREVES + OTHER_ACCENTED;
const LOWER_CASE = "abcdefghijklmnopqrstuvwxyz";
const UPPER_CASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHA_REG = LOWER_CASE + UPPER_CASE;
const BASE_CHARS = new Set(ALPHA_ACC + ALPHA_REG + " '");
const SPLITS = [", ", " (", "; "];

function rawOrths(root: XmlNode): string[] {
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

function isRegularOrth(orth: string): boolean {
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
    .replaceAll("u͡s", "us");
}

function getOrths(root: XmlNode): (string | undefined)[] {
  const orths = rawOrths(root)
    .flatMap(splitOrth)
    .map(removeHapaxMark)
    .map(replaceWeirds);
  if (orths.length === 0) {
    console.log("Got 0 orths");
    return orths;
  }
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
      updated = orths[0] + updated;
    }
    const last = nonAlphas.length - 1;
    if (
      nonAlphas[last][0] === "-" &&
      nonAlphas[last][1] === orths[i].length - 1
    ) {
      // TODO: Merge this correctly.
      updated = updated + orths[0];
    }
    orths[i] = updated;
  }

  regulars = orths.map(isRegularOrth);
  const results: (string | undefined)[] = [];
  for (let i = 0; i < orths.length; i++) {
    results.push(regulars[i] ? orths[i] : undefined);
  }
  return results;
}

// const weirdChars = ["^"]; // ",", ";", "/", "[", "†", "(", "(", "=", "?"];
let unhandled = 0;
for (const entry of parse(checkPresent(process.env.LS_PATH))) {
  const orths = getOrths(entry);
  if (orths.includes(undefined)) {
    console.log(rawOrths(entry));
    unhandled += 1;
  }
}
console.log(unhandled);
