import { arrayMap } from "@/common/data_structures/collect_map";
import { envVar } from "@/common/env_vars";
import { singletonOf } from "@/common/misc_utils";
import type {
  CruncherConfig,
  CruncherTables,
  StemMap,
} from "@/morceus/cruncher_types";
import {
  allNounStems,
  allVerbStems,
  type IrregularForm,
  type Lemma,
  type Stem,
} from "@/morceus/stem_parsing";
import { makeEndIndex, type EndIndexRow } from "@/morceus/tables/indices";
import fs from "fs/promises";
import path from "path";
import { gzip } from "zlib";

export namespace MorceusTables {
  export const make = makeTables;
  export const save = saveTables;
  export const CACHED = singletonOf(make);
}

function makeTables(config?: CruncherConfig): CruncherTables {
  const [endIndices, endTables] =
    config?.existing?.endsResult ??
    makeEndIndex([
      "src/morceus/tables/lat/core/target",
      "src/morceus/tables/lat/core/dependency",
    ]);
  const allLemmata =
    config?.existing?.lemmata ??
    allNounStems(config?.generate?.nomStemFiles).concat(
      allVerbStems(config?.generate?.verbStemFiles)
    );
  const endsMap = makeEndsMap(endIndices);
  const stemMap = makeStemsMap(allLemmata);
  return { endsMap, stemMap, inflectionLookup: endTables };
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
  return input.replaceAll("^", "").replaceAll("_", "").replaceAll("-", "");
}

function makeStemsMap(lemmata: Lemma[]): StemMap {
  const stemMap = arrayMap<string, [Stem | IrregularForm, string, boolean]>();
  for (const lemma of lemmata) {
    const isVerb = lemma.isVerb === true;
    for (const stem of lemma.stems || []) {
      stemMap.add(normalizeKey(stem.stem), [stem, lemma.lemma, isVerb]);
    }
    for (const form of lemma.irregularForms || []) {
      stemMap.add(normalizeKey(form.form), [form, lemma.lemma, isVerb]);
    }
  }
  return stemMap.map;
}

function makeEndsMap(endings: EndIndexRow[]): Map<string, string[]> {
  return new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
}
