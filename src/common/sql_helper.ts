import fs from "fs";
import Database from "better-sqlite3";
import { assert } from "@/common/assert";

export const ARRAY_INDEX = "@INDEX";

function createTableCommand<T extends object>(
  prototype: T,
  primaryKey: string | typeof ARRAY_INDEX
): [string, string[]] {
  const allKeys = Object.keys(prototype);
  assert(
    primaryKey === ARRAY_INDEX || allKeys.includes(primaryKey),
    "Invalid primary key."
  );
  const columns: string[] = allKeys.map(
    (key) => `'${key}' TEXT` + (key === primaryKey ? " PRIMARY KEY ASC" : "")
  );
  if (primaryKey === ARRAY_INDEX) {
    columns.push("'n' INTEGER PRIMARY KEY ASC");
    allKeys.push("n");
  }
  return [`CREATE TABLE data(${columns.join(", ")} );`, allKeys];
}

export namespace ReadOnlyDb {
  export function saveToSql<T extends object>(
    destination: string,
    records: T[],
    primaryKey: string | typeof ARRAY_INDEX,
    indices: string[][] = []
  ) {
    const start = performance.now();
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const db = new Database(destination);
    db.pragma("journal_mode = WAL");
    const [createTable, columnNames] = createTableCommand(
      records[0],
      primaryKey
    );
    db.exec(createTable);
    for (const index of indices) {
      index.forEach((i) =>
        assert(columnNames.includes(i), `Invalid index column: ${i}`)
      );
      db.exec(`CREATE INDEX ${index.join("_")} ON data(${index.join(", ")});`);
    }
    const insert = db.prepare(
      `INSERT INTO data (${columnNames.join(", ")}) VALUES (${columnNames
        .map((n) => "@" + n)
        .join(", ")})`
    );

    const insertAll = db.transaction(() => {
      records.forEach((record, index) => {
        const row: Record<string, any> = {};
        for (const key in record) {
          row[`${key}`] = record[key];
        }
        if (primaryKey === ARRAY_INDEX) {
          row["n"] = index;
        }
        insert.run(row);
      });
    });
    insertAll();
    db.close();
    console.debug(
      `Saved ${records.length} records to ${destination} in ${Math.round(
        performance.now() - start
      )} ms`
    );
  }

  export function getDatabase(dbPath: string): Database.Database {
    const db = new Database(dbPath, { readonly: true });
    db.pragma("journal_mode = WAL");
    return db;
  }
}
