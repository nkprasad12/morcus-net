import { assert, checkPresent } from "@/common/assert";
import { arrayMap, arrayMapBy } from "@/common/data_structures/collect_map";
import { envVar } from "@/common/env_vars";
import { singletonOf } from "@/common/misc_utils";
import type {
  CruncherConfig,
  CruncherTables,
  StemMapValue,
} from "@/morceus/cruncher_types";
import {
  allNounStems,
  allVerbStems,
  type IrregularForm,
  type Lemma,
  type Stem,
} from "@/morceus/stem_parsing";
import { makeEndIndex, type EndIndexRow } from "@/morceus/tables/indices";
import type { InflectionTable } from "@/morceus/tables/templates";
import fs from "fs/promises";
import path from "path";
import { gzip } from "zlib";
import {
  packWordInflectionData,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";

export namespace MorceusTables {
  export const make = makeTables;
  export const save = saveTables;
  export const CACHED = singletonOf(make);
}

const MAX_U32 = 4294967295; // 2^32 - 1

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
  const stemMap = makeStemsMap(allLemmata);
  const rawTablesMap = new Map<string, InflectionTable>();
  for (const table of rawTables) {
    assert(!rawTablesMap.has(table.name), `Duplicate table: ${table.name}`);
    rawTablesMap.set(table.name, table);
  }
  const rawLemmataMap = arrayMapBy(allLemmata, (l) => l.lemma);
  return {
    endsMap,
    stemMap,
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

async function saveTablesForRust(tables: CruncherTables) {
  let allStems: Stem[] = [];
  const allStemSet = new Set<Stem>();
  let allIrregs: IrregularForm[] = [];
  const allIrregSet = new Set<IrregularForm>();

  for (const lemmata of tables.rawLemmata.values()) {
    for (const lemma of lemmata) {
      for (const stem of lemma.stems ?? []) {
        assert(!allStemSet.has(stem));
        allStems.push(stem);
        allStemSet.add(stem);
      }
      for (const form of lemma.irregularForms ?? []) {
        assert(!allIrregSet.has(form));
        allIrregs.push(form);
        allIrregSet.add(form);
      }
    }
  }

  const normalizeSortKey = (s: string) =>
    s
      .toLowerCase()
      .replaceAll("+", "")
      .replaceAll("-", "")
      .replaceAll("_", "")
      .replaceAll("^", "");

  allStems = allStems
    .map((s) => [normalizeSortKey(s.stem), s] as const)
    .sort((a, b) => a[0].localeCompare(b[0], "en-US"))
    .map(([, s]) => s);

  allIrregs = allIrregs
    .map((s) => [normalizeSortKey(s.form), s] as const)
    .sort((a, b) => a[0].localeCompare(b[0], "en-US"))
    .map(([, s]) => s);

  const stemToIndex = new Map<Stem, number>();
  const irregToIndex = new Map<IrregularForm, number>();
  allStems.forEach((stem, i) => stemToIndex.set(stem, i));
  allIrregs.forEach((irreg, i) => irregToIndex.set(irreg, i));

  assert(
    allStems.length <= MAX_U32,
    `The number of stems (${allStems.length}) cannot fit in u32.`
  );
  assert(
    allIrregs.length <= MAX_U32,
    `The number of irregular forms (${allIrregs.length}) cannot fit in u32.`
  );

  // In the JS table representation, the inflection lookup table goes from
  // table name -> list of endings. In the Rust representation, it goes from
  // table index -> list of endings, and the indices are stored in the endsMap
  // and the stems instead.
  // This saves ~13 MB memory.
  const inflectionLookupValues: Map<string, InflectionEnding[]>[] = [];
  const inflectionLookupIndices: Map<string, number> = new Map();
  for (const [tableName, map] of tables.inflectionLookup.entries()) {
    inflectionLookupIndices.set(tableName, inflectionLookupValues.length);
    inflectionLookupValues.push(map);
  }
  const endsMap = new Map<string, number[]>();
  for (const [ending, tableNames] of tables.endsMap.entries()) {
    const indices = tableNames
      .map((name) => checkPresent(inflectionLookupIndices.get(name)))
      .sort((a, b) => a - b);
    endsMap.set(ending, indices);
  }
  const stemMap = new Map();
  for (const [key, values] of tables.stemMap.entries()) {
    const newValues = values.map(([stemOrForm, lemma, isVerb]) => {
      const isStem = "stem" in stemOrForm;
      const idx = isStem
        ? stemToIndex.get(stemOrForm)
        : irregToIndex.get(stemOrForm);
      return [checkPresent(idx), lemma, isVerb, isStem];
    });
    stemMap.set(key, newValues);
  }

  const mapLemma = (l: Lemma): unknown => {
    const result = { ...l };
    if (result.stems !== undefined) {
      const indices = result.stems.map((s) => checkPresent(stemToIndex.get(s)));
      // @ts-expect-error
      result.stems = indices;
    }
    if (result.irregularForms !== undefined) {
      const indices = result.irregularForms.map((s) =>
        checkPresent(irregToIndex.get(s))
      );
      // @ts-expect-error
      result.irregularForms = indices;
    }
    return result;
  };

  const rawLemmata = new Map();
  for (const [lemma, lemmata] of tables.rawLemmata.entries()) {
    const newLemmata = lemmata.map(mapLemma);
    rawLemmata.set(lemma, newLemmata);
  }

  const numerals = tables.numerals.map(mapLemma);

  const tablesForRust = {
    ...tables,
    inflectionLookup: inflectionLookupValues,
    endsMap,
    stemMap,
    allStems,
    allIrregs,
    numerals,
    rawLemmata,
  };
  const dir = path.join("build", "morceus", "processed");
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, "morceusTables.json");
  const replacer = (key: string, value: unknown) => {
    if (key === "grammaticalData") {
      assert(
        typeof value === "object" && value !== null,
        "grammaticalData must be an object"
      );
      // @ts-expect-error
      return packWordInflectionData(value);
    }
    if (key === "inflection") {
      assert(typeof value === "string", "inflection must be a string");
      return checkPresent(
        // @ts-expect-error
        inflectionLookupIndices.get(value),
        `No index for inflection table ${value}`
      );
    }
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  };
  const stringified = JSON.stringify(tablesForRust, replacer);
  await fs.writeFile(outPath, stringified);
}

async function saveTables(config?: CruncherConfig) {
  const tables = makeTables(config);

  await saveTablesForRust(tables);

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

function makeStemsMap(lemmata: Lemma[]): Map<string, StemMapValue[]> {
  const map = arrayMap<string, StemMapValue>();
  for (const lemma of lemmata) {
    const isVerb = lemma.isVerb === true;
    for (const stem of lemma.stems || []) {
      map.add(normalizeKey(stem.stem), [stem, lemma.lemma, isVerb]);
    }
    for (const form of lemma.irregularForms || []) {
      map.add(normalizeKey(form.form), [form, lemma.lemma, isVerb]);
    }
  }
  return map.map;
}

function makeEndsMap(endings: EndIndexRow[]): Map<string, string[]> {
  return new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
}
