import fs from "fs";

import { LewisAndShort, StoredEntryData } from "@/common/lewis_and_short/ls";
import { XmlNode } from "@/common/xml/xml_node";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { EntryOutline, EntryResult } from "@/common/dictionaries/dict_result";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import { makeMorpheusDb } from "@/common/lexica/latin_words";

console.debug = jest.fn();

const LS_SUBSET = "testdata/ls/subset_partial_orths.xml";
const TEMP_FILE = "ls.test.ts.tmp.txt";

const MORPH_FILE = "ls.test.ts.tmp.morph.txt";
const INFL_DB_FILE = "ls.test.ts.tmp.lat.db";

const FAKE_OUTLINE: EntryOutline = {
  mainKey: "",
  mainSection: { text: "", level: 0, ordinal: "0", sectionId: "" },
};

beforeAll(() => {
  process.env.LATIN_INFLECTION_DB = INFL_DB_FILE;
  fs.writeFileSync(MORPH_FILE, SAMPLE_MORPHEUS_OUTPUT);
  makeMorpheusDb(MORPH_FILE, INFL_DB_FILE);
});

afterAll(() => {
  try {
    fs.unlinkSync(MORPH_FILE);
  } catch {}
  cleanupSqlTableFiles(INFL_DB_FILE);
});

function toRawDictEntry(keys: string[], entry: any) {
  return StoredEntryData.toRawDictEntry(keys[0], keys, entry);
}

const LS_DATA = [
  toRawDictEntry(["Julius"], {
    entry: new XmlNode("entryFree", [["id", "Julius"]], ["Gallia est omnis"]),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["Publius", "Naso"], {
    entry: new XmlNode(
      "entryFree",
      [["id", "Publius"]],
      ["Non iterum repetenda suo"]
    ),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["Naso"], {
    entry: new XmlNode("entryFree", [["id", "Naso"]], ["Pennisque levatus"]),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["īnō", "Ino"], {
    entry: new XmlNode("entryFree", [["id", "Ino"]], ["Ino edge case"]),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["quis"], {
    entry: new XmlNode(
      "entryFree",
      [["id", "quisNormal"]],
      ["quisUnspecified"]
    ),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["quĭs"], {
    entry: new XmlNode("entryFree", [["id", "quisBreve"]], ["quisShort"]),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["quīs"], {
    entry: new XmlNode("entryFree", [["id", "quisMacron"]], ["quisLong"]),
    outline: FAKE_OUTLINE,
  }),
  toRawDictEntry(["exscio"], {
    entry: new XmlNode("entryFree", [["id", "exscio"]], ["exscio"]),
    outline: FAKE_OUTLINE,
  }),
];

describe("LewisAndShort", () => {
  async function expectEntriesWithIds(
    promise: Promise<EntryResult[]>,
    expected: string[]
  ) {
    const results = await promise;
    const ids = results.map((r) => r.entry.getAttr("id"));
    expect(ids).toStrictEqual(expected);
  }

  afterEach(() => {
    process.env.LATIN_INFLECTION_DB = INFL_DB_FILE;
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

  test("processPerseusXml writes element contents", () => {
    const lewisAndShort = LewisAndShort.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("cāmus")
    );

    expect(result).toHaveLength(1);
    expect(result[0].entry).toContain("A muzzle");
  });

  test("processPerseusXml handles elements with alts", () => {
    const lewisAndShort = LewisAndShort.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("attango")
    );

    expect(result).toHaveLength(1);
    const keys = result[0].keys.split(",");
    expect(keys).toHaveLength(2);
    expect(keys).toContain("adtango");
    expect(keys).toContain("attango");
  });

  test("processPerseusXml handles elements with only alts", () => {
    const lewisAndShort = LewisAndShort.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) => entry.keys.includes("abs-"));

    expect(result).toHaveLength(1);
    const keys = result[0].keys.split(",");
    expect(keys).toHaveLength(1);
    expect(keys).toContain("abs-");
  });

  test("processPerseusXml removes alts if full orths are present", () => {
    const lewisAndShort = LewisAndShort.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("arruo")
    );

    expect(result).toHaveLength(1);
    expect(result[0].keys).toBe("arruo");
  });

  test("getEntryById returns expected entries", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expect(await dict.getEntryById("Juliu")).toBe(undefined);
    const result = await dict.getEntryById("Julius")!;
    expect(result?.entry.getAttr("id")).toBe("Julius");
  });

  test("getEntry returns expected entries", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expectEntriesWithIds(dict.getEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(dict.getEntry("Publius"), ["Publius"]);
  });

  test("getEntry returns expect outlines", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    const outline = (await dict.getEntry("Julius")).map((r) => r.outline);

    expect(outline).toStrictEqual([FAKE_OUTLINE]);
  });

  test("getEntry inflected returns no results with flag off", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    const results = await dict.getEntry("excibat", undefined, {
      handleInflections: false,
    });

    expect(results).toHaveLength(0);
  });

  test("getEntry inflected returns no results with flag undefined", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    const results = await dict.getEntry("excibat", undefined, undefined);

    expect(results).toHaveLength(0);
  });

  test("getEntry inflected gracefully handles flag on with no inflection db", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    process.env = { ...process.env, LATIN_INFLECTION_DB: undefined };
    const results = await dict.getEntry("Julius", undefined, {
      handleInflections: true,
    });

    expect(results).toHaveLength(1);
  });

  test("getEntry inflected returns results with flag on", async () => {
    SqlDict.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    const results = await dict.getEntry("excibat", undefined, {
      handleInflections: true,
    });

    expect(results).toHaveLength(1);
  });
});
