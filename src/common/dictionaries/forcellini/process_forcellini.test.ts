import { ForcelliniDict } from "@/common/dictionaries/forcellini/forcellini_dict";
import { processForcellini } from "@/common/dictionaries/forcellini/process_forcellini";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { cleanupSqlTableFiles, replaceEnvVar } from "@/common/test_helpers";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "process_forcellini.test.ts.tmp.db";
const FAKE_RAW_FILE = "process_forcellini.test.ts.raw.txt";

const FAKE_RAW_CONTENT = [
  "habeo => HĂBĔO",
  "habeo [2] => HĂBĔO",
  "habeo [3] => HĂBĔO II",
  "ab (a ab abs) => AB",
  "abactor => ĂBACTOR",
  "abactus [2] => ĂBACTUS",
].join("\n");

replaceEnvVar("FORC_RAW_PATH", FAKE_RAW_FILE);
replaceEnvVar("FORC_PROCESSED_PATH", TEMP_FILE);

describe("processForcellini", () => {
  let dict: ForcelliniDict;

  beforeEach(() => {
    fs.writeFileSync(FAKE_RAW_FILE, FAKE_RAW_CONTENT);
    processForcellini();
    dict = new ForcelliniDict(sqliteBacking(TEMP_FILE), () => []);
  });

  afterEach(() => {
    cleanupSqlTableFiles(TEMP_FILE);
    try {
      fs.unlinkSync(FAKE_RAW_FILE);
    } catch (e) {}
  });

  test("deduplicates entries with same normalized key and display name", async () => {
    // "habeo" and "habeo [2]" both have display "HĂBĔO" -> deduped to 1
    // "habeo [3]" has a different display name -> kept
    const results = await dict.getEntry("habeo");
    expect(results).toHaveLength(2);
  });

  test("getEntry returns empty for unknown word", async () => {
    expect(await dict.getEntry("caesar")).toHaveLength(0);
  });

  test("getEntry returns results for known word", async () => {
    await expect(dict.getEntry("abactor")).resolves.toHaveLength(1);
  });

  test("key strips [N] suffix from lookup key", async () => {
    // "abactus [2]" should be reachable as "abactus"
    await expect(dict.getEntry("abactus")).resolves.toHaveLength(1);
  });

  test("key strips parenthetical alternatives", async () => {
    // "ab (a ab abs)" -> key is "ab"
    await expect(dict.getEntry("ab")).resolves.toHaveLength(1);
  });

  test("getEntryById returns the correct entry", async () => {
    const result = await dict.getEntryById("forc_habeo_0");
    expect(result).toBeDefined();
    expect(result!.outline.mainSection.text).toBe("HĂBĔO");
  });

  test("entry contains display name", async () => {
    const results = await dict.getEntry("abactor");
    expect(results[0].entry.toString()).toContain("ĂBACTOR");
  });

  test("entry contains link to lexica.linguax.com", async () => {
    const results = await dict.getEntry("abactor");
    expect(results[0].entry.toString()).toContain("lexica.linguax.com");
  });

  test("getCompletions returns expected completions", async () => {
    const completions = await dict.getCompletions("ab");
    expect(completions).toContain("ab");
    expect(completions).toContain("abactor");
    expect(completions).toContain("abactus");
  });
});
