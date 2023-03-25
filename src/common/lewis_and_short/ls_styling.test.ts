import {
  substituteAbbreviation,
  attachHoverText,
  TrieNode,
  attachAbbreviations,
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
    const result = attachHoverText("Caesar", "Augustus");

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
    );

    expect(result).toContain("Augustus");
    expect(result).toContain(`Expanded from: Caesar`);
  });
});

describe("attachAbbreviations", () => {
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
    const input = "I have no substitutions.";
    const output = attachAbbreviations(input, trieRoot);
    expect(input).toStrictEqual(output);
  });

  it("handles multi-word keys", () => {
    const input = "I have no de Or. substitutions.";
    const output = attachAbbreviations(input, trieRoot);
    const deOr = attachHoverText("de Oratione", "Expanded from: de Or.");
    expect(output).toStrictEqual(`I have no ${deOr} substitutions.`);
  });

  it("handles multi-word keys", () => {
    const input = "I q. hi";
    const output = attachAbbreviations(input, trieRoot);
    const ambig = attachHoverText("q.", "Ambiguous: qui OR quam");
    expect(output).toStrictEqual(`I ${ambig} hi`);
  });

  it("handles ambiguous keys", () => {
    const input = "I v. h. v. have no t. t. substitutions.";
    const output = attachAbbreviations(input, trieRoot);
    const vhv = attachHoverText("vide hanc vocem", "Expanded from: v. h. v.");
    const tt = attachHoverText("technical term", "Expanded from: t. t.");
    expect(output).toStrictEqual(`I ${vhv} have no ${tt} substitutions.`);
  });

  it("uses shortest keys if longer are not present", () => {
    const input = "I v. have no t. substitutions.";
    const output = attachAbbreviations(input, trieRoot);
    const v = attachHoverText("verb", "Expanded from: v.");
    const t = attachHoverText("testPost", "Expanded from: t.");
    expect(output).toStrictEqual(`I ${v} have no ${t} substitutions.`);
  });

  it("handles abbreviations at start", () => {
    const input = "v. h. v. have no substitutions.";
    const output = attachAbbreviations(input, trieRoot);
    const vhv = attachHoverText("vide hanc vocem", "Expanded from: v. h. v.");
    expect(output).toStrictEqual(`${vhv} have no substitutions.`);
  });

  it("handles abbreviations at end", () => {
    const input = "I have no substitutions t. t.";
    const output = attachAbbreviations(input, trieRoot);
    const tt = attachHoverText("technical term", "Expanded from: t. t.");
    expect(output).toStrictEqual(`I have no substitutions ${tt}`);
  });

  it("handles substring edge case", () => {
    const input = "I de v. hi.";
    const output = attachAbbreviations(input, trieRoot);
    expect(output).toStrictEqual(
      `I de ${attachHoverText("verb", "Expanded from: v.")} hi.`
    );
  });
});
