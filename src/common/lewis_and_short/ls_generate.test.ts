import fs from "fs";

import { XmlNode } from "@/common/xml/xml_node";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import { EntryOutline, EntryResult } from "@/common/dictionaries/dict_result";
import {
  LewisAndShort,
  StoredEntryData,
} from "@/common/lewis_and_short/ls_dict";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { MorceusCruncher } from "@/morceus/crunch";
import { CruncherOptions } from "@/morceus/cruncher_types";

console.debug = jest.fn();

const LS_SUBSET = "testdata/ls/subset_partial_orths.xml";
const TEMP_FILE = "ls.test.ts.tmp.txt";

const INFL_DB_FILE = "ls.test.ts.tmp.lat.db";

const FAKE_OUTLINE: EntryOutline = {
  mainKey: "",
  mainSection: { text: "", level: 0, ordinal: "0", sectionId: "" },
};

const ORIGINAL_MORPHEUS_ROOT = process.env.MORPHEUS_ROOT;
const FAKE_MORPHEUS_ROOT = "src/morceus/testdata";

beforeAll(() => {
  process.env.MORPHEUS_ROOT = FAKE_MORPHEUS_ROOT;
});

afterAll(() => {
  process.env.MORPHEUS_ROOT = ORIGINAL_MORPHEUS_ROOT;
});

function createLewisAndShort(backing: StoredDictBacking<any>) {
  const tables = MorceusTables.CACHED.get();
  const cruncher = MorceusCruncher.make(tables);
  return LewisAndShort.create(backing, (word) =>
    cruncher(word, CruncherOptions.DEFAULT)
  );
}

function toRawDictEntry(keys: string[], entry: StoredEntryData) {
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
  toRawDictEntry(["excio"], {
    entry: new XmlNode("entryFree", [["id", "excio"]], ["excio"]),
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
    const lewisAndShort = GenerateLs.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("cāmus")
    );

    expect(result).toHaveLength(1);
    expect(result[0].entry).toContain("A muzzle");
  });

  test("processPerseusXml handles elements with alts", () => {
    const lewisAndShort = GenerateLs.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("attango")
    );

    expect(result).toHaveLength(1);
    const keys = result[0].keys;
    expect(keys).toHaveLength(2);
    expect(keys).toContain("adtango");
    expect(keys).toContain("attango");
  });

  test("processPerseusXml handles elements with only alts", () => {
    const lewisAndShort = GenerateLs.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) => entry.keys.includes("abs-"));

    expect(result).toHaveLength(1);
    const keys = result[0].keys;
    expect(keys).toHaveLength(1);
    expect(keys).toContain("abs-");
  });

  test("processPerseusXml removes alts if full orths are present", () => {
    const lewisAndShort = GenerateLs.processPerseusXml(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("arruo")
    );

    expect(result).toHaveLength(1);
    expect(result[0].keys).toStrictEqual(["arruo"]);
  });

  test("getEntryById returns expected entries", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    expect(await dict.getEntryById("Juliu")).toBe(undefined);
    const result = await dict.getEntryById("Julius")!;
    expect(result?.entry.getAttr("id")).toBe("Julius");
  });

  test("getEntry returns expected entries", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    expectEntriesWithIds(dict.getEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(dict.getEntry("Publius"), ["Publius"]);
  });

  test("getEntry returns expect outlines", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    const outline = (await dict.getEntry("Julius")).map((r) => r.outline);

    expect(outline).toStrictEqual([FAKE_OUTLINE]);
  });

  test("getEntry inflected returns no results with flag off", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    const results = await dict.getEntry("excibat", undefined, {
      handleInflections: false,
    });

    expect(results).toHaveLength(0);
  });

  test("getEntry inflected returns no results with flag undefined", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    const results = await dict.getEntry("excibat", undefined, undefined);

    expect(results).toHaveLength(0);
  });

  test("getEntry inflected gracefully handles flag on with no inflection db", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    const results = await dict.getEntry("Julius", undefined, {
      handleInflections: true,
    });

    expect(results).toHaveLength(1);
  });

  test("getEntry inflected returns results with flag on", async () => {
    SqliteDict.save(LS_DATA, TEMP_FILE);
    const dict = createLewisAndShort(sqliteBacking(TEMP_FILE));

    const results = await dict.getEntry("excibat", undefined, {
      handleInflections: true,
    });

    expect(results).toHaveLength(1);
  });
});
