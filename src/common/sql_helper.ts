import fs from "fs";
import path from "path";
import { assert } from "@/common/assert";
import { SqliteDb } from "@/common/sqlite/sql_db";

export const ARRAY_INDEX = "@INDEX";

function createTableCommand(
  prototype: object,
  primaryKey: string | typeof ARRAY_INDEX | undefined,
  tableName: string,
  optionalKeys?: string[]
): [string, string[]] {
  const allKeys = Array.from(
    new Set(Object.keys(prototype).concat(optionalKeys ?? []))
  );
  assert(
    primaryKey === undefined ||
      primaryKey === ARRAY_INDEX ||
      allKeys.includes(primaryKey),
    "Invalid primary key."
  );
  const columns: string[] = allKeys.map(
    (key) => `'${key}' TEXT` + (key === primaryKey ? " PRIMARY KEY ASC" : "")
  );
  if (primaryKey === ARRAY_INDEX) {
    columns.push("'n' INTEGER PRIMARY KEY ASC");
    allKeys.push("n");
  }
  return [`CREATE TABLE ${tableName}(${columns.join(", ")} );`, allKeys];
}

export interface TableConfig {
  records: object[];
  primaryKey?: string | typeof ARRAY_INDEX;
  indices?: string[][];
  tableName: string;
  optionalKeys?: string[];
}

export interface DbConfig {
  destination: string;
  tables: TableConfig[];
}
export namespace DbConfig {
  export function of(
    destination: string,
    records: object[],
    primaryKey: string | typeof ARRAY_INDEX,
    indices: string[][] = [],
    tableName: string = "data"
  ): DbConfig {
    return {
      destination,
      tables: [{ records, primaryKey, indices, tableName }],
    };
  }
}

export namespace ReadOnlyDb {
  export function saveToSql(config: DbConfig): void {
    const { destination, tables } = config;
    const start = performance.now();
    if (!fs.existsSync(path.dirname(destination))) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
    }
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const db = SqliteDb.create(destination);
    db.pragma("journal_mode = WAL");
    for (const table of tables) {
      const { records, indices, tableName } = table;
      const [createTable, columnNames] = createTableCommand(
        records[0],
        table.primaryKey,
        tableName,
        table.optionalKeys
      );
      db.exec(createTable);
      for (const index of indices ?? []) {
        index.forEach((i) =>
          assert(columnNames.includes(i), `Invalid index column: ${i}`)
        );
        db.exec(
          `CREATE INDEX ${index.join("_")} ON ${tableName}(${index.join(
            ", "
          )});`
        );
      }
      const insert = db.prepare(
        `INSERT INTO ${tableName} (${columnNames.join(
          ", "
        )}) VALUES (${columnNames.map((n) => "@" + n).join(", ")})`
      );
      const isBun = process.env.BUN === "1";
      const insertAll = db.transaction(() => {
        records.forEach((record, index) => {
          const row: Record<string, any> = {};
          for (const key of columnNames) {
            // @ts-expect-error
            row[isBun ? `@${key}` : key] = record[key];
          }
          if (table.primaryKey === ARRAY_INDEX) {
            row[isBun ? `@n` : "n"] = index;
          }
          insert.run(row);
        });
      });
      insertAll();
      console.debug(
        `Saved ${
          records.length
        } records to ${tableName} in ${destination} in ${Math.round(
          performance.now() - start
        )} ms`
      );
    }
    db.close();
  }

  export function getDatabase(dbPath: string): SqliteDb {
    try {
      const db = SqliteDb.create(dbPath, { readonly: true });
      db.pragma("journal_mode = WAL");
      return db;
    } catch (e) {
      throw new Error(`Unable to read DB file ${dbPath}`, { cause: e });
    }
  }
}
