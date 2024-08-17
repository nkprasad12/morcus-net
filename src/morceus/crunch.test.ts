import {
  MorceusCruncher,
  crunchWord,
  type CruncherConfig,
} from "@/morceus/crunch";
import {
  toInflectionData,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";
import type { Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndIndexRow, InflectionLookup } from "@/morceus/tables/indices";
import { LatinCase } from "@/morceus/types";

const ORIGINAL_MORPHEUS_ROOT = process.env.MORPHEUS_ROOT;
const FAKE_MORPHEUS_ROOT = "src/morceus/testdata";
const FAKEDATA_CRUNCHER_CONFIG: CruncherConfig = {
  generate: {
    nomStemFiles: [
      "stemlib/Latin/stemsrc/ls.nom",
      "stemlib/Latin/stemsrc/nom.livy",
    ],
    verbStemFiles: ["stemlib/Latin/stemsrc/vbs.latin"],
  },
};

beforeAll(() => (process.env.MORPHEUS_ROOT = FAKE_MORPHEUS_ROOT));
afterAll(() => (process.env.MORPHEUS_ROOT = ORIGINAL_MORPHEUS_ROOT));

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
        endsResult: [endings, lookup],
        lemmata,
      },
    };
    const tables = MorceusCruncher.makeTables(config);
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
    const tables = MorceusCruncher.makeTables(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("cavete", tables, { vowelLength: "relaxed" });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("caveo");
    expect(result[0].form).toBe("ca^ve_te");
    expect(result[0].grammaticalData).toEqual(
      toInflectionData("pres imperat act 2nd pl".split(" ")).grammaticalData
    );
  });

  it("handles ite", () => {
    const tables = MorceusCruncher.makeTables(FAKEDATA_CRUNCHER_CONFIG);
    const result = crunchWord("ite", tables, { vowelLength: "relaxed" });

    expect(result).toHaveLength(1);
    expect(result[0].lemma).toBe("eo#1");
    expect(result[0].form).toBe("i_te");
    expect(result[0].grammaticalData).toStrictEqual(
      toInflectionData("pres imperat act 2nd pl".split(" ")).grammaticalData
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
        endsResult: [endings, lookup],
        lemmata,
      },
    };
    const tables = MorceusCruncher.makeTables(config);
    const cruncher = MorceusCruncher.make(tables);
    const result = cruncher("morco");

    expect(result).toEqual([
      {
        lemma: "morcus",
        inflectedForms: [
          {
            form: "morco",
            inflectionData: [
              {
                lemma: "morcus",
                form: "morco",
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
