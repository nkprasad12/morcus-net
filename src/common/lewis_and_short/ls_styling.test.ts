import { XmlNode } from "@/common/xml/xml_node";
import {
  hoverForAbbreviation,
  attachHoverText,
  handleAbbreviations,
} from "@/common/lewis_and_short/ls_styling";
import { StringTrie } from "@/common/abbreviations/abbreviations";

describe("attachHoverText", () => {
  it("shows expected content", () => {
    const result = attachHoverText("Caesar", "Augustus").toString();

    expect(result).toContain("Caesar");
    expect(result).toContain(`title="Augustus"`);
  });
});

describe("substituteAbbreviation", () => {
  it("shows expected content", () => {
    const result = hoverForAbbreviation(
      "Caesar",
      new Map([
        ["A", "B"],
        ["Caesar", "Augustus"],
      ])
    ).toString();

    expect(result).toContain("Caesar");
    expect(result).toContain(`title="Augustus"`);
  });
});

describe("handleAbbreviations", () => {
  const trieRoot = new StringTrie();

  beforeAll(() => {
    trieRoot.add("de Or.", "de Oratione");
    trieRoot.add("v.", "verb");
    trieRoot.add("v. h. v.", "vide hanc vocem");
    trieRoot.add("t.", "testPost");
    trieRoot.add("t. t.", "technical term");
    trieRoot.add("q.", "qui");
    trieRoot.add("q.", "quam");
  });

  it("is no-op on text with no substitutions", () => {
    const input = new XmlNode("span", [], ["I have no substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    expect(input.toString()).toStrictEqual(output.toString());
  });

  it("skips already expanded words", () => {
    const input = new XmlNode(
      "span",
      [["class", "lsHover lsBlah"]],
      ["q. t. t."]
    );
    const output = handleAbbreviations(input, trieRoot);
    expect(input.toString()).toStrictEqual(output.toString());
  });

  it("does not expand in the middle of a word", () => {
    const input = new XmlNode("span", [], ["That."]);
    const output = handleAbbreviations(input, trieRoot);
    expect(input.toString()).toStrictEqual(output.toString());
  });

  it("handles multi-word keys with no periods", () => {
    const input = new XmlNode("span", [], ["I have no de Or. substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    const deOr = attachHoverText("de Oratione", "Originally: de Or.");
    expect(output.toString()).toStrictEqual(
      `<span>I have no ${deOr} substitutions.</span>`
    );
  });

  it("handles multi-word keys with periods", () => {
    const input = new XmlNode("span", [], ["I q. hi"]);
    const output = handleAbbreviations(input, trieRoot);
    const ambig = attachHoverText("q.", "Ambiguous: qui OR quam");
    expect(output.toString()).toStrictEqual(`<span>I ${ambig} hi</span>`);
  });

  it("handles ambiguous keys", () => {
    const input = new XmlNode(
      "span",
      [],
      ["I v. h. v. have no t. t. substitutions."]
    );
    const output = handleAbbreviations(input, trieRoot);
    const vhv = attachHoverText("vide hanc vocem", "Originally: v. h. v.");
    const tt = attachHoverText("technical term", "Originally: t. t.");
    expect(output.toString()).toStrictEqual(
      `<span>I ${vhv} have no ${tt} substitutions.</span>`
    );
  });

  it("uses shortest keys if longer are not present", () => {
    const input = new XmlNode("span", [], ["I v. have no t. substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    const v = attachHoverText("verb", "Originally: v.");
    const t = attachHoverText("testPost", "Originally: t.");
    expect(output.toString()).toStrictEqual(
      `<span>I ${v} have no ${t} substitutions.</span>`
    );
  });

  it("handles abbreviations at start", () => {
    const input = new XmlNode("span", [], ["v. h. v. have no substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    const vhv = attachHoverText("vide hanc vocem", "Originally: v. h. v.");
    expect(output.toString()).toStrictEqual(
      `<span>${vhv} have no substitutions.</span>`
    );
  });

  it("handles abbreviations at end", () => {
    const input = new XmlNode("span", [], ["I have no substitutions t. t."]);
    const output = handleAbbreviations(input, trieRoot);
    const tt = attachHoverText("technical term", "Originally: t. t.");
    expect(output.toString()).toStrictEqual(
      `<span>I have no substitutions ${tt}</span>`
    );
  });

  it("handles substring edge case", () => {
    const input = new XmlNode("span", [], ["I de v. hi."]);
    const output = handleAbbreviations(input, trieRoot);
    expect(output.toString()).toStrictEqual(
      `<span>I de ${attachHoverText("verb", "Originally: v.")} hi.</span>`
    );
  });

  it("only substitutes in hover mode", () => {
    const input = new XmlNode("span", [], ["I de v. hi."]);
    const output = handleAbbreviations(input, trieRoot, false);
    expect(output.toString()).toStrictEqual(
      `<span>I de ${attachHoverText("v.", "verb")} hi.</span>`
    );
  });

  it("handles nested  nodes", () => {
    const input = new XmlNode(
      "span",
      [],
      ["I v. hi", new XmlNode("span", [], ["I t. hi"])]
    );

    const output = handleAbbreviations(input, trieRoot);

    expect(output.children).toHaveLength(4);
    const nested = XmlNode.assertIsNode(output.children[3]);
    expect(nested.children).toHaveLength(3);
  });

  it("copies attributes", () => {
    const originalAttrs: [string, string][] = [["a", "b"]];
    const input = new XmlNode("span", originalAttrs, []);

    const output = handleAbbreviations(input, trieRoot);

    expect(output.attrs).toStrictEqual(originalAttrs);
    expect(output.attrs).not.toBe(originalAttrs);
    expect(output.attrs[0]).not.toBe(originalAttrs[0]);
  });
});
