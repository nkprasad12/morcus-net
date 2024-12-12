/* istanbul ignore file */

// This module contains utils that were useful when processing morpheus compound words.
// We have since moved all of these into vbs.compounds.latin rather than using the
// same compounding logic, so much of this is now obsolete. However, it may still
// be useful if we have to redo the compounding logic and remake the vbs.compounds.latin file.

import { assert, assertEqual } from "@/common/assert";
import { BREVE_COMBINER, MACRON_COMBINER } from "@/common/character_utils";
import { envVar } from "@/common/env_vars";
import { removeDiacritics } from "@/common/text_cleaning";
import path from "path";
import fs from "node:fs";
import { allVerbStems, type Lemma } from "@/morceus/stem_parsing";
import { arrayMap } from "@/common/data_structures/collect_map";
import { InflectionContext } from "@/morceus/inflection_data_utils";

const PREVERB_INDEX = "stemlib/Latin/rule_files/rawprev.src";
const ALLOWED_PREVERBS = "stemlib/Latin/stemsrc/vbs.cmp.ml";

interface PreverbEntry {
  preverb: string;
  prefix: string;
  assimilated: boolean;
}

interface AllowedPreverb {
  preverb: string;
  lemma: string;
  combined: string;
}

function readMorpheusLines(filePath: string): string[] {
  return fs.readFileSync(filePath).toString().split("\n");
}

function requiresAssimilation(preverb: string, prefix: string): boolean {
  if (preverb.length !== prefix.length) {
    return false;
  }
  const n = preverb.length;
  if (preverb.substring(0, n - 1) !== prefix.substring(0, n - 1)) {
    return false;
  }
  return preverb[n - 1] !== prefix[n - 1];
}

function parsePreverbIndex(filePath: string): PreverbEntry[] {
  return readMorpheusLines(filePath)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const parts = line
        .split(/\s/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      assertEqual(parts.length, 2);
      const preverb = parts[0];
      const prefix = parts[1].replaceAll("_", "");
      return {
        preverb,
        prefix,
        assimilated: requiresAssimilation(preverb, prefix),
      };
    });
}

function parseAllowedPreverbs(filePath: string): AllowedPreverb[] {
  return readMorpheusLines(filePath)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("##"))
    .map<AllowedPreverb>((line) => {
      assert(line.startsWith("#"));
      const parts = line
        .substring(1)
        .split(/[-\s]/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      assertEqual(parts.length, 3);
      return {
        preverb: parts[0],
        lemma: parts[1],
        combined: parts[2],
      };
    });
}

export interface PreverbData {
  preverbIndex: PreverbEntry[];
  allowedPreverbs: AllowedPreverb[];
}

export namespace PreverbData {
  export function create(): PreverbData {
    return {
      preverbIndex: parsePreverbIndex(
        path.join(envVar("MORCEUS_DATA_ROOT"), PREVERB_INDEX)
      ),
      allowedPreverbs: parseAllowedPreverbs(
        path.join(envVar("MORCEUS_DATA_ROOT"), ALLOWED_PREVERBS)
      ),
    };
  }
}

const LATIN_PREVERBS = new Map<string, string>([
  ["trans", "trans"],
  ["tran", "trans"],
  ["tra", "trans"],
  ["sur", "sub"],
  ["super", "super"],
  ["sup", "sub"],
  ["sum", "sub"],
  ["sug", "sub"],
  ["suf", "sub"],
  ["suc", "sub"],
  ["sub", "sub"],
  ["se", "se"],
  ["retro", "retro"],
  ["ret", "re"],
  ["red", "re"],
  ["re", "re"],
  ["prod", "pro"],
  ["pro", "pro"],
  ["praeter", "praeter"],
  ["prae", "prae"],
  ["per", "per"],
  ["op", "op"],
  ["og", "ob"],
  ["of", "ob"],
  ["oc", "ob"],
  ["ob", "ob"],
  ["inter", "inter"],
  ["intro", "intro"],
  ["il", "in"],
  ["in", "in"],
  ["im", "in"],
  ["ex", "ex"],
  ["ef", "ex"],
  ["ec", "ex"],
  ["e", "ex"],
  ["dis", "dis"],
  ["dif", "dis"],
  ["di", "dis"],
  ["de", "de"],
  ["cor", "con"],
  ["con", "con"],
  ["com", "con"],
  ["col", "con"],
  ["co", "co"],
  ["circum", "circum"],
  ["circu", "circum"],
  ["at", "ad"],
  ["as", "ad"],
  ["ap", "ad"],
  ["ante", "ante"],
  ["an", "ad"],
  ["amb", "amb"],
  ["al", "ad"],
  ["ag", "ad"],
  ["af", "ad"],
  ["ad", "ad"],
  ["ac", "ad"],
  ["abs", "abs"],
  ["ab", "ab"],
]);

