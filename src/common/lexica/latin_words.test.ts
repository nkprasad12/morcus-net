import { LatinWords, makeMorpheusDb } from "@/common/lexica/latin_words";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import fs from "fs";

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
            inflectionData: ["fut ind act 1st sg", "pres subj act 1st sg"],
          },
        ],
        lemma: "excaedo",
      },
    ]);
  });
});
