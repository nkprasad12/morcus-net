import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { LsRewriters, rewriteLs } from "@/common/lewis_and_short/ls_write";
import { CANABA, PALUS1 } from "@/common/lewis_and_short/sample_entries";
import { XmlNode } from "@/common/xml/xml_node";

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

  test("transformEntries modifies entries and only entries", async () => {
    const original = ["header", "<body>", CANABA, "<div1></div>", PALUS1].join(
      "\n"
    );
    writeFileSync(IN_FILE, original);

    await LsRewriters.transformEntries(
      IN_FILE,
      (root) => new XmlNode("box", [], [root])
    );
    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(
      [
        "header",
        "<body>",
        `<box>${CANABA}</box>`,
        "<div1></div>",
        `<box>${PALUS1}</box>`,
      ].join("\n")
    );
  });
});
