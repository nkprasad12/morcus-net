import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "fs";

import { extractEntries, parse, parseEntries, XmlNode } from "./ls_parser";

const LS_SUBSET = "testdata/ls/subset.xml";

function makeEntry(contents: string): string {
  return `<entryFree >${contents}</entryFree>`;
}

describe("extractEntries", () => {
  test("checks characters before entry open", () => {
    const contents = "> <entryFree ";
    expect(() => extractEntries(contents)).toThrow();
  });

  test("checks characters after entry close", () => {
    const contents = "<entryFree \n </entryFree> <";
    expect(() => extractEntries(contents)).toThrow();
  });

  test("raises on nested opens", () => {
    const contents = "<entryFree foo\n<entryFree bar";
    expect(() => extractEntries(contents)).toThrow();
  });

  test("raises on unexpected closes", () => {
    const contents = `${makeEntry("1")}\nfoo</entryFree>`;
    expect(() => extractEntries(contents)).toThrow();
  });

  test("handles normal entries", () => {
    const expected = [makeEntry("1"), makeEntry("2")];
    const contents = `${expected[0]}\n${expected[1]}`;

    const entries = extractEntries(contents);

    expect(entries).toEqual(expected);
  });

  test("skips lines between entries", () => {
    const expected = [makeEntry("1"), makeEntry("2")];
    const contents = `${expected[0]}\nfoo\n${expected[1]}`;

    const entries = extractEntries(contents);

    expect(entries).toEqual(expected);
  });

  test("handles two line entries", () => {
    const contents = "  <entryFree >foo\nbar</entryFree>";

    const entries = extractEntries(contents);

    expect(entries).toEqual(["<entryFree >foo\nbar</entryFree>"]);
  });

  test("handles multi-line entries", () => {
    const contents = "  <entryFree >foo\nbar\nbaz\n</entryFree> ";

    const entries = extractEntries(contents);

    expect(entries).toEqual(["<entryFree >foo\nbar\nbaz\n</entryFree>"]);
  });

  test("handles subset of real input", () => {
    const xmlContents = readFileSync(LS_SUBSET, "utf8");

    const entries = extractEntries(xmlContents);

    expect(entries).toHaveLength(4);
  });
});

const SAMPLE_ENTRY = `<entryFree key="canaba" type="main" id="n6427"><orth lang="la" extent="full">cānăba</orth> (or <orth lang="la" extent="full">cannăba</orth>), <itype>ae</itype>, <gen>f.</gen> <etym>kindr. with <foreign lang="greek">κάναβος</foreign> and <foreign lang="greek">κάννα</foreign>; acc. to others, with <foreign lang="greek">καλύβη</foreign></etym>, <sense level="1" n="I" id="n6427.0"><hi rend="ital">a hovel</hi>, <hi rend="ital">hut</hi>, <bibl n="August. Serm. 61"><author>Aug.</author> Serm. 61</bibl>, de Temp.; <bibl><author>Inscr. Orell.</author> 39</bibl>; <bibl>4077</bibl>.</sense></entryFree>`;

describe("parseEntries", () => {
  test("returns expected nodes", () => {
    const xmlContents = readFileSync(LS_SUBSET, "utf8");
    const rawEntries = extractEntries(xmlContents);
    const entries = parseEntries(rawEntries);

    for (let i = 0; i < rawEntries.length; i++) {
      expect(rawEntries[i]).toBe(entries[i].toString());
    }
  });
});

describe("parse", () => {
  test("parses all entries in file", () => {
    expect(parse(LS_SUBSET)).toHaveLength(4);
  });
});

describe("getSoleText", () => {
  it("returns text in happy path", () => {
    const result = XmlNode.getSoleText(new XmlNode("", [], ["Caesar"]));
    expect(result).toBe("Caesar");
  });

  it("raises on multiple children", () => {
    expect(() =>
      XmlNode.getSoleText(new XmlNode("", [], ["Caesar", "Gallia"]))
    ).toThrow();
  });

  it("raises on node child", () => {
    expect(() =>
      XmlNode.getSoleText(new XmlNode("", [], [new XmlNode("", [], [])]))
    ).toThrow();
  });
});

describe("assertIsString", () => {
  it("no-ops on string", () => {
    expect(XmlNode.assertIsString("Gallia")).toBe("Gallia");
  });

  it("throws on XmlNode", () => {
    expect(() => XmlNode.assertIsString(new XmlNode("", [], []))).toThrow();
  });
});

describe("assertIsNode", () => {
  it("no-ops on node", () => {
    const node = new XmlNode("", [], []);
    expect(XmlNode.assertIsNode(node)).toBe(node);
  });

  it("raises on incorrect tag name", () => {
    const node = new XmlNode("caesar", [], []);
    expect(() => XmlNode.assertIsNode(node, "caesa")).toThrow();
  });

  it("allows correct tag name", () => {
    const node = new XmlNode("caesar", [], []);
    expect(XmlNode.assertIsNode(node)).toBe(node);
  });

  it("throws on string", () => {
    expect(() => XmlNode.assertIsNode("Gallia")).toThrow();
  });
});
