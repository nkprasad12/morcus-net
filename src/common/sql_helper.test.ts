import fs from "fs";

import { ARRAY_INDEX, DbConfig, ReadOnlyDb } from "@/common/sql_helper";
import { cleanupSqlTableFiles } from "@/common/test_helpers";
import { SqliteDb } from "@/common/sqlite/sql_db";

console.debug = jest.fn();

const TEMP_FILE = "sql_helper.ts.tmp.txt";

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

function makeTable(
  records: object[],
  primaryKey: string = ARRAY_INDEX,
  indices: string[][] = []
) {
  ReadOnlyDb.saveToSql(DbConfig.of(TEMP_FILE, records, primaryKey, indices));
}

function getIndices(db: SqliteDb): string[] {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      // @ts-ignore
      .map((row) => row.name)
  );
}

describe("SqlDict", () => {
  afterEach(() => {
    cleanupSqlTableFiles(TEMP_FILE);
  });

  test("getDatabase throws with useful message", async () => {
    expect(() => ReadOnlyDb.getDatabase("unknown.db")).toThrow(
      /Unable to read.*unknown\.db/
    );
  });

  test("save removes existing contents if present", async () => {
    writeFile("foo");

    makeTable([{ row: "bar" }]);

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes to SQL table with index primary key", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    makeTable(data);

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });
    const contents = db.prepare("SELECT * FROM data").all();

    expect(getIndices(db)).toEqual([]);
    expect(contents).toHaveLength(2);
    expect(contents[0]).toEqual({
      keys: data[0].keys,
      entry: data[0].entry,
      n: 0,
    });
    expect(contents[1]).toEqual({
      keys: data[1].keys,
      entry: data[1].entry,
      n: 1,
    });
  });

  test("save writes to SQL table with column primary key", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    makeTable(data, "entry");

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });
    const contents = db.prepare("SELECT * FROM data").all();

    expect(getIndices(db)).toHaveLength(1);
    expect(contents).toHaveLength(2);
    expect(contents[0]).toEqual({
      keys: data[0].keys,
      entry: data[0].entry,
    });
    expect(contents[1]).toEqual({
      keys: data[1].keys,
      entry: data[1].entry,
    });
  });

  test("save with indices adds extra indices", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    makeTable(data, "entry", [["keys"]]);

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });

    expect(getIndices(db)).toHaveLength(2);
  });

  test("column primary key is a unique index used for lookups", async () => {
    const data = [
      { keys: "Julius", entry: "Gallia" },
      { keys: "Publius", entry: "Roma" },
    ];
    makeTable(data, "entry");

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT keys FROM data WHERE entry = ?")
      .all("Roma")
      // @ts-ignore
      .map((row) => row.detail);

    expect(getIndices(db)).toEqual(["data_entry"]);
    expect(plan.join()).toContain("data_entry");
    expect(
      db.prepare("SELECT keys FROM data WHERE entry = ?").get("Roma")
    ).toEqual({ keys: "Publius" });
  });

  test("save throws on a duplicate column primary key", async () => {
    const data = [
      { keys: "Julius", entry: "Gallia" },
      { keys: "Publius", entry: "Gallia" },
    ];
    expect(() => makeTable(data, "entry")).toThrow(/UNIQUE/);
  });

  test("column primary key index pages are contiguous", async () => {
    // Enough large rows that a row-by-row index would interleave its pages
    // with the table's.
    const data = Array.from({ length: 3000 }, (_, i) => ({
      id: `id${String(i).padStart(5, "0")}`,
      entry: "x".repeat(500),
    }));
    makeTable(data, "id");

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });
    const pages = db
      .prepare("SELECT pageno FROM dbstat WHERE name = 'data_id'")
      .all()
      // @ts-ignore
      .map((row) => row.pageno as number);

    expect(pages.length).toBeGreaterThan(1);
    expect(Math.max(...pages) - Math.min(...pages) + 1).toBe(pages.length);
  });

  test("save throws with invalid column primary key", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    expect(() => makeTable(data, "baz")).toThrow("Invalid primary");
  });

  test("save throws with invalid index names", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    expect(() => makeTable(data, "entry", [["baz"]])).toThrow("Invalid index");
  });
});
