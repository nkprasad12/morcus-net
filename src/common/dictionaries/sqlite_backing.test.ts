import fs from "fs";

import { SqliteDb } from "@/common/sqlite/sql_db";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";

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

  test("save writes to SQL table", async () => {
    const data = [
      {
        id: "n1",
        keys: ["Julius"],
        entry: "Gallia est omnis divisa in partes tres",
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
    expect(orths).toHaveLength(2);
    expect(orths[0]).toEqual({
      id: "n1",
      orth: "Julius",
      cleanOrth: "julius",
    });
    expect(orths[1]).toEqual({
      id: "n2",
      orth: "Publius",
      cleanOrth: "publius",
    });
  });
});
