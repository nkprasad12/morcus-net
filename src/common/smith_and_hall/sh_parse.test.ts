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

describe("getArticles", () => {
  it("handles page markers", async () => {
    const lines = [
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g. quoti-*",
      "-----File: b0418m.png------------------------------------------------------",
      "*diana, tertiana, quartana (quae altero,",
      "",
      "-----File: b0418m.png------------------------------------------------------",
      "foo",
    ];
    const expected = [
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g.",
      "quotidiana, tertiana, quartana (quae altero,",
      "",
      "foo",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles dash start entries", async () => {
    const lines = [
      "----, <b>to become</b>:",
      "-----File: b0418m.png------------------------------------------------------",
      "",
      "1. cl[=a]resco,",
    ];
    const expected = [
      "<b>illustrious</b>, <b>to become</b>:",
      "",
      "1. clāresco,",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles -* in middle of words", async () => {
    const lines = ["<b>intermittent</b>:", "3. exŏrior, 4 (two-*fold)"];
    const expected = [
      "<b>intermittent</b>:",
      "3. exŏrior, 4 (two-fold)",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles split words", async () => {
    const lines = [
      "<b>intermittent</b>:",
      "3. exŏrior, 4 (usu. <i>to a. sud-*</i>",
      "-----File: b0045m.png------------------------------------------------------",
      "<i>*denly</i>: also <i>to a. out of</i>): <i>may some",
      "3. tran-*",
      "-----File: b0076l.png------------------------------------------------------",
      "*strum (<i>for rowers</i>): Caes.: Virg.",
      "test <i>he-*</i>",
      "<i>*llo</i> there.",
    ];
    const expected = [
      "<b>intermittent</b>:",
      "3. exŏrior, 4 (usu. <i>to a.",
      "suddenly</i>: also <i>to a. out of</i>): <i>may some",
      "3.",
      "transtrum (<i>for rowers</i>): Caes.: Virg.",
      "test",
      "<i>hello</i> there.",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles macrons and breves", async () => {
    const lines = ["<b>to become</b>: cl[=a]r[)e]sco,"];
    const expected = ["<b>to become</b>: clārĕsco,", "", ""];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("handles combo entries", async () => {
    const lines = [
      "/*",
      "<b>arrear</b>:  }",
      "<b>arrears</b>: }",
      "*/",
      "",
      "1. rĕlĭquum (usu. <i>plu.</i>):",
    ];
    const expected = [
      "/*",
      "<b>arrear</b>:  }",
      "<b>arrears</b>: }",
      "*/",
      "",
      "1. rĕlĭquum (usu. <i>plu.</i>):",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toEqual([expected]);
  });

  it("ignores section headers", async () => {
    const lines = [
      "",
      "A.",
      "",
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g.",
    ];
    const expected = [
      "<b>intermittent</b>:",
      "of <i>i. fevers</i> are there given, e. g.",
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

  it("automatically handles entry starts with a missing blank line", async () => {
    const lines = [
      "<b>plug</b> (<i>v.</i>): obtūro, 1: v. <f>TO STOP UP</f>.",
      "",
      "plug (<i>subs.</i>): perh. obtūrācŭlum, obtūrāmentum:",
      "v. <f>STOPPER</f>.",
    ];
    const expected = [
      "<b>plug</b> (<i>subs.</i>): perh. obtūrācŭlum, obtūrāmentum:",
      "v. <f>STOPPER</f>.",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(expected);
  });

  it("respects edge case: ignore empty line before", async () => {
    const lines = [
      "<b>plug</b> (<i>v.</i>): obtūro, 1: v. <f>TO STOP UP</f>.",
      "",
      "i. e. <i>to put in barrels</i>,",
    ];
    const expected = [
      "<b>plug</b> (<i>v.</i>): obtūro, 1: v. <f>TO STOP UP</f>.",
      "i. e. <i>to put in barrels</i>,",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expected);
  });

  it("reunites lost senses with their articles", async () => {
    const lines = [
      "<b>plug</b> (<i>v.</i>): obtūro, 1: v. <f>TO STOP UP</f>.",
      "",
      "",
      "I. i. e. <i>to put in barrels</i>,",
    ];
    const expected = [
      "<b>plug</b> (<i>v.</i>): obtūro, 1: v. <f>TO STOP UP</f>.",
      "",
      "",
      "I. i. e. <i>to put in barrels</i>,",
      "",
      "",
    ];
    writeArticle(lines);

    const result = await getArticles(TEMP_FILE);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expected);
  });
});
