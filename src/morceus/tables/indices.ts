import fs from "fs";
import path from "path";

import { assert, checkPresent } from "@/common/assert";
import {
  InflectionTable,
  expandTemplates,
  type InflectionEnding,
} from "@/morceus/tables/templates";
import { isArray, isString } from "@/web/utils/rpc/parsing";
import { arrayMap, setMap } from "@/common/data_structures/collect_map";

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
    return [row.ending].concat(row.tableNames).join(" ");
  }
}

export function makeEndIndex(
  targetDirs: string[],
  dependencyDirs: string[]
): EndsResult;
export function makeEndIndex(tables: InflectionTable[]): EndsResult;
export function makeEndIndex(
  targetDirOrTables: string[] | InflectionTable[],
  dependencyDirs?: string[]
): EndsResult {
  const tables = isArray(isString)(targetDirOrTables)
    ? [...expandTemplates(targetDirOrTables, checkPresent(dependencyDirs))]
    : targetDirOrTables;
  const index = setMap<string, string>();
  const inflectionLookup: InflectionLookup = new Map();
  for (const { name, endings } of tables) {
    assert(!inflectionLookup.has(name));
    const endingsMap = arrayMap<string, InflectionEnding>();
    for (const end of endings) {
      const ending = end.ending;
      const cleanEnding = ending.replaceAll("_", "");
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
  targetDirs: string[] = ["src/morceus/tables/lat/core/target"],
  dependencyDirs: string[] = ["src/morceus/tables/lat/core/dependency"],
  outputDir: string = "build/morceus/indices/"
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "indices.txt"),
    makeEndIndex(targetDirs, dependencyDirs)[0]
      .map(EndIndexRow.stringify)
      .join("\n")
  );
}
