import {
  EndIndexRow,
  makeEndIndex,
  type EndsResult,
} from "@/morceus/tables/indices";

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
            ["a", [{ ending: "a", grammaticalData: ["nom/voc", "sg"] }]],
            [
              "ae",
              [
                { ending: "ae", grammaticalData: ["gen", "sg"] },
                { ending: "ae", grammaticalData: ["nom/voc", "pl"] },
              ],
            ],
            ["arum", [{ ending: "a_rum", grammaticalData: ["gen", "pl"] }]],
            [
              "ai",
              [
                {
                  ending: "a_i_",
                  grammaticalData: ["gen", "sg"],
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
