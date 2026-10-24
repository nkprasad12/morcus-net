import { EntryResult } from "@/common/dictionaries/dict_result";
import { XmlNode } from "@/common/xml/xml_node";

describe("Dict Result API types", () => {
  test("isMatch returns false on raw node", () => {
    const input = new XmlNode("span");
    expect(EntryResult.isMatch(input)).toBe(false);
  });

  test("EntryResult.isMatch returns false on no outline", () => {
    expect(EntryResult.isMatch({ entry: "<span></span>" })).toBe(false);
  });

  test("EntryResult.isMatch returns false without main section", () => {
    expect(
      EntryResult.isMatch({ entry: "<span></span>", outline: { senses: [] } })
    ).toBe(false);
  });

  test("EntryResult.isMatch returns true with bad outline", () => {
    expect(
      EntryResult.isMatch({
        entry: "<span></span>",
        outline: {
          mainSection: { text: "foo", level: 1, ordinal: "a", section: "foo" },
          senses: [],
        },
      })
    ).toBe(false);
  });

  test("EntryResult.isMatch returns true with good outline", () => {
    const result = {
      entry: "<span></span>",
      outline: {
        mainKey: "foooo",
        mainSection: {
          text: "foo",
          level: 1,
          ordinal: "a",
          sectionId: "foo",
        },
        senses: [],
      },
    };
    expect(EntryResult.isMatch(result)).toBe(true);
  });
});
