import type {
  RawDictEntry,
  StoredDictBacking,
} from "@/common/dictionaries/stored_dict_interface";
import { DbConfig, ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { removeDiacritics } from "@/common/text_cleaning";

export function sqliteBacking(
  input: SqliteDb | string
): StoredDictBacking<"Sync"> {
  const db = typeof input === "string" ? ReadOnlyDb.getDatabase(input) : input;
  return {
    allEntryNames: () =>
      // @ts-expect-error
      db.prepare(`SELECT orth, cleanOrth FROM orths ORDER BY cleanOrth`).all(),
    // @ts-expect-error
    matchesForCleanName: (cleanName: string) =>
      db
        .prepare(`SELECT id, orth FROM orths WHERE cleanOrth = '${cleanName}'`)
        .all(),
    // @ts-expect-error
    entriesForIds: (ids: string[]) => {
      const filter = ids.map(() => `id=?`).join(" OR ");
      const n = ids.length;
      return db
        .prepare(`SELECT entry FROM entries WHERE ${filter} LIMIT ${n}`)
        .all(ids);
    },
    // @ts-expect-error
    entryNamesByPrefix: (prefix: string) =>
      db
        .prepare(
          `SELECT DISTINCT orth FROM orths WHERE cleanOrth GLOB '${prefix}*'`
        )
        .all(),
  };
} /** A dictionary backed by SQLlite. */

export namespace SqliteDict {
  /** Saves the given entries to a SQLite table. */
  export function save(entries: RawDictEntry[], destination: string): void {
    DbConfig.of(destination, entries, "id");
    ReadOnlyDb.saveToSql({
      destination,
      tables: [
        {
          records: entries.map(({ id, entry }) => ({ id, entry })),
          tableName: "entries",
          primaryKey: "id",
        },
        {
          records: entries.flatMap((entry) =>
            entry.keys.map((key) => ({
              id: entry.id,
              orth: key,
              cleanOrth: removeDiacritics(key).toLowerCase(),
            }))
          ),
          tableName: "orths",
          indices: [["cleanOrth"]],
        },
      ],
    });
  }
}
