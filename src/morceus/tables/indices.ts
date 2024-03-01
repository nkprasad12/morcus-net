import fs from "fs";
import path from "path";

import { assert, checkPresent } from "@/common/assert";
import { InflectionTable, expandTemplates } from "@/morceus/tables/templates";
import { isArray, isString } from "@/web/utils/rpc/parsing";
import { setMap } from "@/common/data_structures/collect_map";

export interface EndIndexRow {
  /** The ending, without diacritics, of this row. */
  ending: string;
  /** The tables that can produce this ending. */
  tableNames: string[];
}

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
): EndIndexRow[];
export function makeEndIndex(tables: InflectionTable[]): EndIndexRow[];
export function makeEndIndex(
  targetDirOrTables: string[] | InflectionTable[],
  dependencyDirs?: string[]
): EndIndexRow[] {
  const tables = isArray(isString)(targetDirOrTables)
    ? [...expandTemplates(targetDirOrTables, checkPresent(dependencyDirs))]
    : targetDirOrTables;
  const index = setMap<string, string>();
  for (const { name, endings } of tables) {
    for (const { ending } of endings) {
      const cleanEnding = ending.replaceAll("_", "");
      index.add(cleanEnding, name);
    }
  }
  return [...index.map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ending, tableNames]) => ({
      ending,
      tableNames: [...tableNames],
    }));
}

export function makeEndIndexAndSave(
  targetDirs: string[] = ["src/morceus/tables/lat/core/target"],
  dependencyDirs: string[] = ["src/morceus/tables/lat/core/dependency"],
  outputDir: string = "v2morceus-out/indices/"
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "indices.txt"),
    makeEndIndex(targetDirs, dependencyDirs)
      .map(EndIndexRow.stringify)
      .join("\n")
  );
}
