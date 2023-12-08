import { readFileSync } from "fs";
import {
  CtsPathData,
  parseCtsTeiXml,
  findCtsEncoding,
  TeiNode,
} from "@/common/xml/tei_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { DescendantNode, parseRawXml } from "@/common/xml/xml_utils";

const DBG =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

function dbgRoot(): XmlNode {
  return parseRawXml(readFileSync(DBG));
}

describe("CtsPathData test", () => {
  const D = new XmlNode("D", [["z", "2"]]);
  const C = new XmlNode("C", [], [D]);
  const B = new XmlNode("B", [["y", "1"]], [C]);
  const A = new XmlNode("A", [], [B]);
  const descendantNode: DescendantNode = [D, [A, B, C]];
  it("returns expected on regular path", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "y", index: 0 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 1 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual(["1", "2"]);
  });

  it("returns expected on out of order path", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "y", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual(["2", "1"]);
  });

  it("returns expected on path without ids", () => {
    const path = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];
    const result = CtsPathData.test(descendantNode, path);
    expect(result).toStrictEqual([]);
  });

  it("returns undefined on mismatched path length", () => {
    const path = [{ name: "A" }, { name: "B" }, { name: "C" }];
    const result = CtsPathData.test(descendantNode, path);
    expect(result).toBe(undefined);
  });

  it("returns undefined on path with incorrect name", () => {
    const path = [
      { name: "a" },
      { name: "B", idInfo: { key: "y", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toBe(undefined);
  });

  it("returns undefined on path with incorrect key", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "z", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "y", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toBe(undefined);
  });
});

describe("findCtsEncoding", () => {
  it("returns expected raw headers on DBG", () => {
    expect(findCtsEncoding(dbgRoot())).toStrictEqual([
      {
        name: "Section",
        idSize: 3,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
          { name: "div", idInfo: { key: "n", index: 2 } },
          { name: "div", idInfo: { key: "n", index: 3 } },
        ],
      },
      {
        name: "Chapter",
        idSize: 2,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
          { name: "div", idInfo: { key: "n", index: 2 } },
        ],
      },
      {
        name: "Book",
        idSize: 1,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
        ],
      },
    ]);
  });
});

describe("extractTeiContent", () => {
  const result = parseCtsTeiXml(dbgRoot());

  it("has expected text parts", () => {
    expect(result.textParts).toEqual(["Book", "Chapter", "Section"]);
  });

  it("has expected document info", () => {
    expect(result.info.title).toBe("De bello Gallico");
  });

  it("has expected content root", () => {
    expect(result.content.id).toEqual([]);
  });

  it("has expected content", () => {
    const firstBook = <TeiNode>result.content.children[0];
    expect(firstBook.id).toEqual(["1"]);
    const firstChild = <XmlNode>firstBook.children[0];
    expect(firstChild).toBeInstanceOf(XmlNode);
    expect(firstChild.toString()).toBe("<head>COMMENTARIUS PRIMUS</head>");
    const secondChild = <TeiNode>firstBook.children[1];
    expect(secondChild.id).toEqual(["1", "1"]);
  });
});
