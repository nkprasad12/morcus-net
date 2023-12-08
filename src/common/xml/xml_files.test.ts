import { readFileSync } from "fs";
import { findCtsEncoding, parseTeiXml } from "@/common/xml/xml_files";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";

const DBG =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

function dbgRoot(): XmlNode {
  return parseRawXml(readFileSync(DBG));
}

describe("parseTeiXml", () => {
  it("returns expected response on DBG", () => {
    const result = parseTeiXml(DBG);

    expect(result.textParts).toEqual(["book", "chapter", "section"]);
    expect(result.info.title).toEqual("De bello Gallico");
    expect(result.content.getAttr("n")).toEqual(
      "urn:cts:latinLit:phi0448.phi001.perseus-lat2"
    );
  });

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
