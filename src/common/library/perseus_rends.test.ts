import {
  canonicalRend,
  isHandledRend,
  isKnownRend,
} from "@/common/library/perseus_rends";
import { transformContentNode } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";

describe("canonicalRend", () => {
  it.each([
    ["align(indent)", "indent"],
    ["align(blockquote)", "blockquote"],
    ["ital", "italic"],
    ["italics", "italic"],
    ["indent", "indent"],
    ["smallcaps", "smallcaps"],
  ])("maps %s to %s", (rend, expected) => {
    expect(canonicalRend(rend)).toBe(expected);
    expect(isHandledRend(rend)).toBe(true);
    expect(isKnownRend(rend)).toBe(true);
  });
});

describe("transformContentNode with upstream rend spellings", () => {
  function transform(name: string, rend: string) {
    const node = new XmlNode(name, [["rend", rend]], ["Quamquam"]);
    return transformContentNode(node, ["Quamquam"]);
  }

  it.each([
    ["p", "align(indent)", "indent"],
    ["l", "align(indent)", "indent"],
    ["q", "align(blockquote)", "blockquote"],
  ])("<%s rend=%s> is processed as rend=%s", (name, rend, canonical) => {
    const aliased = transform(name, rend);
    const original = transform(name, canonical);

    expect(aliased.attrs).toEqual(original.attrs);
    expect(aliased.getAttr("rend")).toBe(canonical);
    expect(aliased.getAttr("rendParent")).toBe(name);
  });
});
