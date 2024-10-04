import type {
  OrthsTableRow,
  RawDictEntry,
  StoredDictBacking,
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
      // @ts-expect-error
      db.prepare(`SELECT orth, cleanOrth FROM orths ORDER BY cleanOrth`).all(),
    matchesForCleanName: (cleanName: string) =>
      db
        .prepare(
          `SELECT id, orth, senseId FROM orths WHERE cleanOrth = '${cleanName}'`
        )
        .all()
        // @ts-expect-error
        .map(({ id, orth, senseId }) => {
          const result: Omit<OrthsTableRow, "cleanOrth"> = { id, orth };
          if (senseId !== null) {
            result.senseId = senseId;
          }
          return result;
        }),
    // @ts-expect-error
    entriesForIds: (ids: string[]) => {
      const filter = ids.map(() => `id=?`).join(" OR ");
      const n = ids.length;
      return db
        .prepare(`SELECT id, entry FROM entries WHERE ${filter} LIMIT ${n}`)
        .all(ids);
    },
    entryNamesByPrefix: (prefix: string) =>
      db
        .prepare(
          `SELECT DISTINCT orth FROM orths WHERE cleanOrth GLOB '${prefix}*'`
        )
        .all()
        // @ts-expect-error
        .map(({ orth }) => orth),
    lowMemory: false,
  };
}

function cleanKey(key: string): string {
  return removeDiacritics(key).toLowerCase();
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
            const rows: OrthsTableRow[] = entry.keys.map((key) => ({
              id: entry.id,
              orth: key,
              cleanOrth: cleanKey(key),
            }));
            for (const [senseId, derivedOrths] of entry.derivedKeys ?? []) {
              derivedOrths.forEach((derived) =>
                rows.push({
                  id: entry.id,
                  orth: derived,
                  cleanOrth: cleanKey(derived),
                  senseId,
                })
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
