import type { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { findEntriesForQuery } from "@/common/dictionaries/latin_dict_fetching";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { cleanupSqlTableFiles } from "@/common/test_helpers";
import type { LatinWordAnalysis } from "@/morceus/cruncher_types";

console.debug = jest.fn();

const TEMP_DB = "latin_dict_fetching.test.ts.tmp.db";

function analysis(lemma: string, form: string): LatinWordAnalysis {
  return {
    lemma,
    inflectedForms: [
      { form, inflectionData: [{ lemma, form, grammaticalData: {} }] },
    ],
  };
}

describe("findEntriesForQuery", () => {
  const DATA: RawDictEntry[] = [
    { id: "n1", keys: ["qui"], entry: "qui" },
    { id: "n2", keys: ["quis", "Quis"], entry: "quis" },
    {
      id: "n3",
      keys: ["uter"],
      entry: "uter",
      derivedKeys: [["n3.1", ["utrum"]]],
    },
  ];

  beforeAll(() => {
    SqliteDict.save(DATA, TEMP_DB);
  });

  afterAll(() => {
    cleanupSqlTableFiles(TEMP_DB);
  });

  function setup(analyses: LatinWordAnalysis[]) {
    const backing = sqliteBacking(TEMP_DB);
    const matchesForCleanName = jest.spyOn(backing, "matchesForCleanName");
    const entriesForIds = jest.spyOn(backing, "entriesForIds");
    const reviver = jest.fn(
      (raw: string): EntryResult => ({
        entry: raw,
        outline: {
          mainKey: raw,
          mainSection: { text: raw, level: 0, ordinal: "", sectionId: raw },
        },
      })
    );
    const query = (input: string) =>
      findEntriesForQuery(input, {
        storage: new StoredDict(backing),
        options: { handleInflections: true },
        inflectionProvider: () => analyses,
        reviver,
        toEntryResult: (x) => x,
        disambiguator: () => true,
      });
    return { query, matchesForCleanName, entriesForIds, reviver };
  }

  it("deduplicates homonym and case-variant lemma lookups", async () => {
    const { query, matchesForCleanName, entriesForIds, reviver } = setup([
      analysis("qui#1", "quae"),
      analysis("qui#2", "quae"),
      analysis("quis#1", "quae"),
      analysis("Quis", "quae"),
    ]);

    const results = await query("quae");

    expect(matchesForCleanName.mock.calls).toEqual([
      ["quae"],
      ["qui"],
      ["quis"],
    ]);
    expect(entriesForIds.mock.calls).toEqual([[["n1"]], [["n2"]]]);
    expect(reviver).toHaveBeenCalledTimes(2);
    // Each analysis still contributes its own inflections.
    expect(results.map((r) => r.entry)).toEqual(["qui", "quis"]);
    expect(results.map((r) => r.inflections?.map((i) => i.lemma))).toEqual([
      ["qui#1", "qui#2"],
      ["quis#1", "Quis"],
    ]);
  });

  it("handles an input that is also a lemma with a sub-entry", async () => {
    const { query, matchesForCleanName } = setup([analysis("utrum", "utrum")]);

    const results = await query("utrum");

    expect(matchesForCleanName.mock.calls).toEqual([["utrum"]]);
    expect(results).toHaveLength(1);
    expect(results[0].entry).toBe("uter");
    expect(results[0].inflections).toBeUndefined();
    expect(results[0].subsections).toEqual([
      {
        id: "n3.1",
        name: "utrum",
        inflections: [{ lemma: "utrum", form: "utrum", data: "" }],
      },
    ]);
  });
});
