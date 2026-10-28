import fs from "fs";

import { SqliteDb } from "@/common/sqlite/sql_db";
import {
  sqliteBacking,
  SqliteDict,
  warmLookupPages,
} from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";

console.debug = jest.fn();

const TEMP_FILE = "sqlite_backing.ts.tmp.txt";

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

describe("SqliteDict", () => {
  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
    try {
      fs.unlinkSync(`${TEMP_FILE}-shm`);
    } catch (e) {}
    try {
      fs.unlinkSync(`${TEMP_FILE}-wal`);
    } catch (e) {}
  });

  test("save removes existing contents if present", async () => {
    writeFile("foo");

    SqliteDict.save([{ id: "n1", keys: ["bar"], entry: "baz" }], TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("warmLookupPages reads a saved dictionary without changing it", async () => {
    SqliteDict.save(
      [
        { id: "n1", keys: ["amo"], entry: "love" },
        {
          id: "n2",
          keys: ["habeo"],
          entry: "have",
          derivedKeys: [["s1", ["habitus"]]],
        },
      ],
      TEMP_FILE
    );

    expect(() => warmLookupPages(TEMP_FILE)).not.toThrow();
    expect(sqliteBacking(TEMP_FILE).entriesForIds(["n2"])).toEqual([
      { id: "n2", entry: "have" },
    ]);
  });

  test("warmLookupPages throws for a missing file", async () => {
    expect(() => warmLookupPages("missing.db")).toThrow(/missing\.db/);
  });

  test("save writes to SQL table", async () => {
    const data: RawDictEntry[] = [
      {
        id: "n1",
        keys: ["Julius"],
        entry: "Gallia est omnis divisa in partes tres",
        derivedKeys: [["n1.1", ["Julianus"]]],
      },
      { id: "n2", keys: ["Publius"], entry: "Non iterum repetenda suo" },
    ];
    SqliteDict.save(data, TEMP_FILE);

    const db = SqliteDb.create(TEMP_FILE, { readonly: true });

    const entries = db.prepare("SELECT * FROM entries").all();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "n1",
      entry: data[0].entry,
    });
    expect(entries[1]).toEqual({
      id: "n2",
      entry: data[1].entry,
    });

    const orths = db.prepare("SELECT * FROM orths").all();
    expect(orths).toHaveLength(3);
    expect(orths[0]).toEqual({
      id: "n1",
      orth: "Julius",
      cleanOrth: "julius",
      reverseCleanOrth: "suiluj",
      senseId: null,
    });
    expect(orths[1]).toEqual({
      id: "n1",
      orth: "Julianus",
      cleanOrth: "julianus",
      reverseCleanOrth: "sunailuj",
      senseId: "n1.1",
    });
    expect(orths[2]).toEqual({
      id: "n2",
      orth: "Publius",
      cleanOrth: "publius",
      reverseCleanOrth: "suilbup",
      senseId: null,
    });

    const indices = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orths'"
      )
      .all()
      .map((row: unknown) => (row as { name: string }).name);
    expect(indices).toContain("cleanOrth");
    expect(indices).toContain("reverseCleanOrth");
  });

  test("reverse suffix lookups", async () => {
    const data: RawDictEntry[] = [
      {
        id: "n1",
        keys: ["Julius"],
        entry: "Gallia est omnis divisa in partes tres",
        derivedKeys: [["n1.1", ["Julianus"]]],
      },
      { id: "n2", keys: ["Publius"], entry: "Non iterum repetenda suo" },
    ];
    SqliteDict.save(data, TEMP_FILE);

    const backing = sqliteBacking(TEMP_FILE);

    expect(backing.entryNamesBySuffix("us")).toEqual([
      "Publius",
      "Julius",
      "Julianus",
    ]);
    expect(backing.entryNamesBySuffix("nus")).toEqual(["Julianus"]);
  });
});
