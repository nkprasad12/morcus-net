import {
  canonicalRend,
  isFullyHandledRend,
  isHandledRend,
  isKnownRend,
  rendTokens,
} from "@/common/library/perseus_rends";
import { transformContentNode } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";

// The rend sets before renditions were tokenised, and what they emitted.
const PREVIOUS_HANDLED: [string, string][] = [
  ["indent", "indent"],
  ["ital", "italic"],
  ["italic", "italic"],
  ["italics", "italic"],
  ["blockquote", "blockquote"],
  ["uppercase", "uppercase"],
  ["smallcaps", "smallcaps"],
  ["7", "7"],
  ["overline", "overline"],
];
const PREVIOUS_KNOWN_ONLY = [
  "bold",
  "sup",
  "merge",
  "align(indent)",
  "merge;double",
  "double",
  "double; merge",
  "single",
  "single; merge",
  "align(blockquote)",
  ". . . .",
  "*",
  " * * * ",
];

describe("rend tokens", () => {
  it.each(PREVIOUS_HANDLED)(
    "keeps the output of single-token %s (%s)",
    (rend, emitted) => {
      expect(isKnownRend(rend)).toBe(true);
      expect(isHandledRend(rend)).toBe(true);
      expect(canonicalRend(rend)).toBe(emitted);
    }
  );

  it.each(PREVIOUS_KNOWN_ONLY)("still knows %s", (rend) => {
    expect(isKnownRend(rend)).toBe(true);
  });

  it("still rejects unknown and empty renditions", () => {
    expect(isKnownRend("inddent")).toBe(false);
    expect(isKnownRend("")).toBe(false);
    expect(isKnownRend("single; inddent")).toBe(false);
    expect(isKnownRend(undefined)).toBe(true);
  });

  it("splits on semicolons", () => {
    expect(rendTokens("single; smallcaps")).toEqual(["single", "smallcaps"]);
    expect(rendTokens("merge;double")).toEqual(["merge", "double"]);
  });

  it.each([
    ["align(indent)", "indent"],
    ["align(blockquote)", "blockquote"],
    ["single; smallcaps", "smallcaps"],
    ["smallcaps; single", "smallcaps"],
    ["align(blockquote); single", "blockquote"],
    ["align(blockquote); spacing", "blockquote"],
    ["overline; smallcaps", "overline smallcaps"],
    ["single; italic", "italic"],
    ["italic; italics", "italic"],
  ])("handles upstream's %s as %s", (rend, emitted) => {
    expect(isKnownRend(rend)).toBe(true);
    expect(isHandledRend(rend)).toBe(true);
    expect(canonicalRend(rend)).toBe(emitted);
  });

  it.each([
    "single; merge",
    "merge; single",
    "single; spacing",
    "spacing",
    "align(center)",
    "align(right)",
  ])("knows but does not render %s", (rend) => {
    expect(isKnownRend(rend)).toBe(true);
    expect(isHandledRend(rend)).toBe(false);
  });

  it("tells fully handled renditions apart", () => {
    expect(isFullyHandledRend("smallcaps")).toBe(true);
    expect(isFullyHandledRend("overline; smallcaps")).toBe(true);
    expect(isFullyHandledRend("single; smallcaps")).toBe(false);
    expect(isFullyHandledRend(undefined)).toBe(false);
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
    ["quote", "align(blockquote)", "blockquote"],
    ["quote", "single; smallcaps", "smallcaps"],
    ["emph", "smallcaps", "smallcaps"],
  ])("<%s rend=%s> is processed as rend=%s", (name, rend, canonical) => {
    const aliased = transform(name, rend);
    const original = transform(name, canonical);

    expect(aliased.attrs).toEqual(original.attrs);
    expect(aliased.getAttr("rend")).toBe(canonical);
    expect(aliased.getAttr("rendParent")).toBe(name);
  });

  it("emits every handled token of a compound rendition", () => {
    expect(transform("num", "overline; smallcaps").getAttr("rend")).toBe(
      "overline smallcaps"
    );
  });

  it("still rejects emphasis it would not render", () => {
    expect(() => transform("emph", "single; italic")).toThrow();
  });
});
