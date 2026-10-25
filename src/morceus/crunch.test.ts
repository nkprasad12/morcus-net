import {
  consolidateResultCluster,
  crunchWord,
  MorceusCruncher,
} from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import type {
  CruncherConfig,
  CrunchResult,
  LatinWordAnalysis,
} from "@/morceus/cruncher_types";
import {
  toInflectionData,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";
import type { Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndIndexRow, InflectionLookup } from "@/morceus/tables/indices";
import { LatinCase } from "@/morceus/types";

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";
const FAKEDATA_CRUNCHER_CONFIG: CruncherConfig = {
  generate: {
    nomStemFiles: [
      "latin/stems/nominals/ls.nom",
      "latin/stems/nominals/nom.livy",
    ],
    verbStemFiles: ["latin/stems/verbs/vbs.latin"],
  },
};

beforeAll(() => (process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT));
afterAll(() => (process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT));

describe("crunchWord", () => {
  it("handles simple case with one option", () => {
    const stem: Stem = {
      code: "no",
      stem: "morc",
      inflection: "us",
      grammaticalData: {},
    };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];
    const lookup: InflectionLookup = new Map([
      [
        "us",
        new Map([
          [
            "o",
            [
              {
                ending: "o",
                grammaticalData: { case: LatinCase.Ablative },
                tags: ["archaic"],
              },
            ],
          ],
        ]),
      ],
    ]);
    const config: CruncherConfig = {
      existing: {
        endsResult: [endings, lookup, []],
        lemmata,
      },
    };
    const tables = MorceusTables.make(config);
    const result = crunchWord("morco", tables);

    expect(result).toEqual([
      expect.objectContaining({
        lemma: "morcus",
        form: "morco",
        grammaticalData: { case: LatinCase.Ablative },
        tags: ["archaic"],
      }),
    ]);
  });

  it("handles end to end case with relaxed vowel length", () => {
    const tables = MorceusTables.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("cavete", tables, { vowelLength: "relaxed" });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("caveo");
    expect(result[0].form).toBe("ca^ve_te");
    expect(result[0].grammaticalData).toEqual(
      toInflectionData("pres imperat act 2nd pl".split(" ")).grammaticalData
    );
  });

  it("handles ite", () => {
    const tables = MorceusTables.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("ite", tables, { vowelLength: "relaxed" });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("eo#1");
    expect(result[0].form).toBe("i_te");
    expect(result[0].grammaticalData).toStrictEqual(
      toInflectionData("pres imperat act 2nd pl".split(" ")).grammaticalData
    );
  });

  it("handles ajunt", () => {
    const tables = MorceusTables.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("aiunt", tables, {
      vowelLength: "relaxed",
      relaxIandJ: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("aio");
    expect(result[0].form).toBe("ajunt");
    expect(result[0].grammaticalData).toStrictEqual(
      toInflectionData("pres ind act 3rd pl".split(" ")).grammaticalData
    );
  });

  it("handles empty ending", () => {
    const tables = MorceusTables.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("marmor", tables);

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("marmor");
    expect(result[0].form).toBe("marmor");
    expect(result[0].grammaticalData).toStrictEqual(
      toInflectionData("neut sg nom/voc/acc".split(" ")).grammaticalData
    );
  });

  it("handles -que enclitic", () => {
    const tables = MorceusTables.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("aiuntque", tables, {
      vowelLength: "relaxed",
      relaxIandJ: true,
      handleEnclitics: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("aio");
    expect(result[0].form).toBe("ajunt");
    expect(result[0].grammaticalData).toStrictEqual(
      toInflectionData("pres ind act 3rd pl".split(" ")).grammaticalData
    );
  });
});

describe("MorceusCruncher", () => {
  it("handles one result case", () => {
    const stem: Stem = {
      code: "no",
      stem: "morc",
      inflection: "us",
      grammaticalData: {},
    };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];
    const inflectionEnd: InflectionEnding = {
      ending: "o",
      grammaticalData: { case: LatinCase.Ablative },
      tags: ["archaic"],
    };
    const lookup: InflectionLookup = new Map([
      ["us", new Map([["o", [inflectionEnd]]])],
    ]);
    const config: CruncherConfig = {
      existing: {
        endsResult: [endings, lookup, []],
        lemmata,
      },
    };
    const tables = MorceusTables.make(config);
    const cruncher = MorceusCruncher.make(tables);
    const result = cruncher("morco");

    expect(result).toEqual<LatinWordAnalysis[]>([
      {
        lemma: "morcus",
        inflectedForms: [
          {
            form: "morco",
            inflectionData: [
              {
                lemma: "morcus",
                form: "morco",
                isVerb: false,
                grammaticalData: { case: LatinCase.Ablative },
                tags: ["archaic"],
                stem: stem,
                end: inflectionEnd,
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("consolidateResultCluster", () => {
  function resultFor(stringInput: string): CrunchResult {
    return {
      lemma: "lemma",
      form: "form",
      grammaticalData: toInflectionData(stringInput.split(" ")).grammaticalData,
    };
  }

  it("combines basic subsets", () => {
    const inputs: CrunchResult[] = ["abl sg", "abl/dat sg"].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([inputs[1]]);
  });

  it("combines subsets across multiple categories", () => {
    const inputs: CrunchResult[] = ["nom/voc/acc masc/fem", "nom/acc masc"].map(
      resultFor
    );
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([inputs[0]]);
  });

  it("does not combine disjoint results", () => {
    const inputs: CrunchResult[] = ["abl pl", "abl/dat sg"].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual(inputs);
  });

  it("combines mergeable case results", () => {
    const inputs: CrunchResult[] = ["abl pl", "dat pl"].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("abl/dat pl")]);
  });

  it("combines genitive and dative cases (-ae, -eī)", () => {
    const inputs: CrunchResult[] = [
      "fem gen sg",
      "fem dat sg",
      "fem nom/voc pl",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([
      resultFor("fem gen/dat sg"),
      resultFor("fem nom/voc pl"),
    ]);
  });

  it("combines nominative/vocative and accusative plural (-ēs, -ūs)", () => {
    const inputs: CrunchResult[] = [
      "masc/fem nom/voc pl",
      "masc/fem acc pl",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("masc/fem nom/voc/acc pl")]);
  });

  it("combines multi-step gender and case dependencies", () => {
    // Like ans_antis: dat sg split by gender, abl sg unified
    const inputs: CrunchResult[] = [
      "masc/fem dat sg",
      "neut dat sg",
      "masc/fem/neut abl sg",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("masc/fem/neut dat/abl sg")]);
  });

  it("combines 2nd and 3rd person future imperatives (-tō, -tor)", () => {
    const inputs: CrunchResult[] = [
      "fut imperat act 2nd sg",
      "fut imperat act 3rd sg",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("fut imperat act 2nd/3rd sg")]);
  });

  it("combines indicative and imperative 2nd person passives (-re, -minī)", () => {
    const inputs: CrunchResult[] = [
      "pres ind pass 2nd pl",
      "pres imperat pass 2nd pl",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("pres ind/imperat pass 2nd pl")]);
  });

  it("does not combine unmergeable mood results", () => {
    for (const pair of [
      ["pres subj act 1st sg", "pres ind act 1st sg"],
      ["pres subj act 2nd sg", "pres imperat act 2nd sg"],
      ["fut part pass masc nom sg", "gerundive pass masc nom sg"],
      ["pres inf act", "pres imperat pass 2nd sg"],
    ]) {
      const inputs = pair.map(resultFor);
      expect(consolidateResultCluster(inputs)).toStrictEqual(inputs);
    }
  });

  it("does not combine across number, tense, voice, degree, or adverbial gender", () => {
    for (const pair of [
      ["fem nom sg", "fem nom pl"],
      ["pres ind act 3rd sg", "perf ind act 3rd sg"],
      ["pres ind act 1st sg", "pres ind pass 1st sg"],
      ["masc nom sg comp", "masc nom sg superl"],
      ["neut nom sg", "adverbial"],
    ]) {
      const inputs = pair.map(resultFor);
      const outputs = consolidateResultCluster(inputs);
      expect(outputs).toHaveLength(inputs.length);
      expect(outputs).toEqual(expect.arrayContaining(inputs));
    }
  });

  it("does not combine results differing in multiple mergeable categories at once", () => {
    for (const pair of [
      ["masc gen sg", "fem dat sg"],
      ["pres ind act 1st sg", "pres imperat act 2nd sg"],
    ]) {
      const inputs = pair.map(resultFor);
      expect(consolidateResultCluster(inputs)).toStrictEqual(inputs);
    }
  });

  it("combines mergeable gender results", () => {
    const inputs: CrunchResult[] = ["masc pl", "fem pl"].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("masc/fem pl")]);
  });

  it("combines PPP -īs case", () => {
    const inputs: CrunchResult[] = [
      "dat masc pl",
      "abl masc pl",
      "dat fem pl",
      "abl fem pl",
      "abl neut pl",
      "dat neut pl",
    ].map(resultFor);
    const outputs = consolidateResultCluster(inputs);
    expect(outputs).toStrictEqual([resultFor("dat/abl masc/fem/neut pl")]);
  });
});
