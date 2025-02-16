import { EntryResult } from "@/common/dictionaries/dict_result";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import { GaffiotDict } from "@/common/gaffiot/gaf_dict";
import { processGaffiot } from "@/common/gaffiot/process_gaffiot";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import { XmlNode } from "@/common/xml/xml_node";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "gaf_dict.test.ts.tmp.txt";
const TEMP_DB = "gaf_dict.test.ts.tmp.db";

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

beforeAll(() => {
  process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
});

afterAll(() => {
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

const FAKE_GAFFIOT = {
  "2 a": {
    article: "\\entree{2 ā} ou \\es{āh,} interj., v. \\latv{ah}.   ",
  },
  abactio: {
    article:
      "\\entree{ăbāctĭō,} \\des{ōnis,} \\gen{f.} \\lat{(abigo),} détournement : \\aut{Hier.} \\oeuv{Jer.} \\refch{1, 5, 15}.   ",
  },
  Abacuc: {
    article:
      "\\entree{Abăcūc,} \\gen{m.} indécl., prophète des Hébreux : \\aut{Eccl.}   ",
  },
  testEntry1: {
    article: "\\entree{testEntry1,} \\S1 \\F \\S2",
  },
  testEntry2: {
    article: "\\entree{testEntry2}\\gras{bold}",
  },
};

async function expectEntriesWithIds(
  promise: Promise<EntryResult[]>,
  expected: string[]
) {
  const results = await promise;
  const ids = results.map((r) => XmlNode.assertIsNode(r.entry).getAttr("id"));
  expect(ids).toStrictEqual(expected);
}

describe("GaffiotDict", () => {
  let dict: GaffiotDict;

  beforeAll(() => {
    process.env.GAFFIOT_RAW_PATH = TEMP_FILE;
    fs.writeFileSync(TEMP_FILE, JSON.stringify(FAKE_GAFFIOT));
    SqliteDict.save(processGaffiot(), TEMP_DB);
    dict = new GaffiotDict(sqliteBacking(TEMP_DB));
  });

  afterAll(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
    cleanupSqlTableFiles(TEMP_DB);
  });

  test("getEntry returns expected entries", async () => {
    expect(await dict.getEntry("Julius")).toEqual([]);
    await expectEntriesWithIds(dict.getEntry("abactio"), ["gaf-abactio"]);
  });

  test("getEntryById returns expected entries", async () => {
    expect(await dict.getEntryById("n1")).toEqual(undefined);
    const result = await dict.getEntryById("gaf-2a");
    expect(result?.entry.toString().includes("gaf-2a")).toBe(true);
  });

  test("getCompletions returns expected completions", async () => {
    expect(await dict.getCompletions("ab")).toEqual(["ăbāctĭō", "Abăcūc"]);
  });

  test("processes section and arrows correction.", async () => {
    const result = await dict.getEntry("testEntry1");
    expect(result).toHaveLength(1);
    const entry = result[0].entry;

    expect(entry.children.slice(1)).toStrictEqual([
      " ",
      "§",
      "1 ",
      "➳",
      " ",
      "§",
      "2",
    ]);
  });

  test("processes bold entries.", async () => {
    const result = await dict.getEntry("testEntry2");
    expect(result).toHaveLength(1);
    const entry = result[0].entry;

    expect(entry.children[1]).toStrictEqual(new XmlNode("b", [], ["bold"]));
  });
});
