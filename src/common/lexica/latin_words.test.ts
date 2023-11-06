import { LatinWords, makeMorpheusDb } from "@/common/lexica/latin_words";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import fs from "fs";

const TEMP_INFILE = "latin_words.test.ts.tmp";
const TEMP_DB_FILE = "latin_words.test.ts.tmp.db";

const SAMPLE_MORPHEUS_OUTPUT = `
:raw excibat

:workw exsci_bat
:lem ex-scio
:prvb ex			raw_preverb	
:aug1 				
:stem sc				conj4
:suff 				
:end i_bat	 imperf ind act 3rd sg		poetic	conj4

:raw excidam

:workw exci_dam
:lem ex-caedo
:prvb ex				
:aug1 				
:stem ci_d			comp_only	conj3
:suff 				
:end am	 fut ind act 1st sg			conj3

:raw excidam

:workw exci_dam
:lem ex-caedo
:prvb ex				
:aug1 				
:stem ci_d			comp_only	conj3
:suff 				
:end am	 pres subj act 1st sg			conj3
`;

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
