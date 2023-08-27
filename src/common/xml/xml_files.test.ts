import { parseTeiXml } from "@/common/xml/xml_files";

const DBG =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

describe("parseTeiXml", () => {
  it("returns expected response on DBG", () => {
    const result = parseTeiXml(DBG);

    expect(result.textParts).toEqual(["book", "chapter", "section"]);
    expect(result.info.title).toEqual("De bello Gallico");
    expect(result.content.getAttr("n")).toEqual(
      "urn:cts:latinLit:phi0448.phi001.perseus-lat2"
    );
  });
});
