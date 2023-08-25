import {
  StringTrie,
  findExpansions,
} from "@/common/abbreviations/abbreviations";

describe("TrieNode", () => {
  it("adds words correctly", () => {
    const root = new StringTrie();
    root.add("ab", "Caesar");

    expect(root.next("a")!.nodeValues()).toHaveLength(0);
    expect(root.next("a")!.isFullWord()).toBe(false);

    const values = root.next("a")!.next("b")!.nodeValues();
    expect(values).toHaveLength(1);
    expect(root.next("a")!.next("b")!.isFullWord()).toBe(true);
    expect(values[0]).toBe("Caesar");
  });

  it("handles disjoint adds", () => {
    const root = new StringTrie();
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
    const root = new StringTrie();
    root.add("jc", "Caesar");
    root.add("jc", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(2);
    expect(jcVals[0]).toBe("Caesar");
    expect(jcVals[1]).toBe("Augustus");
  });

  it("handles overlapping adds", () => {
    const root = new StringTrie();
    root.add("jc", "Caesar");
    root.add("jca", "Augustus");

    const jcVals = root.next("j")!.next("c")!.nodeValues();
    expect(jcVals).toHaveLength(1);
    expect(jcVals[0]).toBe("Caesar");
    const jcaVals = root.next("j")!.next("c")!.next("a")!.nodeValues();
    expect(jcaVals).toHaveLength(1);
    expect(jcaVals[0]).toBe("Augustus");
  });
});

describe("findExpansions", () => {
  const trieRoot = new StringTrie();

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
