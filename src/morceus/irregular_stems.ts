import { assert, assertEqual, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { toInflectionData } from "@/morceus/inflection_data_utils";
import {
  Lemma,
  StemCode,
  Stem,
  type IrregularForm,
  type IrregularStem,
  type RegularForm,
} from "@/morceus/stem_parsing";
import { EXPANDED_TEMPLATES } from "@/morceus/tables/templates";
import { readFileSync } from "fs";
import path from "path";

const NOM_PATH = "stemlib/Latin/stemsrc/irreg.nom.src";
const VERB_PATH = "stemlib/Latin/stemsrc/irreg.vbs.src";

export function parseEntries(filePath: string): string[][] {
  const contents = readFileSync(filePath).toString().split("\n");
  const results: string[][] = [];
  let currentLemma: string[] = [];
  for (const rawLine of contents) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith(":le:")) {
      currentLemma.length > 0 && results.push(currentLemma);
      currentLemma = [line];
      continue;
    }
    currentLemma.push(line);
  }
  currentLemma.length > 0 && results.push(currentLemma);
  return results;
}

function resolveNounPos(input: string): StemCode {
  if (input.includes("irreg_adj")) {
    return "aj";
  }
  if (input.includes("irreg_nom")) {
    return "no";
  }
  throw new Error(`Could not parse input: ${input}`);
}

function resolveVerbPos(input: string): StemCode {
  if (input.startsWith(":vs:")) {
    return "vs";
  }
  if (input.startsWith(":vb:") || input.includes("irreg_pp")) {
    return "vb";
  }
  throw new Error(`Could not parse input: ${input}`);
}

function splitIrregLine(line: string): string[] {
  const tabChunks = line
    .split("\t")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (tabChunks.length === 2) {
    return tabChunks;
  }
  if (tabChunks.length > 2) {
    return [tabChunks[0], tabChunks.slice(1).join(" ")];
  }
  const firstSpace = line.indexOf(" ");
  assert(firstSpace !== -1, `line: "${line}"`);
  return [line.substring(0, firstSpace), line.substring(firstSpace + 1)];
}

export function processVerbEntry(entry: string[]): Lemma {
  assert(entry[0].startsWith(":le:"), JSON.stringify(entry));
  const lemma = entry[0].substring(4);
  const stems: Stem[] = [];
  for (const line of entry.slice(1)) {
    const hasTag = line.startsWith(":");
    const hasTemplate = line.includes("@");
    const pos = hasTemplate ? "vs" : resolveVerbPos(line);
    const lineChunks = splitIrregLine(line.slice(hasTag ? 4 : 0));
    assertEqual(lineChunks.length, 2, `"Line: ${line}"`);
    const [first, second] = lineChunks;
    if (hasTemplate) {
      const chunks = first.split("@");
      assertEqual(chunks.length, 2);
      stems.push({
        code: pos,
        stem: chunks[0],
        inflection: chunks[1],
        other: second,
      });
    } else if (pos === "vs") {
      const chunks = second
        .split(" ")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (chunks[0].startsWith("irreg_")) {
        chunks.shift();
      }
      assert(chunks.length >= 1, second);
      stems.push({
        code: "vs",
        stem: first,
        inflection: chunks[0],
        other: chunks.length > 1 ? chunks.slice(1).join(" ") : undefined,
      });
    } else {
      stems.push({
        code: pos,
        stem: first,
        inflection: "N/A",
        other: second,
      });
    }
  }
  return { lemma, stems };
}

function parseInflectionClass(chunks: string[]): string | undefined {
  const templates = EXPANDED_TEMPLATES.get();
  for (const chunk of chunks) {
    if (templates.has(chunk)) {
      return chunk;
    }
  }
  return undefined;
}

