import { assert, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import {
  InflectionContext,
  toInflectionData,
} from "@/morceus/inflection_data_utils";
import {
  processNomIrregEntries,
  processVerbIrregEntries,
} from "@/morceus/irregular_stems";
import fs from "fs";
import path from "path";

const STEMS_SUBDIR = "latin/stems";

// :le: 	lemma or headword
// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
export type StemCode = "no" | "aj" | "wd" | "vs" | "vb" | "de";
export namespace StemCode {
  export function parse(chunk: string): StemCode | undefined {
    if (chunk.startsWith(":no:")) {
      return "no";
    }
    if (chunk.startsWith(":aj:")) {
      return "aj";
    }
    if (chunk.startsWith(":wd:")) {
      return "wd";
    }
    if (chunk.startsWith(":vs:")) {
      return "vs";
    }
    if (chunk.startsWith(":vb:")) {
      return "vb";
    }
    if (chunk.startsWith(":de:")) {
      return "de";
    }
    return undefined;
  }

  export function parseStrict(chunk: string): StemCode {
    return checkPresent(parse(chunk), "Invalid stem code.");
  }
}

export interface Stem extends InflectionContext {
  code?: StemCode;
  stem: string;
  inflection: string;
}

export interface IrregularForm extends InflectionContext {
  code?: StemCode;
  form: string;
}

export interface Lemma {
  lemma: string;
  stems?: Stem[];
  irregularForms?: IrregularForm[];
  isVerb?: true;
  sourceData?: {
    fileName: string;
    index: number;
    rawLines: string[];
  };
}

export interface ParseLemmaFileOptions {
  collectSourceData?: boolean;
}

export function parseRegularStemFile(
  filePath: string,
  isVerb: boolean,
  options?: ParseLemmaFileOptions
): Lemma[] {
  const content = fs.readFileSync(filePath).toString();
  const lines = content.split("\n");
  const lemmata: Lemma[] = [];

  const makeSourceData = () =>
    options?.collectSourceData
      ? { fileName: filePath, index: lemmata.length, rawLines: [] }
      : undefined;
  let current: [string[], Lemma["sourceData"]] = [[], makeSourceData()];
  const addLemma = () => {
    if (current[0].length > 0) {
      lemmata.push(processStem(current[0], current[1], isVerb));
      current = [[], makeSourceData()];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith(":le:")) {
      addLemma();
    }
    current[1]?.rawLines.push(rawLine);
    if (line.length === 0 || line[0] !== ":") {
      continue;
    }
    current[0].push(line);
  }
  addLemma();
  return lemmata;
}

function processStem(
  lines: string[],
  sourceData?: Lemma["sourceData"],
  isVerb?: boolean
): Lemma {
  assert(lines.length > 1, lines.join("\n"));
  assert(lines[0].startsWith(":le:"));
  const stems: Stem[] = [];
  const irregulars: IrregularForm[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/\s/).filter((p) => p.length > 0);
    assert(parts.length >= 2, JSON.stringify(lines));
    const code = StemCode.parseStrict(parts[0]);
    if (code === "vb" || code === "wd") {
      try {
        irregulars.push({
          form: parts[0].substring(4),
          code,
          ...toInflectionData(parts.slice(1)),
        });
      } catch (e) {
        console.log(lines);
        throw e;
      }
    } else {
      stems.push({
        stem: parts[0].substring(4),
        code,
        inflection: parts[1],
        ...toInflectionData(parts.length >= 3 ? parts.slice(2) : []),
      });
    }
  }
  const result: Lemma = { lemma: lines[0].substring(4).trimEnd() };
  if (isVerb === true) {
    result.isVerb = true;
  }
  if (stems.length > 0) {
    result.stems = stems;
  }
  if (irregulars.length > 0) {
    result.irregularForms = irregulars;
  }
  if (sourceData !== undefined) {
    result.sourceData = sourceData;
  }
  return result;
}

function findStemFiles(mode: "vbs" | "nom"): string[] {
  const parent = mode === "vbs" ? "verbs" : "nominals";
  const subdir = path.join(envVar("MORCEUS_DATA_ROOT"), STEMS_SUBDIR, parent);
  return fs
    .readdirSync(subdir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.join(STEMS_SUBDIR, parent, dirent.name));
}

export function regularStems(
  stemType: "nom" | "vbs",
  stemFiles?: string[],
  options?: ParseLemmaFileOptions
): Lemma[] {
  const root = envVar("MORCEUS_DATA_ROOT");
  const stemPaths = (stemFiles ?? findStemFiles(stemType)).map((fileName) =>
    path.join(root, fileName)
  );
  return stemPaths.flatMap((s) =>
    parseRegularStemFile(s, stemType === "vbs", options)
  );
}

export function allNounStems(stemFiles?: string[]): Lemma[] {
  const regulars = regularStems("nom", stemFiles);
  const irregulars = processNomIrregEntries();
  return [...regulars, ...irregulars];
}

export function allVerbStems(stemFiles?: string[]): Lemma[] {
  const regulars = regularStems("vbs", stemFiles);
  const irregulars = processVerbIrregEntries();
  return [...regulars, ...irregulars];
}
