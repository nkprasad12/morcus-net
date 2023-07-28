import { XmlNode } from "@/common/xml_node";
import { LsResult } from "./ls_api_result";

describe("Ls API types", () => {
  test("isMatch returns false on raw node", () => {
    const input = new XmlNode("span");
    expect(LsResult.isMatch(input)).toBe(false);
  });

  test("LsResult.isMatch returns true on no outline", () => {
    const input = new XmlNode("span");
    expect(LsResult.isMatch({ entry: input })).toBe(true);
  });

  test("LsResult.isMatch returns false without main section", () => {
    const input = new XmlNode("span");
    expect(LsResult.isMatch({ entry: input, outline: { senses: [] } })).toBe(
      false
    );
  });

  test("LsResult.isMatch returns true with bad outline", () => {
    const input = new XmlNode("span");
    expect(
      LsResult.isMatch({
        entry: input,
        outline: {
          mainSection: { text: "foo", level: 1, ordinal: "a", section: "foo" },
          senses: [],
        },
      })
    ).toBe(false);
  });

  test("LsResult.isMatch returns true with good outline", () => {
    const input = new XmlNode("span");
    const result = {
      entry: input,
      outline: {
        mainSection: {
          text: "foo",
          level: 1,
          ordinal: "a",
          sectionId: "foo",
        },
        senses: [],
      },
    };
    expect(LsResult.isMatch(result)).toBe(true);
  });
});
