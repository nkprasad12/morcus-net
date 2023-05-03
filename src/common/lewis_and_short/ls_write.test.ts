import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { LsRewriters, rewriteLs } from "../ls_write";

const IN_FILE = "ls_write.test.tmp.in.xml";

beforeEach(() => {
  try {
    unlinkSync(IN_FILE);
  } catch (e) {}
});

afterEach(() => {
  try {
    unlinkSync(IN_FILE);
  } catch (e) {}
});

describe("rewriters", () => {
  test("rewriteLs handles header correctly", async () => {
    const original = ["header1", "header2", "<body>", "content"].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => "\n" + line);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("rewriteLs uses transformer", async () => {
    const original = ["header1", "<body>", "content"].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => `\n${line}${line}`);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual("header1\n<body>\ncontentcontent");
  });

  test("rewriteLs handles multiline content", async () => {
    const original = [
      "header1",
      "header2",
      "<body>",
      "content1",
      "content2",
      "",
    ].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => "\n" + line);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("removeWhitespace skips out of content whitespace", async () => {
    const original = [
      "header1",
      "",
      "  header2",
      "<body>",
      "content1",
      "</body></TEI>",
      "",
    ].join("\n");
    writeFileSync(IN_FILE, original);

    await LsRewriters.removeWhitespace(IN_FILE);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("removeWhitespace removes content whitespace", async () => {
    const original = ["header", "<body>", "entry1", "", "  entry2"].join("\n");
    writeFileSync(IN_FILE, original);

    await LsRewriters.removeWhitespace(IN_FILE);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual("header\n<body>\nentry1\nentry2");
  });
});
