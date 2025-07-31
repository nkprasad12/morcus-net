import { assert } from "@/common/assert";
import { arrayMapBy } from "@/common/data_structures/collect_map";
import { envVar } from "@/common/env_vars";
import { singletonOf } from "@/common/misc_utils";
import type {
  CruncherConfig,
  CruncherTables,
  StemMapValue,
} from "@/morceus/cruncher_types";
import { allNounStems, allVerbStems, type Lemma } from "@/morceus/stem_parsing";
import * as Trie from "@/common/data_structures/trie";
import { makeEndIndex, type EndIndexRow } from "@/morceus/tables/indices";
import type { InflectionTable } from "@/morceus/tables/templates";
import fs from "fs/promises";
import path from "path";
import { gzip } from "zlib";

export namespace MorceusTables {
  export const make = makeTables;
  export const save = saveTables;
  export const CACHED = singletonOf(make);
}

function makeTables(config?: CruncherConfig): CruncherTables {
  // This would ideally be a module constant, but we define it here so that
  // we can dynamically swap it out in unit tests
  const endsRoot = envVar("MORCEUS_DATA_ROOT") + "/latin/ends";
  const [endIndices, endTables, rawTables] =
    config?.existing?.endsResult ??
    makeEndIndex([`${endsRoot}/target`, `${endsRoot}/dependency`]);
  const allLemmata =
    config?.existing?.lemmata ??
    allNounStems(config?.generate?.nomStemFiles).concat(
      allVerbStems(config?.generate?.verbStemFiles)
    );
  const endsMap = makeEndsMap(endIndices);
  const stemTrie = makeStemsTrie(allLemmata);
  const rawTablesMap = new Map<string, InflectionTable>();
  for (const table of rawTables) {
    assert(!rawTablesMap.has(table.name), `Duplicate table: ${table.name}`);
    rawTablesMap.set(table.name, table);
  }
  const rawLemmataMap = arrayMapBy(allLemmata, (l) => l.lemma);
  return {
    endsMap,
    stemTrie,
    inflectionLookup: endTables,
    numerals: allLemmata.filter(isNumeral),
    rawTables: rawTablesMap,
    rawLemmata: rawLemmataMap.map,
  };
}

function isNumeral(lemma: Lemma) {
  for (const stem of lemma.stems ?? []) {
    if (stem.internalTags?.includes("numeral")) {
      return true;
    }
  }
  for (const stem of lemma.irregularForms ?? []) {
    if (stem.internalTags?.includes("numeral")) {
      return true;
    }
  }
  return false;
}

async function saveTables(config?: CruncherConfig) {
  const tables = makeTables(config);
  const replacer = (_: string, value: unknown) =>
    value instanceof Map
      ? {
          dataType: "Map",
          value: Array.from(value.entries()),
        }
      : value;
  const stringified = JSON.stringify(tables, replacer);
  const data = await new Promise<Buffer>((resolve, reject) => {
    const settings = { level: 9 };
    gzip(stringified, settings, (error, result) =>
      error === null ? resolve(result) : reject(error)
    );
  });
  const outPath = path.join(
    envVar("OFFLINE_DATA_DIR"),
    "morceusTables.json.gz.chunked"
  );
  await fs.writeFile(outPath, data);
}

function normalizeKey(input: string): string {
  return input
    .replaceAll("^", "")
    .replaceAll("_", "")
    .replaceAll("-", "")
    .replaceAll("+", "");
}

function makeStemsTrie(lemmata: Lemma[]): Trie.TrieNode<StemMapValue> {
  const root: Trie.TrieNode<StemMapValue> = {};
  for (const lemma of lemmata) {
    const isVerb = lemma.isVerb === true;
    for (const stem of lemma.stems || []) {
      Trie.add(root, normalizeKey(stem.stem), [stem, lemma.lemma, isVerb]);
    }
    for (const form of lemma.irregularForms || []) {
      Trie.add(root, normalizeKey(form.form), [form, lemma.lemma, isVerb]);
    }
  }
  return root;
}

function makeEndsMap(endings: EndIndexRow[]): Map<string, string[]> {
  return new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
}
