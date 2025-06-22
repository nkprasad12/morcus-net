import { assert } from "@/common/assert";
import type { EntryOutline } from "@/common/dictionaries/dict_result";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { singletonOf } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "@/common/xml/xml_utils";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";

import fs from "fs";

interface RawGesnerEntry {
  keys: string[];
  content: string;
}

function getRawGesnerEntries(inputFilePath?: string): RawGesnerEntry[] {
  const rawFile = inputFilePath ?? envVar("GESNER_RAW_PATH");
  return JSON.parse(fs.readFileSync(rawFile).toString());
}

function getId(rawKey: string, dupeCounts: Map<string, number>): string {
  const key = rawKey
    .toLowerCase()
    .trim()
    .replaceAll(/\[\]/g, "")
    .replaceAll(" ", "_");
  const count = dupeCounts.get(key) ?? 0;
  dupeCounts.set(key, count + 1);
  return `gesner_${key}_${count}`;
}

const INFLECTION_PROVIDER = singletonOf<(x: string) => LatinWordAnalysis[]>(
  () => {
    const tables = MorceusTables.CACHED.get();
    const cruncher = MorceusCruncher.make(tables);
    return (word) =>
      cruncher(word, { ...CruncherOptions.DEFAULT, relaxUandV: false });
  }
);

function uAndVAlts(word: string, i: number = 0): string[] {
  if (i >= word.length) {
    return [""];
  }
  const tailOptions = uAndVAlts(word, i + 1);
  const currOptions =
    word[i] === "u" || word[i] === "v" ? ["u", "v"] : [word[i]];
  return currOptions.flatMap((curr) => tailOptions.map((tail) => curr + tail));
}

function filterEncliticOnlyAnalyses(
  analyses: LatinWordAnalysis[]
): LatinWordAnalysis[] {
  return analyses.filter((analysis) => {
    return (
      analysis.inflectedForms.filter(
        (form) =>
          form.inflectionData.filter((d) => d.enclitic === undefined).length > 0
      ).length > 0
    );
  });
}

function replaceKnownVs(word: string): string {
  let replaced = word
    .replaceAll("qv", "qu")
    .replaceAll("vs", "us")
    .replaceAll("sv", "su")
    .replaceAll("ivm", "ium");
  replaced = replaced.replace(/^v(?=[^aeiou])/gi, () => "u");
  replaced.replace(/v(?=[^aeiou])$/gi, () => "u");
  return replaced.replace(/(?<=[^aeiou])v(?=[^aeiou])/gi, () => "u");
}

function resolveKey(rawKey: string): string {
  const candidate = rawKey
    .toLowerCase()
    .trim()
    .replaceAll(/\s+\[\d+\]$/g, "")
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "");
  assert(/[a-z]+/.test(candidate), `Invalid key: ${rawKey}`);
  const alts = Array.from(new Set(uAndVAlts(candidate).map(replaceKnownVs)));
  if (alts.length === 1) {
    return alts[0];
  }
  const knownAlts = alts
    .map((alt) => ({
      alt,
      inflections: filterEncliticOnlyAnalyses(INFLECTION_PROVIDER.get()(alt)),
    }))
    .filter((x) => x.inflections.length > 0);
  if (knownAlts.length === 0) {
    return candidate.replaceAll("v", "u");
  }
  if (knownAlts.length === 1) {
    return knownAlts[0].alt;
  }
  const lemmata = new Set(knownAlts.map((x) => x.inflections[0].lemma));
  if (lemmata.size === 1) {
    // All alts have the same lemma, so we can return the first one
    return knownAlts[0].alt;
  }
  //   [
  //     "ERVO",
  //     "HELVO",
  //     "FATVE",
  //     "SERVITVS",
  //     "TRANSVENDO",
  //     "VENTO",
  //     "VENTVS",
  //     "VOLVTA",
  //     "VOLVTO",
  //   ]
  // This list is legitimately ambiguous. In the future we should probably handle this but
  // we won't bother right now.
  return candidate.replaceAll("v", "u");
}

function processRawEntry(
  root: XmlNode,
  dupeCounts: Map<string, number>
): RawDictEntry {
  assert(root.name === "def");
  const keyNode = XmlNode.assertIsNode(root.children[0]);
  assert(keyNode.name === "emph");
  const rawKey = XmlNode.getSoleText(keyNode);
  const id = getId(rawKey, dupeCounts);
  const keys = [resolveKey(rawKey)];
  const outline: EntryOutline = {
    mainKey: keys[0],
    mainSection: {
      text: "",
      level: 0,
      ordinal: "0",
      sectionId: id,
    },
  };
  const entry = JSON.stringify({
    entry: XmlNodeSerialization.DEFAULT.serialize(root),
    outline,
  });
  return { keys, id, entry };
}

export function processGesner() {
  const rawEntries = getRawGesnerEntries();
  const processedEntries: RawDictEntry[] = [];
  const dupeCounts = new Map<string, number>();
  for (let i = 0; i < rawEntries.length; i++) {
    if (i % 5000 === 0) {
      console.debug(`[Gesner] Processed ${i} of ${rawEntries.length}`);
    }
    const content = parseXmlStrings([rawEntries[i].content])[0];
    processedEntries.push(processRawEntry(content, dupeCounts));
  }
  SqliteDict.save(processedEntries, envVar("GESNER_PROCESSED_PATH"));
}
