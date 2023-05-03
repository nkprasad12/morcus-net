import { XmlNode } from "./xml_node";
import {
  substituteAbbreviation,
  attachHoverText,
  TrieNode,
  handleAbbreviations,
  findExpansions,
} from "./ls_styling";

describe("TrieNode", () => {
  it("adds words correctly", () => {
    const root = new TrieNode();
    root.add("ab", "Caesar", ["Imperator"]);

    expect(root.next("a")!.nodeValues()).toHaveLength(0);
    expect(root.next("a")!.isFullWord()).toBe(false);

    const values = root.next("a")!.next("b")!.nodeValues();
    expect(values).toHaveLength(1);
    expect(root.next("a")!.next("b")!.isFullWord()).toBe(true);
    expect(values[0]).toBe("Caesar");
  });

  it("handles disjoint adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("a", "Augustus");

    const aVals = root.next("a")!.nodeValues();
    expect(aVals).toHaveLength(1);
    expect(aVals[0]).toBe("Augustus");
    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(1);
    expect(jcVals[0]).toBe("Caesar");
  });

  it("handles duplicate adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("jc", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(2);
    expect(jcVals[0]).toBe("Caesar");
    expect(jcVals[1]).toBe("Augustus");
  });

  it("handles overlapping adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("jca", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(1);
    expect(jcVals[0]).toBe("Caesar");
    const jcaVals = root.next("j")!.next("c")!.next("a")!.nodeValues();
    expect(jcaVals).toHaveLength(1);
    expect(jcaVals[0]).toBe("Augustus");
  });

  it("returns values with filters as subset", () => {
    const root = new TrieNode();
    root.add("ab", "Caesar", ["Imperator", "Gaius"]);

    const values = root.next("a")!.next("b")!.nodeValues(["Gaius"]);
    expect(values).toHaveLength(1);
    expect(root.next("a")!.next("b")!.isFullWord()).toBe(true);
  });

  it("returns no values if filters do not match", () => {
    const root = new TrieNode();
    root.add("ab", "Caesar", ["Imperator", "Gaius"]);

    const values = root.next("a")!.next("b")!.nodeValues(["Gaius", "Filius"]);
    expect(values).toHaveLength(0);
  });

  it("handles filters for entries with no tags", () => {
    const root = new TrieNode();
    root.add("ab", "Caesar");

    const values = root.next("a")!.next("b")!.nodeValues(["Caesar"]);
    expect(values).toHaveLength(0);
  });
});

describe("attachHoverText", () => {
  it("shows expected content", () => {
    const result = attachHoverText("Caesar", "Augustus").toString();

    expect(result).toContain("Caesar");
    expect(result).toContain(`title="Augustus"`);
  });
});

describe("substituteAbbreviation", () => {
  it("shows expected content", () => {
    const result = substituteAbbreviation(
      "Caesar",
      new Map([
        ["A", "B"],
        ["Caesar", "Augustus"],
      ])
    ).toString();

    expect(result).toContain("Augustus");
    expect(result).toContain(`Expanded from: Caesar`);
  });
});

describe("handleAbbreviations", () => {
  const trieRoot = new TrieNode();

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
    const deOr = attachHoverText("de Oratione", "Expanded from: de Or.");
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
    const vhv = attachHoverText("vide hanc vocem", "Expanded from: v. h. v.");
    const tt = attachHoverText("technical term", "Expanded from: t. t.");
    expect(output.toString()).toStrictEqual(
      `<span>I ${vhv} have no ${tt} substitutions.</span>`
    );
  });

  it("uses shortest keys if longer are not present", () => {
    const input = new XmlNode("span", [], ["I v. have no t. substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    const v = attachHoverText("verb", "Expanded from: v.");
    const t = attachHoverText("testPost", "Expanded from: t.");
    expect(output.toString()).toStrictEqual(
      `<span>I ${v} have no ${t} substitutions.</span>`
    );
  });

  it("handles abbreviations at start", () => {
    const input = new XmlNode("span", [], ["v. h. v. have no substitutions."]);
    const output = handleAbbreviations(input, trieRoot);
    const vhv = attachHoverText("vide hanc vocem", "Expanded from: v. h. v.");
    expect(output.toString()).toStrictEqual(
      `<span>${vhv} have no substitutions.</span>`
    );
  });

  it("handles abbreviations at end", () => {
    const input = new XmlNode("span", [], ["I have no substitutions t. t."]);
    const output = handleAbbreviations(input, trieRoot);
    const tt = attachHoverText("technical term", "Expanded from: t. t.");
    expect(output.toString()).toStrictEqual(
      `<span>I have no substitutions ${tt}</span>`
    );
  });

  it("handles substring edge case", () => {
    const input = new XmlNode("span", [], ["I de v. hi."]);
    const output = handleAbbreviations(input, trieRoot);
    expect(output.toString()).toStrictEqual(
      `<span>I de ${attachHoverText("verb", "Expanded from: v.")} hi.</span>`
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

describe("findExpansions", () => {
  const trieRoot = new TrieNode();

  beforeAll(() => {
    trieRoot.add("de Or.", "de Oratione");
    trieRoot.add("v.", "verb");
    trieRoot.add("v. h. v.", "vide hanc vocem");
    trieRoot.add("t.", "testPost");
    trieRoot.add("t. t.", "technical term");
    trieRoot.add("q.", "qui");
    trieRoot.add("q.", "quam");
    trieRoot.add("eccl.", "ecclesiastical");
    trieRoot.add("Lat.", "Latin");
  });

  it("finds abbreviations after (", () => {
    const expansions = findExpansions("hello (t. Morcus).", trieRoot);

    expect(expansions).toHaveLength(1);
    const [index, length, expandedString] = expansions[0];
    expect(index).toBe(7);
    expect(length).toBe(2);
    expect(expandedString).toStrictEqual(["testPost"]);
  });

  it("finds words to be abbreviated in sequence", () => {
    const expansions = findExpansions("hi t. v. pls", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(3);
    expect(expansions[0][1]).toBe(2);
    expect(expansions[0][2]).toStrictEqual(["testPost"]);

    expect(expansions[1][0]).toBe(6);
    expect(expansions[1][1]).toBe(2);
    expect(expansions[1][2]).toStrictEqual(["verb"]);
  });

  it("finds bracketed in sequence", () => {
    const expansions = findExpansions("hi (t. v.) pls", trieRoot);

    expect(expansions).toHaveLength(2);
  });

  it("handles eccl Lat", () => {
    const expansions = findExpansions("tux (eccl. Lat.) tax", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(5);
    expect(expansions[0][1]).toBe(5);
    expect(expansions[0][2]).toStrictEqual(["ecclesiastical"]);

    expect(expansions[1][0]).toBe(11);
    expect(expansions[1][1]).toBe(4);
    expect(expansions[1][2]).toStrictEqual(["Latin"]);
  });
});
