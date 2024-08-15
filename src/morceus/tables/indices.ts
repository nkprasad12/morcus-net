import fs from "fs";
import path from "path";

import { assert, checkPresent } from "@/common/assert";
import { InflectionTable, expandTemplates } from "@/morceus/tables/templates";
import { isArray, isString } from "@/web/utils/rpc/parsing";
import { arrayMap, setMap } from "@/common/data_structures/collect_map";
import type { InflectionEnding } from "@/morceus/inflection_data_utils";

const KNOWN_DUPLICATES = new Set(["peLs_pedis"]);
const VERB_TABLES = new Set([
  "conj1",
  "conj2",
  "conj3",
  "conj4",
  "conj3_io",
  "perfstem",
  "ivperf",
  "avperf",
  "evperf",
]);

export enum IndexMode {
  ALL = "all",
  VERBS = "verbs",
  NOUNS = "nouns",
}

/** Maps stem type => end form => endings. */
export type InflectionLookup = Map<string, Map<string, InflectionEnding[]>>;
export interface EndIndexRow {
  /** The ending, without diacritics, of this row. */
  ending: string;
  /** The tables that can produce this ending. */
  tableNames: string[];
}
export type EndsResult = [EndIndexRow[], InflectionLookup];

export namespace EndIndexRow {
  export function parse(input: string): EndIndexRow {
    const chunks = input.trim().split(" ");
    const words = chunks.map((c) => c.trim()).filter((c) => c.length > 0);
    assert(words.length > 1);
    return {
      ending: words[0],
      tableNames: words.slice(1),
    };
  }

  export function stringify(row: EndIndexRow): string {
    return [row.ending].concat(row.tableNames.sort()).join(" ");
  }
}

function getInflectionTables(
  targetDirOrTables: string[] | InflectionTable[],
  dependencyDirs?: string[]
): InflectionTable[] {
  if (!isArray(isString)(targetDirOrTables)) {
    return targetDirOrTables;
  }
  const [targetTables, depTables] = expandTemplates(
    targetDirOrTables,
    checkPresent(dependencyDirs)
  );
  const tables = new Map<string, InflectionTable>(targetTables);
  // For the dependency tables, check that we have no overlaps with target tables
  // that are unexpected.
  for (const table of depTables.values()) {
    const isDuplicate = tables.has(table.name);
    const knownDuplicate = KNOWN_DUPLICATES.has(table.name);
    if (isDuplicate) {
      // If it's a duplicate, check that this is expected and ignore it
      // (which means that we keep the table present in `targetTables`).
      assert(knownDuplicate, table.name);
      continue;
    }
    tables.set(table.name, table);
  }
  return [...tables.values()];
}

export function makeEndIndex(
  targetDirs: string[],
  dependencyDirs: string[],
  indexMode?: IndexMode
): EndsResult;
export function makeEndIndex(tables: InflectionTable[]): EndsResult;
export function makeEndIndex(
  targetDirOrTables: string[] | InflectionTable[],
  dependencyDirs?: string[],
  indexMode?: IndexMode
): EndsResult {
  const tables = getInflectionTables(targetDirOrTables, dependencyDirs);
  const index = setMap<string, string>();
  const inflectionLookup: InflectionLookup = new Map();
  const tableFilter: (table: string) => boolean =
    indexMode === IndexMode.VERBS
      ? // We want to include pp4 in both.
        (table) => table === "pp4" || VERB_TABLES.has(table)
      : indexMode === IndexMode.NOUNS
      ? (table) => !VERB_TABLES.has(table)
      : (_) => true;
  for (const { name, endings } of tables) {
    if (!tableFilter(name)) {
      continue;
    }
    assert(!inflectionLookup.has(name));
    const endingsMap = arrayMap<string, InflectionEnding>();
    for (const end of endings) {
      const ending = end.ending;
      // Remove vowel length markings on the keys so that we can make lookups
      // from un-macronized words. Note that we still preserve the lengths in
      // the result itself.
      const cleanEnding = ending.replaceAll("_", "").replaceAll("^", "");
      index.add(cleanEnding, name);
      endingsMap.add(cleanEnding, end);
    }
    inflectionLookup.set(name, endingsMap.map);
  }
  return [
    [...index.map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ending, tableNames]) => ({
        ending,
        tableNames: [...tableNames],
      })),
    inflectionLookup,
  ];
}

export function makeEndIndexAndSave(
  mode: IndexMode = IndexMode.ALL,
  targetDirs: string[] = ["src/morceus/tables/lat/core/target"],
  dependencyDirs: string[] = ["src/morceus/tables/lat/core/dependency"],
  outputDir: string = "build/morceus/indices/"
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, `${mode.toString()}.endindex`),
    makeEndIndex(targetDirs, dependencyDirs, mode)[0]
      .map(EndIndexRow.stringify)
      .join("\n")
  );
}
