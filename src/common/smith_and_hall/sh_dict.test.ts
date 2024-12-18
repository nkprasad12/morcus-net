import { EntryResult } from "@/common/dictionaries/dict_result";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { shListToRaw } from "@/common/smith_and_hall/sh_process";
import { XmlNode } from "@/common/xml/xml_node";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "sh_dict.test.ts.tmp.txt";

const SH_ENTRIES: ShEntry[] = [
  { keys: ["Hi", "Hello"], blurb: "Greetings", senses: [] },
  { keys: ["Hello"], blurb: "Loop", senses: [] },
];

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

beforeAll(() => {
  process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
});

afterAll(() => {
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

async function expectEntriesWithIds(
  promise: Promise<EntryResult[]>,
  expected: string[]
) {
  const results = await promise;
  const ids = results.map((r) =>
    XmlNode.assertIsNode(r.entry.children[0]).getAttr("id")
  );
  expect(ids).toStrictEqual(expected);
}

describe("SmithAndHall dict", () => {
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

  test("getEntry returns expected entries", async () => {
    SqliteDict.save(shListToRaw(SH_ENTRIES), TEMP_FILE);
    const dict = new SmithAndHall(sqliteBacking(TEMP_FILE));

    expect(await dict.getEntry("Julius")).toEqual([]);
    await expectEntriesWithIds(dict.getEntry("Hi"), ["sh0"]);
    await expectEntriesWithIds(dict.getEntry("Hello"), ["sh0", "sh1"]);
  });

  test("getEntryById returns expected entries", async () => {
    SqliteDict.save(shListToRaw(SH_ENTRIES), TEMP_FILE);
    const dict = new SmithAndHall(sqliteBacking(TEMP_FILE));

    expect(await dict.getEntryById("n1")).toEqual(undefined);
    const result = await dict.getEntryById("sh1");
    expect(result?.entry.toString().includes("Loop")).toBe(true);
  });

  test("getEntry returns expected completions", async () => {
    SqliteDict.save(shListToRaw(SH_ENTRIES), TEMP_FILE);
    const dict = new SmithAndHall(sqliteBacking(TEMP_FILE));

    expect(await dict.getCompletions("H")).toEqual(["Hello", "Hi"]);
  });
});