interface WordResult {
  form: string;
  isVerb?: boolean;
}

export function preverbedResults<T extends WordResult>(
  word: string,
  callback: (input: string) => T[]
): T[][] {
  assert(!word.includes(BREVE_COMBINER) && !word.includes(MACRON_COMBINER));
  const cleanWord = removeDiacritics(word.toLowerCase());
  const results: T[][] = [];
  for (const [preverb, prefix] of LATIN_PREVERBS) {
    if (!cleanWord.startsWith(preverb) || cleanWord === preverb) {
      continue;
    }
    // console.log(`Trying ${preverb} + ${word.substring(preverb.length)}`);
    const assimilated = requiresAssimilation(preverb, prefix);
    // console.log(`Assimilated: ${assimilated}`);
    // console.log(callback(word.substring(preverb.length)));
    results.push(
      callback(word.substring(preverb.length)).filter(
        (result) =>
          // Allow it if it either doesn't require assimilation or if
          // the word is assimilated, i.e. the first char of the suffix
          // matches the last char of the preverb.
          result.isVerb === true &&
          (!assimilated || result.form[0] === preverb[preverb.length - 1])
      )
    );
  }
  return results;
}

function decomposeVerb(
  form: string,
  prefix: string,
  baseLemma: string
): [string, string] {
  const lemma = baseLemma.split("#")[0];
  let i = form.length - 1;
  for (let j = lemma.length - 1; j >= 0; j--) {
    const target = lemma[j];
    while (["_", "^"].includes(form[i])) {
      i--;
    }
    assertEqual(target, form[i], form + " : " + baseLemma);
    i--;
  }
  return [form.substring(0, i + 1), form.substring(i + 1)];
}

interface Compound {
  rawLine: string;
  prefix: string;
  baseLemma: string;
  preverb: string;
  theRest: string;
  noPerfect?: true;
  orths?: string[];
}

function procLine(rawLine: string) {
  const noteParts = rawLine.substring(1).split(" <- ");
  assert(noteParts.length <= 2);
  const origChunks = noteParts[0].split(" ");
  assert(origChunks.length === 2);
  const cForm = origChunks[1];
  const dChunks = origChunks[0].split("-");
  assert(dChunks.length === 2);
  const dcp = decomposeVerb(cForm, dChunks[0], dChunks[1]);
  const result: Compound = {
    rawLine,
    prefix: dChunks[0],
    baseLemma: dChunks[1],
    preverb: dcp[0],
    theRest: dcp[1],
  };
  const rawNotes = noteParts[1];
  if (rawNotes !== undefined) {
    assert(rawNotes === "no perfect" || rawNotes.startsWith("LS also"));
    if (rawNotes === "no perfect") {
      result.noPerfect = true;
    }
    if (rawNotes.startsWith("LS also")) {
      result.orths = rawNotes
        .substring(7)
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w.length > 0);
    }
  }
  return result;
}

function verbMap(): Map<string, Lemma[]> {
  const map = arrayMap<string, Lemma>();
  for (const verb of allVerbStems()) {
    map.add(verb.lemma, verb);
  }
  return map.map;
}

