import { expandShAbbreviationsIn } from "@/common/smith_and_hall/sh_abbreviations";
import { XmlNode } from "@/common/xml/xml_node";

describe("expandAbbreviationsIn", () => {
  it("has expected result with no abbreviations", () => {
    expect(expandShAbbreviationsIn("foo")).toStrictEqual(["foo"]);
  });

  it("has author abbreviations without dates", () => {
    expect(expandShAbbreviationsIn("blah Auct. Her. blah")).toStrictEqual([
      "blah ",
      new XmlNode(
        "span",
        [["class", "lsBibl"]],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsHover lsAuthor"],
              ["title", "Auctor ad Herennium, rhet."],
            ],
            ["Auct. Her."]
          ),
        ]
      ),
      " blah",
    ]);
  });

  it("has author abbreviations with dates", () => {
    expect(expandShAbbreviationsIn("blah Ampel. blah")).toStrictEqual([
      "blah ",
      new XmlNode(
        "span",
        [["class", "lsBibl"]],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsHover lsAuthor"],
              ["title", "L. Ampelius, hist. about A.D. 300"],
            ],
            ["Ampel."]
          ),
        ]
      ),
      " blah",
    ]);
  });
});
