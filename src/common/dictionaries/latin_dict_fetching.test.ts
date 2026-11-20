import type { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { findEntriesForQuery } from "@/common/dictionaries/latin_dict_fetching";
import {
  sqliteBacking,
  SqliteDict,
} from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { cleanupSqlTableFiles } from "@/common/test_helpers";
import type { CrunchResult, LatinWordAnalysis } from "@/morceus/cruncher_types";
import { LatinNumber } from "@/morceus/types";

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

  it("folds precomposed ligatures and Roman numeral codepoints and ignores non-length combining marks", async () => {
    const ligatureSetup = setup([analysis("qui#1", "quae")]);
    const ligatureResults = await ligatureSetup.query("quǽ");
    expect(ligatureSetup.matchesForCleanName).toHaveBeenCalledWith("quae");
    expect(ligatureResults.map((r) => r.entry)).toEqual(["qui"]);

    const upperSetup = setup([analysis("qui#1", "quae")]);
    const upperLigatureResults = await upperSetup.query("QUǢ");
    expect(upperSetup.matchesForCleanName).toHaveBeenCalledWith("quae");
    expect(upperLigatureResults.map((r) => r.entry)).toEqual(["qui"]);

    const numeralSetup = setup([]);
    const numeralResults = await numeralSetup.query("ⅹ\u0305ⅰ\u0305ⅰ\u0305");
    expect(numeralSetup.matchesForCleanName).toHaveBeenCalledWith("xii");
    expect(numeralResults).toEqual([]);

    const ictusSetup = setup([analysis("quis#1", "quĭs")]);
    const ictusResults = await ictusSetup.query("quís");
    expect(ictusSetup.matchesForCleanName).toHaveBeenCalledWith("quis");
    expect(ictusResults.map((r) => r.entry)).toEqual(["quis"]);
  });

  it("omits vowel-incompatible inflected forms from the same lemma", async () => {
    const { query } = setup([
      {
        lemma: "quis#1",
        inflectedForms: [
          {
            form: "quĭs",
            inflectionData: [
              {
                lemma: "quis#1",
                form: "quĭs",
                grammaticalData: { number: LatinNumber.Singular },
              },
            ],
          },
          {
            form: "quīs",
            inflectionData: [
              {
                lemma: "quis#1",
                form: "quīs",
                grammaticalData: { number: LatinNumber.Plural },
              },
            ],
          },
        ],
      },
    ]);

    const results = await query("quīs");

    expect(results).toHaveLength(1);
    expect(results[0].inflections).toEqual([
      { lemma: "quis#1", form: "quīs", data: "pl", usageNote: undefined },
    ]);
  });

  it("does not duplicate inflections when merging main entry and subsection", async () => {
    const tempDb = "latin_dict_fetching.alias.test.tmp.db";
    SqliteDict.save(
      [
        {
          id: "n10",
          keys: ["pars"],
          entry: "pars",
          derivedKeys: [["n10.1", ["pars"]]],
        },
      ],
      tempDb
    );
    try {
      const backing = sqliteBacking(tempDb);
      const reviver = (raw: string): EntryResult => ({
        entry: raw,
        outline: {
          mainKey: raw,
          mainSection: { text: raw, level: 0, ordinal: "", sectionId: raw },
        },
      });
      const results = await findEntriesForQuery("partis", {
        storage: new StoredDict(backing),
        options: { handleInflections: true },
        inflectionProvider: () => [
          analysis("pars#1", "partis"),
          analysis("pars#2", "partis"),
        ],
        reviver,
        toEntryResult: (x) => x,
        disambiguator: () => true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].inflections).toEqual([
        { lemma: "pars#1", form: "partis", data: "", usageNote: undefined },
        { lemma: "pars#2", form: "partis", data: "", usageNote: undefined },
      ]);
      expect(results[0].subsections).toEqual([
        {
          id: "n10.1",
          name: "pars",
          inflections: [
            { lemma: "pars#1", form: "partis", data: "", usageNote: undefined },
            { lemma: "pars#2", form: "partis", data: "", usageNote: undefined },
          ],
        },
      ]);
    } finally {
      cleanupSqlTableFiles(tempDb);
    }
  });
});

