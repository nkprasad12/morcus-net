import { assert, assertEqual, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { toInflectionData } from "@/morceus/inflection_data_utils";
import {
  Lemma,
  StemCode,
  type IrregularForm,
  type Stem,
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

function parseInflectionClass(chunks: string[]): string | undefined {
  const templates = EXPANDED_TEMPLATES.get();
  for (const chunk of chunks) {
    if (templates.has(chunk)) {
      return chunk;
    }
  }
  return undefined;
}

export function processIrregEntry(entry: string[]): Lemma {
  const irregulars: IrregularForm[] = [];
  const regulars: Stem[] = [];

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
        stem: templateData[0],
        inflection: templateData[1],
      });
      continue;
    }

    // Analysis depends on the stem code. See the type definition for the
    // requirements of each stem code.
    const code = StemCode.parse(parts[0]);
    if (code === "no" || code === "aj" || code === "vs" || code === "de") {
      const stem = parts[0].substring(4).replaceAll("-", "");
      const theRest = parts.slice(1);
      const template = checkPresent(parseInflectionClass(theRest));
      const grammaticalData = theRest.filter((c) => c !== template);
      // Nouns / Adjectives / Verb stems must have an inflectional class.
      assertEqual(grammaticalData.length, theRest.length - 1);
      const context = toInflectionData(grammaticalData);
      if (code === "no") {
        // Nouns must have a gender.
        checkPresent(context.grammaticalData.gender);
      }
      regulars.push({ code, stem, inflection: template, ...context });
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
    stems: regulars.length > 0 ? regulars : undefined,
    irregularForms: irregulars.length > 0 ? irregulars : undefined,
  };
}

export function processNomIrregEntries(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), NOM_PATH)
) {
  return parseEntries(filePath).map(processIrregEntry);
}

export function processVerbIrregEntries(
  filePath: string = path.join(envVar("MORPHEUS_ROOT"), VERB_PATH)
) {
  return parseEntries(filePath).map(processIrregEntry);
}
