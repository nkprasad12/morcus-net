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
  "sepes (sepia, sepicula => SĒPES",
  "sepes [2] => SĒPES",
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

  test("deduplicates entries with parenthetical variant and same display name", async () => {
    // "sepes (sepia, sepicula" and "sepes [2]" both display "SĒPES" -> deduped to 1
    const results = await dict.getEntry("sepes");
    expect(results).toHaveLength(1);
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

  test("URL for entry with parenthetical key uses only base word", async () => {
    // "ab (a ab abs)" should link to ?searchedLG=ab, not the full parenthetical string
    const results = await dict.getEntry("ab");
    expect(results[0].entry.toString()).toContain("searchedLG=ab");
    expect(results[0].entry.toString()).not.toContain("searchedLG=ab%20");
  });

  test("URL for entry with [N] suffix uses only base word", async () => {
    // "habeo [3]" should link to ?searchedLG=habeo, not habeo%20%5B3%5D
    const results = await dict.getEntry("habeo");
    for (const r of results) {
      expect(r.entry.toString()).toContain("searchedLG=habeo");
      expect(r.entry.toString()).not.toContain("searchedLG=habeo%20");
    }
  });

  test("getCompletions returns expected completions", async () => {
    const completions = await dict.getCompletions("ab");
    expect(completions).toContain("ab");
    expect(completions).toContain("abactor");
    expect(completions).toContain("abactus");
  });
});