export function processCompounds() {
  const filePath = path.join(envVar("MORCEUS_DATA_ROOT"), ALLOWED_PREVERBS);
  const verbs = verbMap();
  const lines = readMorpheusLines(filePath)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    const r = procLine(line);
    console.log(r.rawLine);
    const derived = [`${r.preverb} + ${r.theRest}`].concat(r.orths || []);
    const noPf = r.noPerfect === undefined ? "" : " [no_perf]";
    console.log(
      `#${r.prefix} + ${r.baseLemma} -> ${derived.join(", ")} ${noPf}`
    );
    const matches = verbs.get(r.baseLemma) || [];
    if (matches.length === 0) {
      console.log("NO MATCHES FOR " + r.baseLemma);
    }
    if (matches.length > 1) {
      console.log(
        "MULTIPLE MATCHES FOR " +
          r.baseLemma +
          ": " +
          matches.map((l) => l.lemma).join(", ")
      );
    }
    const match = matches[0];
    const cleanPreverb = r.preverb.replaceAll("_", "").replaceAll("^", "");
    if (match.lemma === "fio") {
      console.log(`:le:${cleanPreverb}fio`);
      console.log(`:vs:${r.preverb} fio_conj`);
      console.log(`:vs:${r.preverb}fact pp4 dep`);
      console.log();
      continue;
    }
    if (match.lemma === "do") {
      console.log(`:le:${cleanPreverb}do`);
      console.log(`:vs:${r.preverb} do_conj`);
      console.log(`:vs:${r.preverb}de^d perfstem`);
      console.log(`:vs:${r.preverb}da^t pp4`);
      console.log();
      continue;
    }
    if (match.lemma === "fero") {
      console.log(`:le:${cleanPreverb}fero`);
      console.log(`:vs:${r.preverb} fero_conj`);
      console.log(`:vs:${r.preverb}tu^l perfstem`);
      console.log(`:vs:${r.preverb}la_t pp4`);
      console.log();
      continue;
    }
    if (match.lemma === "eo#1") {
      console.log(`:le:${cleanPreverb}eo`);
      console.log(`:vs:${r.preverb} eo_conj`);
      console.log(`:vs:${r.preverb}i perfstem contr`);
      console.log(`:vs:${r.preverb}i_v perfstem`);
      console.log(`:vs:${r.preverb}i^tum pp4`);
      console.log();
      continue;
    }
    console.log(`:le:${cleanPreverb}${match.lemma}`);
    for (const stem of match.stems || []) {
      if (stem.inflection === "perfstem" && r.noPerfect === true) {
        continue;
      }
      console.log(
        `:vs:${r.preverb}${stem.stem} ${
          stem.inflection
        } ${InflectionContext.toString(stem)}`
      );
    }
    for (const form of match.irregularForms || []) {
      if (match.lemma === "edo#1") {
        continue;
      }
      console.log(
        `:vb:${r.preverb}${form.form} ${InflectionContext.toString(form)}`
      );
    }
    console.log();
  }
}

// processCompounds();

// const data = PreverbData.create();
// const verbs = new Set<string>(allVerbStems().map((l) => l.lemma.split("#")[0]));
// for (const allowedPreverb of data.allowedPreverbs) {
//   const lemma = allowedPreverb.lemma.split("#")[0];
//   const fused = allowedPreverb.combined;
//   // const candidates = data.preverbIndex
//   //   .filter((entry) => entry.prefix === allowedPreverb.preverb)
//   //   .map((entry) => entry.preverb + lemma);
//   // if (!candidates.includes(allowedPreverb.combined)) {
//   //   console.log(JSON.stringify(allowedPreverb));
//   // }
//   const bothO = lemma.endsWith("o") && fused.endsWith("o");
//   const bothOr = lemma.endsWith("or") && fused.endsWith("or");
//   if (!verbs.has(fused)) {
//     if (bothO || bothOr) {
//       console.log(
//         `#${allowedPreverb.preverb}-${allowedPreverb.lemma} ${allowedPreverb.combined}`
//       );
//     }
//   }
// }
