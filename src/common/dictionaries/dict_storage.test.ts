import fs from "fs";

import {
  StoredDict,
  type StoredEntryAndMetadata,
} from "@/common/dictionaries/dict_storage";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";

console.debug = jest.fn();

const serialize = XmlNodeSerialization.DEFAULT.serialize;

const TEMP_FILE = "dict_storage.ts.tmp.txt";

const FAKE_DICT: RawDictEntry[] = [
  {
    id: "n1",
    keys: ["Julius"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "Julius"]], ["Gallia est omnis"])
    ),
    derivedKeys: [["n1.1", ["Julianus"]]],
  },
  {
    id: "n2",
    keys: ["Publius", "Naso"],
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
    keys: ["Naso"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "Naso"]], ["Pennisque levatus"])
    ),
  },
  {
    id: "n4",
    keys: ["īnō", "Ino"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "Ino"]], ["Ino edge case"])
    ),
  },
  {
    id: "n5",
    keys: ["quis"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisNormal"]], ["quisUnspecified"])
    ),
  },
  {
    id: "n6",
    keys: ["quĭs"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisBreve"]], ["quisShort"])
    ),
  },
  {
    id: "n7",
    keys: ["quīs"],
    entry: serialize(
      new XmlNode("entryFree", [["id", "quisMacron"]], ["quisLong"])
    ),
  },
];

function toDictData(keys: string[]) {
  return keys.map((key, i) => ({
    id: `n${i}`,
    keys: [key + "_"],
    entry: key,
  }));
}

function createSqlDict(): StoredDict {
  return new StoredDict(sqliteBacking(TEMP_FILE));
}

describe("SqlDict", () => {
  function expectEntriesWithIds(
    results: StoredEntryAndMetadata[],
    expected: string[]
  ) {
    const ids = results
      .map(({ entry }) => entry)
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

  test("getById returns correct entry.", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expect((await dict.getById("n1"))?.includes("Gallia est omnis")).toBe(true);
    expect(await dict.getById("n112")).toBeUndefined();
  });

  test("getRawEntry handles expected entries", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expectEntriesWithIds(await dict.getRawEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(await dict.getRawEntry("Publius"), ["Publius"]);
  });

  test("getRawEntry handles expected entries with combiners", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();

    expectEntriesWithIds(await dict.getRawEntry("Juli\u0304us"), ["Julius"]);
  });

  test("getRawEntry handles entries by derived key", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("Julianus"), ["Julius"]);
  });

  test("getRawEntry handles ambiguous queries", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("Naso"), ["Publius", "Naso"]);
  });

  test("getRawEntry handles unknown queries", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expect(await dict.getRawEntry("Foo")).toEqual([]);
  });

  test("getRawEntry handles same ascii orths in single article", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("ino"), ["Ino"]);
  });

  test("getRawEntry without diacritic returns all options", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("quis"), [
      "quisNormal",
      "quisBreve",
      "quisMacron",
    ]);
  });

  test("getRawEntry with breve returns short and ambiguous", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("quĭs"), [
      "quisNormal",
      "quisBreve",
    ]);
  });

  test("getRawEntry with macron returns long and ambiguous", async () => {
    SqliteDict.save(FAKE_DICT, TEMP_FILE);
    const dict = createSqlDict();
    expectEntriesWithIds(await dict.getRawEntry("quīs"), [
      "quisNormal",
      "quisMacron",
    ]);
  });

  test("getCompletions returns expected results", async () => {
    const inputKeys = ["aba", "abbas", "abas", "abat", "abbat", "abatta"];
    SqliteDict.save(toDictData(inputKeys), TEMP_FILE);
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
      { id: "n1", keys: ["Julius", "Iulius"], entry: "" },
      { id: "n2", keys: ["Julus"], entry: "" },
    ];
    SqliteDict.save(data, TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("Juliu")).toStrictEqual(["Julius"]);
    expect(await dict.getCompletions("Iuliu")).toStrictEqual(["Iulius"]);
  });

  test("getCompletions handles different capitalization", async () => {
    SqliteDict.save(toDictData(["arbor", "Arbor", "arboris"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("ar")).toStrictEqual([
      "arbor_",
      "Arbor_",
      "arboris_",
    ]);
  });

  test("getCompletions removes duplicate orths", async () => {
    SqliteDict.save(toDictData(["arbor", "abeo", "abeo"]), TEMP_FILE);
    const dict = createSqlDict();

    expect(await dict.getCompletions("a")).toStrictEqual(["abeo_", "arbor_"]);
  });
});
