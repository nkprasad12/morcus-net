/* istanbul ignore file */

import type { Database, Options } from "better-sqlite3";

export type SqliteDb = Database;
export namespace SqliteDb {
  export function create(path: string, options?: Options) {
    if (process.env.BUN === "1") {
      /* eslint-disable @typescript-eslint/no-var-requires */
      const { Database } = require("bun:sqlite");
      const db = new Database(path, options);
      db.pragma = (pragma: string) => db.exec(`PRAGMA ${pragma}`);
      return db;
    }

    /* eslint-disable @typescript-eslint/no-var-requires */
    const BetterSqlite3Db = require("better-sqlite3");
    return new BetterSqlite3Db(path, options);
  }
}
