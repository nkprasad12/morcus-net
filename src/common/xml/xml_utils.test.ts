import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";

describe("parseRawXml", () => {
  it("defaults to skip whitespace", () => {
    const result = parseRawXml('<a f="g"><b>hi</b>\n</a>');
    expect(result).toEqual(
      new XmlNode("a", [["f", "g"]], [new XmlNode("b", [], ["hi"])])
    );
  });

  it("returns expected with pi nodes", () => {
    const result = parseRawXml("<?xml blah?><a></a>");
    expect(result).toEqual(new XmlNode("a"));
  });

  it("handles whitespace mode", () => {
    const result = parseRawXml('<a f="g"><b>hi</b>\n</a>', {
      keepWhitespace: true,
    });
    expect(result).toEqual(
      new XmlNode("a", [["f", "g"]], [new XmlNode("b", [], ["hi"]), "\n"])
    );
  });

  it("handles validation if requested", () => {
    expect(() =>
      parseRawXml('<a f="g">hi</b></a>', { validate: true })
    ).toThrowError();
    expect(() =>
      parseRawXml('<a f="g">hi</a>', { validate: true })
    ).not.toThrowError();
  });
});
