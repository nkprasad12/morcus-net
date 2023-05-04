import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "fs";
import {
  ABACULUS,
  ABEQUITO,
  ACCIANUS,
  ACEO,
  CONDICTICIUS,
  PALUS1,
} from "./sample_entries";

import { extractEntries, parseEntries, XmlNode } from "./xml_node";

console.debug = jest.fn();

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

describe("parseEntries", () => {
  it("returns expected nodes", () => {
    const xmlContents = readFileSync(LS_SUBSET, "utf8");
    const rawEntries = extractEntries(xmlContents);
    const entries = parseEntries(rawEntries);

    for (let i = 0; i < rawEntries.length; i++) {
      expect(rawEntries[i]).toBe(entries[i].toString());
    }
  });

  it("raises on unpaired tags if validation is enabled", () => {
    expect(() => parseEntries([makeEntry("<sense>")], true)[0]).toThrowError();
    expect(() => parseEntries([makeEntry("</sense>")], true)[0]).toThrowError();
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

describe("XmlNode.findDescendants", () => {
  it("finds all descendants", () => {
    const child1 = new XmlNode("caesar", [["child", "1"]], []);
    const child2 = new XmlNode("caesar", [["child", "2"]], [child1]);
    const child3 = new XmlNode("augustus", [["child", "3"]], []);
    const child4 = new XmlNode("caesar", [["child", "4"]], []);
    const parent = new XmlNode("caesar", [], [child2, child3, child4]);

    const result = parent.findDescendants("caesar");

    expect(result).toHaveLength(3);
    expect(result).toContain(child1);
    expect(result).toContain(child2);
    expect(result).toContain(child4);
  });
});

describe("XmlNode.findChildren", () => {
  it("finds only direct children", () => {
    const child1 = new XmlNode("caesar", [["child", "1"]], []);
    const child2 = new XmlNode("caesar", [["child", "2"]], [child1]);
    const child3 = new XmlNode("caesar", [["child", "3"]], []);
    const child4 = new XmlNode("augustus", [["child", "4"]], []);
    const parent = new XmlNode("caesar", [], [child2, child3, child4, "foo"]);

    const result = parent.findChildren("caesar");

    expect(result).toHaveLength(2);
    expect(result).toContain(child2);
    expect(result).toContain(child3);
  });
});

describe("XmlNode.getAttr", () => {
  it("returns attribute if present", () => {
    const root = new XmlNode("caesar", [["child", "octavianus"]], []);
    expect(root.getAttr("child")).toBe("octavianus");
  });

  it("returns undefined if not present", () => {
    const root = new XmlNode("caesar", [["child", "octavianus"]], []);
    expect(root.getAttr("parent")).toBe(undefined);
  });
});

describe("XmlNode utils does not modify string", () => {
  function assertUnchanged(entry: string) {
    const node = parseEntries([entry])[0];
    expect(node.toString()).toStrictEqual(entry);
  }

  test("entries with column breaks are handled", () => {
    assertUnchanged(ABACULUS);
  });

  test("entries with page breaks are handled", () => {
    assertUnchanged(ABEQUITO);
  });

  test("entries with corrections are handled", () => {
    assertUnchanged(CONDICTICIUS);
  });

  test("entries with XML comments are handled", () => {
    assertUnchanged(PALUS1);
  });

  test("Handles sampling of entries", () => {
    assertUnchanged(ACEO);
    assertUnchanged(ACCIANUS);
  });
});
