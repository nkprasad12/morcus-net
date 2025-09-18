import type {
  EntryName,
  OrthsTableRow,
  RawDictEntry,
  StoredDictBacking,
  StoredOrthsTableRow,
} from "@/common/dictionaries/stored_dict_interface";
import { ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { removeDiacritics } from "@/common/text_cleaning";

export function sqliteBacking(
  input: SqliteDb | string
): StoredDictBacking<"Sync"> {
  const db = typeof input === "string" ? ReadOnlyDb.getDatabase(input) : input;
  return {
    allEntryNames: () =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      db
        .prepare(`SELECT orth, cleanOrth FROM orths ORDER BY cleanOrth`)
        .all() as EntryName[],
    matchesForCleanName: (cleanName: string) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const rawRows = db
        .prepare(
          `SELECT id, orth, senseId FROM orths WHERE cleanOrth = '${cleanName}'`
        )
        .all() as OrthsTableRow[];
      return rawRows.map(({ id, orth, senseId }) => {
        const result: Omit<OrthsTableRow, "cleanOrth"> = { id, orth };
        if (senseId !== null) {
          result.senseId = senseId;
        }
        return result;
      });
    },
    entriesForIds: (ids: string[]) => {
      const filter = ids.map(() => `id=?`).join(" OR ");
      const n = ids.length;
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return db
        .prepare(`SELECT id, entry FROM entries WHERE ${filter} LIMIT ${n}`)
        .all(ids) as { id: string; entry: string }[];
    },
    entryNamesByPrefix: (prefix: string) =>
      db
        .prepare(
          `SELECT DISTINCT orth FROM orths WHERE cleanOrth GLOB '${prefix}*'`
        )
        .all()
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        .map((row) => (row as { orth: string }).orth),
    entryNamesBySuffix: (suffix: string) =>
      db
        .prepare(
          `SELECT DISTINCT orth FROM orths WHERE reverseCleanOrth GLOB '${suffix
            .split("")
            .reverse()
            .join("")}*'`
        )
        .all()
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        .map((row) => (row as { orth: string }).orth),
    lowMemory: false,
  };
}

function cleanKey(key: string): string {
  return removeDiacritics(key)
    .toLowerCase()
    .replaceAll("ß", "ss")
    .replaceAll("'", "");
}

function orthRow(
  id: string,
  orth: string,
  senseId?: string
): StoredOrthsTableRow {
  const cleanOrth = cleanKey(orth);
  const reverseCleanOrth = cleanOrth.split("").reverse().join("");
  const result: StoredOrthsTableRow = { id, orth, cleanOrth, reverseCleanOrth };
  if (senseId !== undefined) {
    result.senseId = senseId;
  }
  return result;
}

export namespace SqliteDict {
  /** Saves the given entries to a SQLite table. */
  export function save(entries: RawDictEntry[], destination: string): void {
    // # # # # #
    // IMPORTANT If the implementation here is updated, also change `indexdb_backing`!
    // # # # # #
    ReadOnlyDb.saveToSql({
      destination,
      tables: [
        {
          records: entries.map(({ id, entry }) => ({ id, entry })),
          tableName: "entries",
          primaryKey: "id",
        },
        {
          records: entries.flatMap((entry) => {
            const rows = entry.keys.map((key) => orthRow(entry.id, key));
            for (const [senseId, derivedOrths] of entry.derivedKeys ?? []) {
              derivedOrths.forEach((derived) =>
                rows.push(orthRow(entry.id, derived, senseId))
              );
            }
            return rows;
          }),
          tableName: "orths",
          indices: [["cleanOrth"]],
          optionalKeys: ["senseId"],
        },
      ],
    });
  }
}
