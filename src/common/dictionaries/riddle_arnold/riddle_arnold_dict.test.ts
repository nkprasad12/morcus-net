import { EntryResult } from "@/common/dictionaries/dict_result";
import { processRiddleArnold } from "@/common/dictionaries/riddle_arnold/process_riddle_arnold";
import { RiddleArnoldDict } from "@/common/dictionaries/riddle_arnold/riddle_arnold_dict";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { replaceEnvVar } from "@/common/test_helpers";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "riddle_arnold_dict.test.ts.tmp.txt";
const FAKE_RAW_FILE = "riddle_arnold_dict.test.ts.raw.txt";

const RA_ENTRIES: string[] = [
  "HELLO\ta greeting",
  "SUP\tsup1",
  "SUP\tsup2",
  "HI, HEYO\tinformal",
];

const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

replaceEnvVar("MORCEUS_DATA_ROOT", FAKE_MORCEUS_DATA_ROOT);
replaceEnvVar("RA_PATH", FAKE_RAW_FILE);
replaceEnvVar("RA_PROCESSED_PATH", TEMP_FILE);

async function expectEntriesWithIds(
  promise: Promise<EntryResult[]>,
  expected: string[]
) {
  const results = await promise;
  const ids = results.map((r) => r.entry.getAttr("id"));
  expect(ids).toStrictEqual(expected);
}

describe("RiddleArnold dict", () => {
  beforeEach(() => {
    fs.writeFileSync(FAKE_RAW_FILE, RA_ENTRIES.join("\n"));
    processRiddleArnold();
  });

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
    try {
      fs.unlinkSync(FAKE_RAW_FILE);
    } catch (e) {}
  });

  test("getEntry returns expected entries", async () => {
    const dict = new RiddleArnoldDict(sqliteBacking(TEMP_FILE));

    expect(await dict.getEntry("Julius")).toEqual([]);
    await expectEntriesWithIds(dict.getEntry("hello"), ["ra_hello"]);
  });

  test("processing merges identical keys", async () => {
    const dict = new RiddleArnoldDict(sqliteBacking(TEMP_FILE));

    const result = await dict.getEntry("sup");
    expect(result).toHaveLength(1);
    const entry = result[0].entry.toString();
    expect(entry).toContain("sup1");
    expect(entry).toContain("sup2");
  });

  test("getEntryById returns expected entries", async () => {
    const dict = new RiddleArnoldDict(sqliteBacking(TEMP_FILE));

    const result = await dict.getEntryById("ra_hello");
    expect(result?.entry.toString()).toContain("a greeting");
  });

  test("getEntry returns expected completions", async () => {
    const dict = new RiddleArnoldDict(sqliteBacking(TEMP_FILE));

    expect(await dict.getCompletions("H")).toEqual(["hello", "heyo", "hi"]);
  });
});
