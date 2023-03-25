import {
  substituteAbbreviation,
  attachHoverText,
  TrieNode,
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
    expect(values[0].value).toBe("Caesar");
    expect(values[0].tags).toStrictEqual(["Imperator"]);
  });

  it("handles disjoint adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("a", "Augustus");

    const aVals = root.next("a")!.nodeValues();
    expect(aVals).toHaveLength(1);
    expect(aVals[0].value).toBe("Augustus");
    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(1);
    expect(jcVals[0].value).toBe("Caesar");
  });

  it("handles duplicate adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("jc", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(2);
    expect(jcVals[0].value).toBe("Caesar");
    expect(jcVals[1].value).toBe("Augustus");
  });

  it("handles overlapping adds", () => {
    const root = new TrieNode();
    root.add("jc", "Caesar");
    root.add("jca", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(1);
    expect(jcVals[0].value).toBe("Caesar");
    const jcaVals = root.next("j")!.next("c")!.next("a")!.nodeValues();
    expect(jcaVals).toHaveLength(1);
    expect(jcaVals[0].value).toBe("Augustus");
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