describe("findEntriesForQuery ranking tiers", () => {
  const RANKING_DB = "latin_dict_fetching.ranking.test.tmp.db";
  // Minimal synthetic dictionary entries reused across tiering test cases.
  const ENTRIES: RawDictEntry[] = [
    { id: "e_head", keys: ["head"], entry: "head" },
    { id: "e_moveo", keys: ["moveo"], entry: "moveo" },
    { id: "e_admoveo", keys: ["admoveo"], entry: "admoveo" },
    { id: "e_mora", keys: ["mora"], entry: "mora" },
    { id: "e_mos", keys: ["mos"], entry: "mos" },
    { id: "e_morior", keys: ["morior"], entry: "morior" },
    { id: "e_nosco", keys: ["nosco"], entry: "nosco" },
    { id: "e_nostius", keys: ["Nostius"], entry: "Nostius" },
    { id: "e_imberbis", keys: ["imberbis"], entry: "imberbis" },
  ];

  beforeAll(() => {
    SqliteDict.save(ENTRIES, RANKING_DB);
  });

  afterAll(() => {
    cleanupSqlTableFiles(RANKING_DB);
  });

  function makeInfo(
    lemma: string,
    form: string,
    opts?: { tags?: string[]; relaxedCase?: true }
  ): CrunchResult {
    return {
      lemma,
      form,
      grammaticalData: {},
      tags: opts?.tags,
      relaxedCase: opts?.relaxedCase,
    };
  }

  function queryWith(input: string, analyses: LatinWordAnalysis[]) {
    const backing = sqliteBacking(RANKING_DB);
    return findEntriesForQuery(input, {
      storage: new StoredDict(backing),
      options: { handleInflections: true },
      inflectionProvider: () => analyses,
      reviver: (raw): EntryResult => ({
        entry: raw,
        outline: {
          mainKey: raw,
          mainSection: { text: raw, level: 0, ordinal: "", sectionId: raw },
        },
      }),
      toEntryResult: (x) => x,
      disambiguator: () => true,
    });
  }

  it("orders Tiers 2 through 5 lexicographically by exact-case, then non-deranked", async () => {
    const results = await queryWith("moris", [
      // Tier 5: relaxedCase + deranked
      {
        lemma: "Nostius",
        inflectedForms: [
          {
            form: "moris",
            inflectionData: [
              makeInfo("Nostius", "moris", {
                tags: ["poetic"],
                relaxedCase: true,
              }),
            ],
          },
        ],
      },
      // Tier 4: relaxedCase + primary
      {
        lemma: "imberbis",
        inflectedForms: [
          {
            form: "moris",
            inflectionData: [
              makeInfo("imberbis", "moris", { relaxedCase: true }),
            ],
          },
        ],
      },
      // Tier 3: exact-case + deranked (appears first from cruncher)
      {
        lemma: "moveo",
        inflectedForms: [
          {
            form: "mo_ris",
            inflectionData: [makeInfo("moveo", "mo_ris", { tags: ["contr"] })],
          },
        ],
      },
      // Tier 2: exact-case + primary (relative Morceus order preserved)
      analysis("mora", "mo^ri_s"),
      analysis("mos", "mo_ris"),
    ]);

    expect(results.map((r) => r.entry)).toEqual([
      "mora",
      "mos",
      "moveo",
      "imberbis",
      "Nostius",
    ]);
  });

  it("keeps exact headwords in Tier 1 even when tagged deranked or relaxedCase", async () => {
    const results = await queryWith("head", [
      {
        lemma: "head",
        inflectedForms: [
          {
            form: "head",
            inflectionData: [
              makeInfo("head", "head", {
                tags: ["archaic"],
                relaxedCase: true,
              }),
            ],
          },
        ],
      },
      analysis("mos", "head"),
    ]);

    expect(results.map((r) => r.entry)).toEqual(["head", "mos"]);
  });

  it("keeps exact-case contracted/syncopated verbs above relaxed-case proper nouns (nosti pattern)", async () => {
    const results = await queryWith("nosti", [
      {
        lemma: "nosco",
        inflectedForms: [
          {
            form: "no_sti_",
            inflectionData: [makeInfo("nosco", "no_sti_", { tags: ["contr"] })],
          },
        ],
      },
      {
        lemma: "Nostius",
        inflectedForms: [
          {
            form: "Nosti_",
            inflectionData: [
              makeInfo("Nostius", "Nosti_", { relaxedCase: true }),
            ],
          },
        ],
      },
    ]);

    expect(results.map((r) => r.entry)).toEqual(["nosco", "Nostius"]);
  });

  it("does not derank orth, variant, greek, or dep tags", async () => {
    const results = await queryWith("inberbes", [
      {
        lemma: "moveo",
        inflectedForms: [
          {
            form: "inberbes",
            inflectionData: [makeInfo("moveo", "inberbes", { tags: ["late"] })],
          },
        ],
      },
      {
        lemma: "imberbis",
        inflectedForms: [
          {
            form: "inberbe_s",
            inflectionData: [
              makeInfo("imberbis", "inberbe_s", { tags: ["orth"] }),
            ],
          },
        ],
      },
      {
        lemma: "mora",
        inflectedForms: [
          {
            form: "inberbes",
            inflectionData: [
              makeInfo("mora", "inberbes", { tags: ["variant"] }),
            ],
          },
        ],
      },
      {
        lemma: "mos",
        inflectedForms: [
          {
            form: "inberbes",
            inflectionData: [makeInfo("mos", "inberbes", { tags: ["greek"] })],
          },
        ],
      },
      {
        lemma: "morior",
        inflectedForms: [
          {
            form: "inberbes",
            inflectionData: [makeInfo("morior", "inberbes", { tags: ["dep"] })],
          },
        ],
      },
    ]);

    expect(results.map((r) => r.entry)).toEqual([
      "imberbis",
      "mora",
      "mos",
      "morior",
      "moveo",
    ]);
  });

  it("re-evaluates mixed analyses after vowel-length filtering and orders within-entry inflections", async () => {
    const moriorAnalysis: LatinWordAnalysis = {
      lemma: "morior",
      inflectedForms: [
        {
          form: "mo^ri_s",
          inflectionData: [
            makeInfo("morior", "mo^ri_s", { tags: ["dep", "early"] }),
          ],
        },
        {
          form: "mo^ri^s",
          inflectionData: [makeInfo("morior", "mo^ri^s", { tags: ["dep"] })],
        },
      ],
    };
    const moveoContr: LatinWordAnalysis = {
      lemma: "moveo",
      inflectedForms: [
        {
          form: "mo_ri_s",
          inflectionData: [makeInfo("moveo", "mo_ri_s", { tags: ["contr"] })],
        },
      ],
    };

    // Unmacronized: morior has non-deranked `mo^ri^s`, stays Tier 2 ahead of moveo,
    // and sorts `mo^ri^s` before `mo^ri_s (dep early)` within morior.
    const unmacronized = await queryWith("moris", [
      moveoContr,
      moriorAnalysis,
      analysis("mora", "mo^ri_s"),
    ]);
    expect(unmacronized.map((r) => r.entry)).toEqual([
      "morior",
      "mora",
      "moveo",
    ]);
    expect(unmacronized[0].inflections?.map((i) => i.form)).toEqual([
      "mo^ri^s",
      "mo^ri_s",
    ]);

    // Macronized: `mo^ri^s` is filtered out, leaving only `mo^ri_s (dep early)`,
    // so morior drops to Tier 3 behind mora while keeping Morceus relative order vs moveo.
    const macronized = await queryWith("morīs", [
      moveoContr,
      moriorAnalysis,
      analysis("mora", "mo^ri_s"),
    ]);
    expect(macronized.map((r) => r.entry)).toEqual(["mora", "moveo", "morior"]);

    // Within a single analysis, exact-case deranked (rank 1) precedes relaxed-case primary (rank 2).
    const mixedCaseAndTag = await queryWith("moris", [
      {
        lemma: "mora",
        inflectedForms: [
          {
            form: "Mo_ris",
            inflectionData: [makeInfo("mora", "Mo_ris", { relaxedCase: true })],
          },
          {
            form: "mo^ri_s",
            inflectionData: [makeInfo("mora", "mo^ri_s", { tags: ["contr"] })],
          },
        ],
      },
    ]);
    expect(mixedCaseAndTag[0].inflections?.map((i) => i.form)).toEqual([
      "mo^ri_s",
      "Mo_ris",
    ]);
  });

  it("preserves higher tier slot when merging cross-tier duplicates (including capitalized exactMatches)", async () => {
    const results = await queryWith("Mos", [
      {
        lemma: "moveo",
        inflectedForms: [
          {
            form: "mos",
            inflectionData: [
              makeInfo("moveo", "mos", { tags: ["contr"], relaxedCase: true }),
            ],
          },
        ],
      },
      {
        lemma: "mos",
        inflectedForms: [
          {
            form: "mo_s",
            inflectionData: [makeInfo("mos", "mo_s", { relaxedCase: true })],
          },
        ],
      },
      {
        lemma: "mora",
        inflectedForms: [
          {
            form: "mos",
            inflectionData: [makeInfo("mora", "mos", { relaxedCase: true })],
          },
        ],
      },
    ]);

    // Capitalized "Mos" hits `mos` in Tier 1 exactMatches; `mora` is Tier 4, `moveo` is Tier 5.
    expect(results.map((r) => r.entry)).toEqual(["mos", "mora", "moveo"]);
    expect(results[0].inflections?.map((i) => i.form)).toEqual(["mo_s"]);

    // Tier 3 + Tier 2 hitting the same entry keeps Tier 2 order and merges Tier 2 inflections first.
    const sameIdCrossTier = await queryWith("moris", [
      {
        lemma: "mos#1",
        inflectedForms: [
          {
            form: "mo_ri_s",
            inflectionData: [makeInfo("mos#1", "mo_ri_s", { tags: ["early"] })],
          },
        ],
      },
      analysis("mora", "mo^ri_s"),
      analysis("mos#2", "mo_ris"),
    ]);
    expect(sameIdCrossTier.map((r) => r.entry)).toEqual(["mora", "mos"]);
    expect(sameIdCrossTier[1].inflections?.map((i) => i.lemma)).toEqual([
      "mos#2",
      "mos#1",
    ]);
  });

  it("still returns results when only Tier 3 matches exist", async () => {
    const results = await queryWith("admorunt", [
      {
        lemma: "admoveo",
        inflectedForms: [
          {
            form: "admo_runt",
            inflectionData: [
              makeInfo("admoveo", "admo_runt", { tags: ["contr"] }),
            ],
          },
        ],
      },
    ]);

    expect(results.map((r) => r.entry)).toEqual(["admoveo"]);
  });
});
