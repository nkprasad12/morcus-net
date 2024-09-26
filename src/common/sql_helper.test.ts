import fs from "fs";

import { ARRAY_INDEX, DbConfig, ReadOnlyDb } from "@/common/sql_helper";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
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
    expect(() => makeTable(data, "entry", [["baz"]])).toThrow(
      "Invalid index"
    );
  });
});
