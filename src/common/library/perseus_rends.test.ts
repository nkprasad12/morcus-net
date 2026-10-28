import {
  allRendTokensIn,
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

  it("still rejects unknown renditions", () => {
    expect(isKnownRend("inddent")).toBe(false);
    expect(isKnownRend("single; inddent")).toBe(false);
    expect(isKnownRend(undefined)).toBe(true);
  });

  it.each(["", " ", ";", " ; "])(
    "treats the empty rendition %j like an absent one",
    (rend) => {
      expect(isKnownRend(rend)).toBe(true);
      expect(isHandledRend(rend)).toBe(false);
      expect(isFullyHandledRend(rend)).toBe(false);
      expect(allRendTokensIn(rend, new Set())).toBe(true);
    }
  );

  it.each([
    ["bold", "bold"],
    ["sup", "sup"],
    ["super", "sup"],
    ["superscript", "sup"],
    ["superscript; sup", "sup"],
    ["bold; single", "bold"],
    ["italic; bold", "italic bold"],
  ])("renders %s in body text as %s", (rend, emitted) => {
    expect(isKnownRend(rend)).toBe(true);
    expect(isHandledRend(rend)).toBe(true);
    expect(canonicalRend(rend)).toBe(emitted);
  });

  it("splits on semicolons", () => {
    expect(rendTokens("single; smallcaps")).toEqual(["single", "smallcaps"]);
    expect(rendTokens("merge;double")).toEqual(["merge", "double"]);
  });

  it.each([
    ["align(center)", "center"],
    ["align(indent)", "indent"],
    ["align(blockquote)", "blockquote"],
    ["align(blockquote", "blockquote"],
    ["aign(blockquote); single; merge", "blockquote"],
    ["smallcaos", "smallcaps"],
    ["dateline", "italic"],
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
    "align(right)",
    "opener",
    "salute",
    "F",
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
    ["l", "align(center)", "center"],
    ["label", "align(center)", "center"],
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

  it("ignores align(center) on <p> while preserving center + italic on <desc>", () => {
    expect(transform("p", "align(center)").getAttr("rend")).toBeUndefined();
    expect(transform("desc", "align(center)").getAttr("rend")).toBe(
      "center italic"
    );
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
