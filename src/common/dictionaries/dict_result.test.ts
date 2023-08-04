import { EntryResult } from "@/common/dictionaries/dict_result";
import { XmlNode } from "@/common/xml_node";

describe("Dict Result API types", () => {
  test("isMatch returns false on raw node", () => {
    const input = new XmlNode("span");
    expect(EntryResult.isMatch(input)).toBe(false);
  });

  test("EntryResult.isMatch returns false on no outline", () => {
    const input = new XmlNode("span");
    expect(EntryResult.isMatch({ entry: input })).toBe(false);
  });

  test("EntryResult.isMatch returns false without main section", () => {
    const input = new XmlNode("span");
    expect(EntryResult.isMatch({ entry: input, outline: { senses: [] } })).toBe(
      false
    );
  });

  test("EntryResult.isMatch returns true with bad outline", () => {
    const input = new XmlNode("span");
    expect(
      EntryResult.isMatch({
        entry: input,
        outline: {
          mainSection: { text: "foo", level: 1, ordinal: "a", section: "foo" },
          senses: [],
        },
      })
    ).toBe(false);
  });

  test("EntryResult.isMatch returns true with good outline", () => {
    const input = new XmlNode("span");
    const result = {
      entry: input,
      outline: {
        mainOrth: "foooo",
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
