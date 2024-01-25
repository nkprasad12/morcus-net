import { checkPresent } from "@/common/assert";
import { LatinWords, makeMorpheusDb } from "@/common/lexica/latin_words";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import fs from "fs";

console.debug = jest.fn();

const TEMP_INFILE = "latin_words.test.ts.tmp";
const TEMP_DB_FILE = "latin_words.test.ts.tmp.db";

beforeAll(() => {
  process.env.LATIN_INFLECTION_DB = TEMP_DB_FILE;
  fs.writeFileSync(TEMP_INFILE, SAMPLE_MORPHEUS_OUTPUT);
});

afterAll(() => {
  try {
    fs.unlinkSync(TEMP_INFILE);
    cleanupSqlTableFiles(TEMP_DB_FILE);
  } catch {}
});

describe("Latin Words", () => {
  test("returns expected words", () => {
    makeMorpheusDb(TEMP_INFILE, TEMP_DB_FILE);

    expect(LatinWords.analysesFor("excidam")).toEqual([
      {
        inflectedForms: [
          {
            form: "excīdam",
            inflectionData: [
              { inflection: "fut ind act 1st sg", usageNote: "poetic" },
              { inflection: "pres subj act 1st sg" },
            ],
          },
        ],
        lemma: "excaedo",
      },
    ]);
  });
});

describe("LatinWords.resolveLatinWord", () => {
  it("handles base word", () => {
    const table = new Set(["Habeo", "habeo"]);
    const result = LatinWords.resolveLatinWord("habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles capitalized word", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("Habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles lower cased word word", () => {
    const table = new Set(["Habeo"]);
    const result = LatinWords.resolveLatinWord("habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("Habeo");
  });

  it("handles word with enclitic", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("habeoque", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles word with enclitic and capitalization", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("Habeoque", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles all upper case with enclitic", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("HABEOQUE", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });
});
