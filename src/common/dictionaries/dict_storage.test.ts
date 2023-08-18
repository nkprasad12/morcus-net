import fs from "fs";

import Database from "better-sqlite3";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { XmlNode } from "@/common/xml_node";
import { XmlNodeSerialization } from "@/common/xml_node_serialization";

console.debug = jest.fn();

const serialize = XmlNodeSerialization.DEFAULT.serialize;

const TEMP_FILE = "dict_storage.ts.tmp.txt";

const FAKE_DICT = [
  {
    keys: ["Julius"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Julius"]], ["Gallia est omnis"])
    ),
  },
  {
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
    keys: ["Naso"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Naso"]], ["Pennisque levatus"])
    ),
  },
  {
    keys: ["īnō", "Ino"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "Ino"]], ["Ino edge case"])
    ),
  },
  {
    keys: ["quis"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisNormal"]], ["quisUnspecified"])
    ),
  },
  {
    keys: ["quĭs"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisBreve"]], ["quisShort"])
    ),
  },
  {
    keys: ["quīs"].join(","),
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisMacron"]], ["quisLong"])
    ),
  },
];

function toDictData(keys: string[]) {
  return keys.map((key) => ({ keys: [key + "_"].join(","), entry: key }));
}

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

function createSqlDict(): SqlDict {
  return new SqlDict(
    TEMP_FILE,
    LatinDict.SmithAndHall,
    (input) =>
      // @ts-expect-error
      input.map((e) => ({
        entry: XmlNodeSerialization.DEFAULT.deserialize(e),
      })),
    (input) => input.split(",")
  );
}

describe("SqlDict", () => {
  async function expectEntriesWithIds(
    promise: Promise<EntryResult[]>,
    expected: string[]
  ) {
    const results = await promise;
    const ids = results.map((r) => r.entry.getAttr("id"));
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

    SqlDict.save([{ keys: ["bar"].join(","), entry: "baz" }], TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes to SQL table", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    SqlDict.save(data, TEMP_FILE);

    const db = new Database(TEMP_FILE, { readonly: true });
    const contents = db.prepare("SELECT * FROM data").all();

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

  test("getEntry handles expected entries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expectEntriesWithIds(dict.getEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(dict.getEntry("Publius"), ["Publius"]);
  });

  test("getEntry handles ambiguous queries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getEntry("Naso"), ["Publius", "Naso"]);
  });

  test("getEntry handles unknown queries", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expect(dict.getEntry("Foo")).resolves.toEqual([]);
  });

  test("getEntry handles same ascii orths in single article", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getEntry("ino"), ["Ino"]);
  });

  test("getEntry without diacritic returns all options", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getEntry("quis"), [
      "quisNormal",
      "quisBreve",
      "quisMacron",
    ]);
  });

  test("getEntry with breve returns short and ambiguous", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getEntry("quĭs"), ["quisNormal", "quisBreve"]);
  });

  test("getEntry with macron returns long and ambiguous", async () => {
    SqlDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(dict.getEntry("quīs"), ["quisNormal", "quisMacron"]);
  });

  test("getCompletions returns expected results", async () => {
    const inputKeys = ["aba", "abbas", "abas", "abat", "abbat", "abatta"];
    SqlDict.save(toDictData(inputKeys), TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("ab")).toStrictEqual([
      "aba_",
      "abas_",
      "abat_",
      "abatta_",
      "abbas_",
      "abbat_",
    ]);
    expect(await dict.getCompletions("abat")).toStrictEqual([
      "abat_",
      "abatta_",
    ]);
    expect(await dict.getCompletions("abba")).toStrictEqual([
      "abbas_",
      "abbat_",
    ]);
    expect(await dict.getCompletions("abbax")).toStrictEqual([]);
  });

  test("getCompletions handles entries with multiple keys", async () => {
    const data = [
      {
        keys: ["Julius", "Iulius"].join(","),
        entry: "",
      },
      {
        keys: ["Julus"].join(","),
        entry: "",
      },
    ];
    SqlDict.save(data, TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("Juliu")).toStrictEqual(["Julius"]);
    expect(await dict.getCompletions("Iuliu")).toStrictEqual(["Iulius"]);
  });

  test("getCompletions handles different capitalization", async () => {
    SqlDict.save(toDictData(["arbor", "Arbor", "arboris"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("ar")).toStrictEqual([
      "arbor_",
      "Arbor_",
      "arboris_",
    ]);
  });

  test("getCompletions removes duplicate orths", async () => {
    SqlDict.save(toDictData(["arbor", "abeo", "abeo"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("a")).toStrictEqual(["abeo_", "arbor_"]);
  });
});
