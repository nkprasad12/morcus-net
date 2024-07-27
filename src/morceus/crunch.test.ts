import {
  MorceusCruncher,
  crunchWord,
  makeEndsMap,
  makeStemsMap,
  type CruncherConfig,
} from "@/morceus/crunch";
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

    expect(result).toStrictEqual([{ lemma: "morcus", ending: "o", stem }]);
  });

  it("handles indeclinable", () => {
    const stem: Stem = {
      code: "wd",
      stem: "topper",
      inflection: "adverb",
      grammaticalData: {},
    };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "topper", stems: [stem] }];

    const result = crunchWord(
      makeEndsMap(endings),
      makeStemsMap(lemmata),
      "topper"
    );

    expect(result).toStrictEqual([{ lemma: "topper", ending: "*", stem }]);
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

    expect(result).toStrictEqual([
      {
        lemma: "morcus",
        inflectedForms: [
          {
            form: "morco",
            inflectionData: [{ inflection: "abl", usageNote: "archaic" }],
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
            inflectionData: [{ inflection: "pres imperat act 2nd pl" }],
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
