import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import { DbConfig, ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { setMap } from "@/common/data_structures/collect_map";

// TODO: Add Lemma and disambig number to this table
export interface RawDictEntry {
  /** The list of keys for this entry. */
  keys: string[];
  /** A unique identifier for this entry. */
  id: string;
  /** A serialized form of this entry. */
  entry: string;
}

/** A dictionary backed by SQLlite. */
export class SqlDict {
  /** Saves the given entries to a SQLite table. */
  static save(entries: RawDictEntry[], destination: string): void {
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

  private readonly db: SqliteDb;
  private readonly table: Map<string, string[]>;

  constructor(dbFile: string) {
    this.db = ReadOnlyDb.getDatabase(dbFile);
    const lookup = setMap<string, string>();
    this.db
      .prepare(`SELECT orth, cleanOrth FROM orths ORDER BY cleanOrth`)
      .all()
      // @ts-ignore
      .forEach(({ orth, cleanOrth }) =>
        lookup.add(cleanOrth[0].toLowerCase(), orth)
      );
    this.table = new Map(
      [...lookup.map.entries()].map((e) => [e[0], [...e[1]]])
    );
  }

  /**
   * Returns the raw (serialized) entries for the given input
   * query.
   *
   * @param input the query to search against keys.
   * @param extras any server extras to pass to the function.
   */
  getRawEntry(input: string, extras?: ServerExtras): string[] {
    const request = removeDiacritics(input).toLowerCase();
    // @ts-ignore
    const candidates: { id: string; orth: string }[] = this.db
      .prepare(`SELECT id, orth FROM orths WHERE cleanOrth = '${request}'`)
      .all();
    extras?.log(`${request}_sqlCandidates`);
    if (candidates.length === 0) {
      return [];
    }

    const allIds = candidates
      .filter(({ orth }) => Vowels.haveCompatibleLength(input, orth))
      .map(({ id }) => id);
    const filter = allIds.map(() => `id=?`).join(" OR ");
    // @ts-ignore
    const entryStrings: { entry: string }[] = this.db
      .prepare(`SELECT entry FROM entries WHERE ${filter}`)
      .all(allIds);
    extras?.log(`${request}_entriesFetched`);
    return toRegularArray(entryStrings, ({ entry }) => entry);
  }

  /** Returns the entry with the given ID, if present. */
  getById(id: string): string | undefined {
    // @ts-ignore
    const result: { entry: string }[] = this.db
      .prepare(`SELECT entry FROM entries WHERE id=? LIMIT 1`)
      .all(id);
    if (result.length === 0) {
      return undefined;
    }
    return result[0].entry;
  }

  /** Returns the possible completions for the given prefix. */
  getCompletions(input: string): string[] {
    const prefix = removeDiacritics(input).toLowerCase();
    const precomputed = this.table.get(prefix);
    if (precomputed !== undefined) {
      return precomputed;
    }
    // @ts-ignore
    const rows: { orth: string }[] = this.db
      .prepare(
        `SELECT DISTINCT orth FROM orths WHERE cleanOrth GLOB '${prefix}*'`
      )
      .all();
    return toRegularArray(rows, (row) => row.orth);
  }
}

function toRegularArray<T, U>(input: T[], mapper: (t: T) => U) {
  // Somehow, the native result from `.all()` isn't quite a regular array.
  // This makes the jest checks for strict equality fail, so manually do
  // the map.
  const result: U[] = Array(input.length);
  input.forEach((value, i) => {
    result[i] = mapper(value);
  });
  return result;
}
