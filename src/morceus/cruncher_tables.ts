import { assert } from "@/common/assert";
import { arrayMap, arrayMapBy } from "@/common/data_structures/collect_map";
import { envVar } from "@/common/env_vars";
import { singletonOf } from "@/common/misc_utils";
import type {
  CruncherConfig,
  CruncherTables,
  StemMapValue,
} from "@/morceus/cruncher_types";
import { allNounStems, allVerbStems, type Lemma } from "@/morceus/stem_parsing";
import { makeEndIndex, type EndIndexRow } from "@/morceus/tables/indices";
import type { InflectionTable } from "@/morceus/tables/templates";
import fs from "fs/promises";
import path from "path";
import { gzip } from "zlib";
import { packWordInflectionData } from "@/morceus/inflection_data_utils";

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

async function saveTables(config?: CruncherConfig, compress: boolean = true) {
  const tables = makeTables(config);

  if (!compress) {
    const dir = path.join("build", "morceus", "processed");
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, "morceusTables.json");
    const replacer = (_key: string, value: unknown) => {
      if (_key === "grammaticalData") {
        assert(
          typeof value === "object" && value !== null,
          "grammaticalData must be an object"
        );
        // @ts-expect-error
        return packWordInflectionData(value);
      }
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    };
    const stringified = JSON.stringify(tables, replacer);
    await fs.writeFile(outPath, stringified);
    return;
  }

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
