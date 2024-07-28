import {
  MorceusCruncher,
  crunchWord,
  makeEndsMap,
  makeStemsMap,
  type CruncherConfig,
} from "@/morceus/crunch";
import { toInflectionData } from "@/morceus/inflection_data_utils";
import type { IrregularForm, Lemma, Stem } from "@/morceus/stem_parsing";
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
  it("should be able to crunch simple words", () => {
    const stem: Stem = {
      code: "no",
      stem: "morc",
      inflection: "us",
      grammaticalData: {},
    };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];

    const result = crunchWord(
      makeEndsMap(endings),
      makeStemsMap(lemmata),
      "morco"
    );

    expect(result).toStrictEqual([
      { lemma: "morcus", ending: "o", stemOrForm: stem },
    ]);
  });

  it("handles indeclinable", () => {
    const form: IrregularForm = {
      code: "wd",
      form: "topper",
      tags: ["adverb"],
      grammaticalData: {},
    };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "topper", irregularForms: [form] }];

    const result = crunchWord(
      makeEndsMap(endings),
      makeStemsMap(lemmata),
      "topper"
    );

    expect(result).toStrictEqual([
      { lemma: "topper", ending: "*", stemOrForm: form },
    ]);
  });
});

describe("MorceusCruncher", () => {
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
    const cruncher = MorceusCruncher.make(config);
    const result = cruncher("morco");

    expect(result).toEqual([
      {
        lemma: "morcus",
        inflectedForms: [
          {
            form: "morco",
            inflectionData: [
              {
                grammaticalData: { case: LatinCase.Ablative },
                tags: ["archaic"],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("handles end to end case with relaxed vowel length", () => {
    const cruncher = MorceusCruncher.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = cruncher("cavete", { vowelLength: "relaxed" });

    expect(result).toEqual([
      {
        lemma: "caveo",
        inflectedForms: [
          {
            form: "ca^ve_te",
            inflectionData: [
              { ...toInflectionData("pres imperat act 2nd pl".split(" ")) },
            ],
          },
        ],
      },
    ]);
  });

  it("handles ite", () => {
    const cruncher = MorceusCruncher.make(FAKEDATA_CRUNCHER_CONFIG);
    const result = cruncher("ite", { vowelLength: "relaxed" });

    expect(result).toEqual([
      {
        lemma: "eo#1",
        // TODO: Actually verify the inflection output
        inflectedForms: expect.anything(),
      },
    ]);
  });
});
