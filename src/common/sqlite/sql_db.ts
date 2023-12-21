import type { Database, Options } from "better-sqlite3";

export type SqliteDb = Database;
export namespace SqliteDb {
  export function create(path: string, options?: Options) {
    const BetterSqlite3Db = require("better-sqlite3");
    return new BetterSqlite3Db(path, options);
  }
}