export function processIrregEntry(entry: string[]): IrregularStem {
  const irregulars: IrregularForm[] = [];
  const regulars: RegularForm[] = [];

  assert(entry[0].startsWith(":le:"));
  const lemma = entry[0].substring(4);

  for (let i = 1; i < entry.length; i++) {
    const line = entry[i];
    const parts = line
      .replaceAll(/\s/g, " ")
      .split(" ")
      .filter((x) => x.length > 0);

    // If we have something that should be expanded by templates - e.g:
    // `discord@decl3_i	irreg_adj3 masc fem neut`
    if (parts[0].includes("@")) {
      assert(!parts[0].startsWith(":"), parts[0]);
      const templateData = parts[0].split("@");
      assertEqual(templateData.length, 2, parts[0]);
      regulars.push({
        ...toInflectionData(parts.slice(1)),
        stem: templateData[0].replaceAll("-", ""),
        template: templateData[1],
      });
      continue;
    }

    // Analysis depends on the stem code. See the type definition for the
    // requirements of each stem code.
    const code = StemCode.parse(parts[0]);
    if (code === "no" || code === "aj") {
      const stem = parts[0].substring(4).replaceAll("-", "");
      const theRest = parts.slice(1);
      const template = checkPresent(parseInflectionClass(theRest));
      const grammaticalData = theRest.filter((c) => c !== template);
      // Nouns and Adjectives must have an inflectional class.
      assertEqual(grammaticalData.length, theRest.length - 1);
      const context = toInflectionData(grammaticalData);
      if (code === "no") {
        // Nouns must have a gender.
        checkPresent(context.grammaticalData.gender);
      }
      regulars.push({ code, stem, template, ...context });
      continue;
    }

    irregulars.push({
      ...toInflectionData(parts.slice(1)),
      code,
      form: parts[0].substring(code === undefined ? 0 : 4).replaceAll("-", ""),
    });
  }
  return {
    lemma,
    regularForms: regulars.length > 0 ? regulars : undefined,
    irregularForms: irregulars.length > 0 ? irregulars : undefined,
  };
}

export function processNomEntry(entry: string[]): Lemma {
  assert(entry[0].startsWith(":le:"));
  const lemma = entry[0].substring(4);
  const stems: Stem[] = [];
  for (const line of entry.slice(1)) {
    const lineChunks = splitIrregLine(line);
    assertEqual(lineChunks.length, 2, `"Line: ${line}"`);
    const [first, second] = lineChunks;
    if (first.includes("@")) {
      const pos = resolveNounPos(second);
      assert(!first.startsWith(":"));
      const chunks = first.split("@");
      assertEqual(chunks.length, 2);
      stems.push({
        code: pos,
        stem: chunks[0],
        inflection: chunks[1],
        other: second,
      });
    } else if (first.startsWith(":aj:")) {
      const word = first.slice(4);
      const chunks = second
        .split(" ")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      assert(chunks.length === 1 || chunks.length === 2, second);
      stems.push({
        code: "aj",
        stem: word,
        inflection: chunks[0],
        other: chunks.length > 1 ? chunks[1] : undefined,
      });
    } else if (first.startsWith(":no:")) {
      const word = first.slice(4);
      const chunks = second
        .split(" ")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (chunks[0] === "irreg_nom2") {
        chunks.shift();
      }
      assert(chunks.length >= 1, second);
      stems.push({
        code: "no",
        stem: word,
        inflection: chunks[0],
        other: chunks.length > 1 ? chunks.slice(1).join(" ") : undefined,
      });
    } else {
      const hasPrefix = first.startsWith(":");
      assert(!hasPrefix || first.startsWith(":wd:"), first);
      const word = first.slice(hasPrefix ? 4 : 0);
      stems.push({
        code: "wd",
        stem: word,
        inflection: "N/A",
        other: second,
      });
    }
  }
  return { lemma, stems };
}

export function processNomIrregEntries(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), NOM_PATH)
): Lemma[] {
  return parseEntries(filePath).map(processNomEntry);
}

export function processNomIrregEntries2(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), NOM_PATH)
) {
  return parseEntries(filePath).map(processIrregEntry);
}

export function processVerbIrregEntries(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), VERB_PATH)
): Lemma[] {
  return parseEntries(filePath).map(processVerbEntry);
}

// console.log(JSON.stringify(processVerbIrregEntries(), undefined, 2));
