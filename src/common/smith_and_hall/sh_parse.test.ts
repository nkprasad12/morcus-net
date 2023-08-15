import { getArticles } from "@/common/smith_and_hall/sh_parse";
import fs from "fs";

const TEMP_FILE = "sh_parse.test.ts.tmp";

const HEADER = [
  "",
  "ENGLISH-LATIN DICTIONARY.",
  "-----File: b0001l.png------------------------------------------------------",
  "",
  "",
];
const FOOTER = [
  "",
  "",
  "THE END.",
  "-----File: c0707.png-------------------------------------------------------",
];

afterEach(() => {
  try {
    fs.unlinkSync(TEMP_FILE);
  } catch {}
});

function writeArticle(lines: string[]) {
  const allLines = HEADER.concat(lines.concat(FOOTER));
  fs.writeFileSync(TEMP_FILE, allLines.join("\n"));
}

describe("getArticlesFromFile", () => {
  it("handles page markers", async () => {
    const lines = [
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g. quoti-*",
      "-----File: b0418m.png------------------------------------------------------",
      "*diana, tertiana, quartana (quae altero,",
    ];
    const expected = [
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g. quoti-*",
      "*diana, tertiana, quartana (quae altero,",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles full line editor notes", async () => {
    const lines = [
      "<b>intermittent</b>:",
      "",
      "2. ōrātor",
      "to Pyrrhus, concerning the prisoners</i>[**P2: ,]",
      "-----File: b0497l.png------------------------------------------------------",
      "[** prev. png looks to be missing comma at end of page|P2: fixed]",
      "F. ad Pyrrhum de captivis missus o., Cic.",
    ];
    const expected = [
      "<b>intermittent</b>:",
      "",
      "2. ōrātor",
      "to Pyrrhus, concerning the prisoners</i>,",
      "F. ad Pyrrhum de captivis missus o., Cic.",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });
});
