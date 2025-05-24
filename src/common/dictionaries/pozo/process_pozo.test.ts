import { EntryResult } from "@/common/dictionaries/dict_result";
import { PozoDict } from "@/common/dictionaries/pozo/pozo_dict";
import { processPozo } from "@/common/dictionaries/pozo/process_pozo";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { cleanupSqlTableFiles, replaceEnvVar } from "@/common/test_helpers";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "pozo_dict.test.ts.tmp.txt";
const FAKE_RAW_FILE = "pozo_dict.test.ts.raw.txt";

const POZO_TEXT_DATA = `
key1
*KEY1* This is the first part of the definition for key1.
It can span multiple lines.
>This is the first sense for key1.
>This is the second sense for key1, also on multiple
lines.

key2
*KEY2*
A simple definition for key2.

key1
*KEY1*
This is a second entry for key1 (duplicate).
>Sense A for duplicate key1.
`;

replaceEnvVar("POZO_RAW_PATH", FAKE_RAW_FILE);
replaceEnvVar("POZO_PROCESSED_PATH", TEMP_FILE);

async function expectEntryContent(
  promise: Promise<EntryResult[]>,
  expectedContent: string[]
) {
  const results = await promise;
  const contents = results.map((r) => r.entry.toString());
  for (const expected of expectedContent) {
    expect(contents.some((content) => content.includes(expected))).toBe(true);
  }
}

describe("PozoDict dict", () => {
  let dict: PozoDict;

  beforeEach(() => {
    fs.writeFileSync(FAKE_RAW_FILE, POZO_TEXT_DATA);
    processPozo();
    dict = new PozoDict(sqliteBacking(TEMP_FILE));
  });

  afterEach(() => {
    cleanupSqlTableFiles(TEMP_FILE);
    try {
      fs.unlinkSync(FAKE_RAW_FILE);
    } catch (e) {}
  });

  test("getEntry returns expected entries", async () => {
    expect(await dict.getEntry("nonexistentkey")).toEqual([]);
    const key1Entries = await dict.getEntry("key1");
    expect(key1Entries).toHaveLength(2); // Two entries for key1

    await expectEntryContent(dict.getEntry("key1"), [
      "first part of the definition for key1",
      "first sense for key1",
      "second sense for key1",
      "second entry for key1",
      "Sense A for duplicate key1",
    ]);

    const key2Entries = await dict.getEntry("key2");
    expect(key2Entries).toHaveLength(1);
    await expectEntryContent(dict.getEntry("key2"), [
      "simple definition for key2",
    ]);
  });

  test("getEntryById returns expected entries", async () => {
    // IDs are pozo_key, pozo_key2, pozo_key3 etc. for duplicates
    const result1 = await dict.getEntryById("pozo_key1");
    expect(result1?.entry.toString()).toContain(
      "first part of the definition for key1"
    );

    const result2 = await dict.getEntryById("pozo_key2");
    expect(result2?.entry.toString()).toContain("simple definition for key2");

    const result1Dupe = await dict.getEntryById("pozo_key12"); // Second entry for key1
    expect(result1Dupe?.entry.toString()).toContain("second entry for key1");
  });

  test("getCompletions returns expected completions", async () => {
    expect(await dict.getCompletions("k")).toEqual(["key1", "key2"]);
    expect(await dict.getCompletions("key1")).toEqual(["key1"]);
    expect(await dict.getCompletions("key2")).toEqual(["key2"]);
  });

  test("entry structure and outline are correct for multi-sense entry", async () => {
    const results = await dict.getEntry("key1");
    const entryResult = results.find(
      (r) => r.entry.getAttr("id") === "pozo_key1"
    );
    expect(entryResult).toBeDefined();

    const entryNode = entryResult!.entry;
    const outline = entryResult!.outline;

    // Basic HTML check
    expect(entryNode.toString()).toContain(
      "<div>*KEY1* This is the first part of the definition for key1.</div>"
    );

    expect(outline?.mainKey).toBe("key1");
    expect(outline?.mainSection.sectionId).toBe("pozo_key1");
    // Pozo's current process_pozo doesn't create detailed sense outlines like Georges
    // It has a flat outline structure.
    expect(outline?.senses).toBeUndefined();
  });

  test("handles empty or malformed lines gracefully during processing", () => {
    // This test relies on processPozo not crashing with varied input.
    // The current POZO_TEXT_DATA includes blank lines which are handled.
    // More specific malformed data could be added here if needed.
    expect(() => {
      fs.writeFileSync(
        FAKE_RAW_FILE,
        POZO_TEXT_DATA + "\\n\\n\\n>orphaned sense\\n"
      );
      processPozo();
      new PozoDict(sqliteBacking(TEMP_FILE));
    }).not.toThrow();
  });
});
