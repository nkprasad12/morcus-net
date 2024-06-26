import {
  EndIndexRow,
  makeEndIndex,
  type EndsResult,
} from "@/morceus/tables/indices";
import { LatinCase, LatinNumber } from "@/morceus/types";

const TESTDATA_DIR = "src/morceus/tables/lat/core/testdata/";
const DEP_TEMPLATES = `${TESTDATA_DIR}dependencyTemplates`;
const TARGET_TEMPLATES = `${TESTDATA_DIR}targetTemplates`;

describe("EndIndexRow", () => {
  it("parses and stringifies correctly", () => {
    const original: EndIndexRow = {
      ending: "foo",
      tableNames: ["bar", "baz"],
    };
    expect(EndIndexRow.parse(EndIndexRow.stringify(original))).toEqual(
      original
    );
  });
});

describe("makeEndIndex", () => {
  it("Makes expected index for simple case", () => {
    const result = makeEndIndex([TARGET_TEMPLATES], [DEP_TEMPLATES]);
    expect(result).toStrictEqual<EndsResult>([
      [
        { ending: "a", tableNames: ["a_ae"] },
        { ending: "ae", tableNames: ["a_ae"] },
        { ending: "ai", tableNames: ["a_ae"] },
        { ending: "arum", tableNames: ["a_ae"] },
      ],
      new Map([
        [
          "a_ae",
          new Map([
            [
              "a",
              [
                {
                  ending: "a",
                  grammaticalData: {
                    case: [LatinCase.Nominative, LatinCase.Vocative],
                    number: LatinNumber.Singular,
                  },
                },
              ],
            ],
            [
              "ae",
              [
                {
                  ending: "ae",
                  grammaticalData: {
                    case: LatinCase.Genitive,
                    number: LatinNumber.Singular,
                  },
                },
                {
                  ending: "ae",
                  grammaticalData: {
                    case: [LatinCase.Nominative, LatinCase.Vocative],
                    number: LatinNumber.Plural,
                  },
                },
              ],
            ],
            [
              "arum",
              [
                {
                  ending: "a_rum",
                  grammaticalData: {
                    case: LatinCase.Genitive,
                    number: LatinNumber.Plural,
                  },
                },
              ],
            ],
            [
              "ai",
              [
                {
                  ending: "a_i_",
                  grammaticalData: {
                    case: LatinCase.Genitive,
                    number: LatinNumber.Singular,
                  },
                  tags: ["poetic"],
                },
              ],
            ],
          ]),
        ],
      ]),
    ]);
  });
});
