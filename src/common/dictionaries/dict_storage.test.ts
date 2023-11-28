import fs from "fs";

import Database from "better-sqlite3";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";

console.debug = jest.fn();

const serialize = XmlNodeSerialization.DEFAULT.serialize;

const TEMP_FILE = "dict_storage.ts.tmp.txt";

const FAKE_DICT = [
  {
    id: "n1",
    keys: ["Julius"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Julius"]], ["Gallia est omnis"])
    ),
  },
  {
    id: "n2",
    keys: ["Publius", "Naso"].join(","),
    entry: serialize(
      new XmlNode(
        "entryFree",
        [["id", "Publius"]],
        ["Non iterum repetenda suo"]
      )
    ),
  },
  {
    id: "n3",
    keys: ["Naso"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Naso"]], ["Pennisque levatus"])
    ),
  },
  {
    id: "n4",
    keys: ["īnō", "Ino"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Ino"]], ["Ino edge case"])
    ),
  },
  {
    id: "n5",
    keys: ["quis"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisNormal"]], ["quisUnspecified"])
    ),
  },
  {
    id: "n6",
    keys: ["quĭs"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisBreve"]], ["quisShort"])
    ),
  },
  {
    id: "n6",
    keys: ["quīs"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisMacron"]], ["quisLong"])
    ),
  },
];

function toDictData(keys: string[]) {
  return keys.map((key, i) => ({
    id: `n${i}`,
    keys: [key + "_"].join(","),
    entry: key,
  }));
}

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

function createSqlDict(): SqlDict {
  return new SqlDict(TEMP_FILE, ",");
}

describe("SqlDict", () => {
  function expectEntriesWithIds(results: string[], expected: string[]) {
    const ids = results
      .map(XmlNodeSerialization.DEFAULT.deserialize)
      .map((r) => r.getAttr("id"));
    expect(ids).toStrictEqual(expected);
  }

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

    SqlDict.save(
      [{ id: "n1", keys: ["bar"].join(","), entry: "baz" }],
      TEMP_FILE
    );

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes to SQL table", async () => {
    const data = [
      {
        id: "n1",
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { id: "n2", keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    SqlDict.save(data, TEMP_FILE);

    const db = new Database(TEMP_FILE, { readonly: true });
    const contents = db.prepare("SELECT * FROM data").all();

    expect(contents).toHaveLength(2);
    expect(contents[0]).toEqual({
      id: "n1",
      keys: data[0].keys,
      entry: data[0].entry,
      n: 0,
    });
    expect(contents[1]).toEqual({
      id: "n2",
      keys: data[1].keys,
      entry: data[1].entry,
      n: 1,
    });
  });

  test("getById returns correct entry.", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expect(dict.getById("n1")?.includes("Gallia est omnis")).toBe(true);
    expect(dict.getById("n112")).toBeUndefined();
  });

  test("getRawEntry handles expected entries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expectEntriesWithIds(dict.getRawEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(dict.getRawEntry("Publius"), ["Publius"]);
  });

  test("getRawEntry handles ambiguous queries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getRawEntry("Naso"), ["Publius", "Naso"]);
  });

  test("getRawEntry handles unknown queries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expect(dict.getRawEntry("Foo")).toEqual([]);
  });

  test("getRawEntry handles same ascii orths in single article", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getRawEntry("ino"), ["Ino"]);
  });

  test("getRawEntry without diacritic returns all options", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getRawEntry("quis"), [
      "quisNormal",
      "quisBreve",
      "quisMacron",
    ]);
  });

  test("getRawEntry with breve returns short and ambiguous", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getRawEntry("quĭs"), ["quisNormal", "quisBreve"]);
  });

  test("getRawEntry with macron returns long and ambiguous", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getRawEntry("quīs"), [
      "quisNormal",
      "quisMacron",
    ]);
  });

  test("getCompletions returns expected results", async () => {
    const inputKeys = ["aba", "abbas", "abas", "abat", "abbat", "abatta"];
    SqlDict.save(toDictData(inputKeys), TEMP_FILE);
    const dict = createSqlDict();

    expect(dict.getCompletions("ab")).toStrictEqual([
      "aba_",
      "abas_",
      "abat_",
      "abatta_",
      "abbas_",
      "abbat_",
    ]);
    expect(dict.getCompletions("abat")).toStrictEqual(["abat_", "abatta_"]);
    expect(dict.getCompletions("abba")).toStrictEqual(["abbas_", "abbat_"]);
    expect(dict.getCompletions("abbax")).toStrictEqual([]);
  });

  test("getCompletions handles entries with multiple keys", async () => {
    const data = [
      { id: "n1", keys: ["Julius", "Iulius"].join(","), entry: "" },
      { id: "n2", keys: ["Julus"].join(","), entry: "" },
    ];
    SqlDict.save(data, TEMP_FILE);
    const dict = createSqlDict();

    expect(dict.getCompletions("Juliu")).toStrictEqual(["Julius"]);
    expect(dict.getCompletions("Iuliu")).toStrictEqual(["Iulius"]);
  });

  test("getCompletions handles different capitalization", async () => {
    SqlDict.save(toDictData(["arbor", "Arbor", "arboris"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(dict.getCompletions("ar")).toStrictEqual([
      "arbor_",
      "Arbor_",
      "arboris_",
    ]);
  });

  test("getCompletions removes duplicate orths", async () => {
    SqlDict.save(toDictData(["arbor", "abeo", "abeo"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(dict.getCompletions("a")).toStrictEqual(["abeo_", "arbor_"]);
  });
});
