import {
  AbbreviationTrie,
  StringTrie,
  findExpansions,
  findExpansionsOld,
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

describe("findExpansionsOld", () => {
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
    const expansions = findExpansionsOld("hello (t. Morcus).", trieRoot);

    expect(expansions).toHaveLength(1);
    const [index, length, expandedString] = expansions[0];
    expect(index).toBe(7);
    expect(length).toBe(2);
    expect(expandedString).toStrictEqual(["testPost"]);
  });

  it("finds words to be abbreviated in sequence", () => {
    const expansions = findExpansionsOld("hi t. v. pls", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(3);
    expect(expansions[0][1]).toBe(2);
    expect(expansions[0][2]).toStrictEqual(["testPost"]);

    expect(expansions[1][0]).toBe(6);
    expect(expansions[1][1]).toBe(2);
    expect(expansions[1][2]).toStrictEqual(["verb"]);
  });

  it("finds bracketed in sequence", () => {
    const expansions = findExpansionsOld("hi (t. v.) pls", trieRoot);

    expect(expansions).toHaveLength(2);
  });

  it("handles eccl Lat", () => {
    const expansions = findExpansionsOld("tux (eccl. Lat.) tax", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(5);
    expect(expansions[0][1]).toBe(5);
    expect(expansions[0][2]).toStrictEqual(["ecclesiastical"]);

    expect(expansions[1][0]).toBe(11);
    expect(expansions[1][1]).toBe(4);
    expect(expansions[1][2]).toStrictEqual(["Latin"]);
  });
});

describe("findExpansions", () => {
  const trieRoot = AbbreviationTrie.from(
    [
      ["de Or.", "de Oratione"],
      ["v.", "verb"],
      ["v. h. v.", "vide hanc vocem"],
      ["t.", "testPost"],
      ["t. t.", "technical term"],
      ["v.", { postfix: " <f>", expansion: "see" }],
      ["q.", { expansion: "qui" }],
    ],
    [
      ["q.", "quam"],
      ["eccl.", "ecclesiastical"],
      ["bla.", { prefix: "bele ", expansion: "see" }],
      ["Lat.", "Latin"],
    ]
  );

  it("finds abbreviations after (", () => {
    const expansions = findExpansions("hello (t. Morcus).", trieRoot);

    expect(expansions).toHaveLength(1);
    const [index, length, expandedString] = expansions[0];
    expect(index).toBe(7);
    expect(length).toBe(2);
    expect(expandedString).toStrictEqual([
      {
        expansion: "testPost",
        original: "t.",
      },
    ]);
  });

  it("finds words to be abbreviated in sequence", () => {
    const expansions = findExpansions("hi t. v. pls", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(3);
    expect(expansions[0][1]).toBe(2);
    expect(expansions[0][2]).toStrictEqual([
      {
        expansion: "testPost",
        original: "t.",
      },
    ]);

    expect(expansions[1][0]).toBe(6);
    expect(expansions[1][1]).toBe(2);
    expect(expansions[1][2]).toStrictEqual([
      {
        expansion: "verb",
        original: "v.",
      },
    ]);
  });

  it("finds words to be abbreviated with postfix", () => {
    const expansions = findExpansions("hi t. v. <f>pls", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(3);
    expect(expansions[0][1]).toBe(2);
    expect(expansions[0][2]).toStrictEqual([
      {
        expansion: "testPost",
        original: "t.",
      },
    ]);

    expect(expansions[1][0]).toBe(6);
    expect(expansions[1][1]).toBe(2);
    expect(expansions[1][2]).toStrictEqual([
      {
        expansion: "verb",
        original: "v.",
      },
      {
        expansion: "see",
        original: "v.",
        postfix: " <f>",
      },
    ]);
  });

  it("finds words to be abbreviated with prefix", () => {
    const expansions = findExpansions("bele bla. he", trieRoot);

    expect(expansions).toHaveLength(1);

    expect(expansions[0][0]).toBe(5);
    expect(expansions[0][1]).toBe(4);
    expect(expansions[0][2]).toStrictEqual([
      {
        expansion: "see",
        original: "bla.",
        prefix: "bele ",
        replace: true,
      },
    ]);
  });

  it("does not find words to be abbreviated without required prefix", () => {
    const expansions = findExpansions("bel bla. he", trieRoot);
    expect(expansions).toHaveLength(0);
  });

  it("finds bracketed in sequence", () => {
    const expansions = findExpansions("hi (t. v.) pls", trieRoot);

    expect(expansions).toHaveLength(2);
  });

  it("finds longest possible match", () => {
    const expansions = findExpansions("hi v. h. v. pls", trieRoot);

    expect(expansions).toHaveLength(1);

    expect(expansions[0]).toStrictEqual([
      3,
      8,
      [{ original: "v. h. v.", expansion: "vide hanc vocem" }],
    ]);
  });

  it("finds both replacements and expansions for same match", () => {
    const expansions = findExpansions("hi q. pls", trieRoot);

    expect(expansions).toHaveLength(1);

    expect(expansions[0]).toStrictEqual([
      3,
      2,
      [
        { original: "q.", expansion: "qui" },
        { original: "q.", expansion: "quam", replace: true },
      ],
    ]);
  });

  it("handles eccl Lat", () => {
    const expansions = findExpansions("tux (eccl. Lat.) tax", trieRoot);

    expect(expansions).toHaveLength(2);

    expect(expansions[0][0]).toBe(5);
    expect(expansions[0][1]).toBe(5);
    expect(expansions[0][2]).toStrictEqual([
      {
        expansion: "ecclesiastical",
        original: "eccl.",
        replace: true,
      },
    ]);

    expect(expansions[1][0]).toBe(11);
    expect(expansions[1][1]).toBe(4);
    expect(expansions[1][2]).toStrictEqual([
      {
        expansion: "Latin",
        original: "Lat.",
        replace: true,
      },
    ]);
  });
});
