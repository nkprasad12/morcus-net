import {
  processWords,
  removeDiacritics,
  removeMacrons,
  stripDiacritics,
  trimRawQuery,
} from "@/common/text_cleaning";

describe("stripDiacritics", () => {
  it("does not modify text without diacritics", () => {
    const result = stripDiacritics("canaba");
    expect(result.word).toBe("canaba");
    expect(result.diacritics).toBeUndefined();
    expect(result.positions).toBeUndefined();
  });

  it("handles characters with stacked diacritics)", () => {
    const withStackedDiacritics = "hello\u0304\u0306";
    const result = stripDiacritics(withStackedDiacritics);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0304", "\u0306"]);
    expect(result.positions).toStrictEqual([4, 4]);
  });

  it("handles pre-composed character followed by combining character", () => {
    const withPrecomposedAndCombining = "hell\u00F5\u0304"; // ṍ (o with tilde and macron)
    const result = stripDiacritics(withPrecomposedAndCombining);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0303", "\u0304"]); // tilde and macron
    expect(result.positions).toStrictEqual([4, 4]);
  });

  it("handles indices correctly for diacritic in the middle.", () => {
    const withPrecomposedAndCombining = "hēllō";
    const result = stripDiacritics(withPrecomposedAndCombining);

    expect(result.word).toBe("hello");
    expect(result.diacritics).toStrictEqual(["\u0304", "\u0304"]);
    expect(result.positions).toStrictEqual([1, 4]);
  });
});

describe("removeDiacritics", () => {
  it("does not modify text without diacritics", () => {
    expect(removeDiacritics("canaba")).toBe("canaba");
  });

  it("removes only diacritics if present", () => {
    expect(removeDiacritics("cānaba")).toBe("canaba");
  });

  it("handles weird tilde characters in o", () => {
    const result = removeDiacritics("Ōărĭon").toLowerCase();
    expect(result).toBe("oarion");
  });

  it("handles characters with stacked diacritics (macron + breve)", () => {
    const withStackedDiacritics = "a\u0304\u0306";
    expect(removeDiacritics(withStackedDiacritics)).toBe("a");

    const word = "r" + withStackedDiacritics + "ma";
    expect(removeDiacritics(word)).toBe("rama");
  });
});

describe("removeMacrons", () => {
  it("does not modify text without macrons", () => {
    expect(removeMacrons("canaba")).toBe("canaba");
    expect(removeMacrons("")).toBe("");
  });

  it("removes precomposed macrons and normalizes to NFC", () => {
    expect(removeMacrons("Mūsa")).toBe("Musa");
    expect(removeMacrons("causās")).toBe("causas");
    expect(removeMacrons("hēllō")).toBe("hello");
  });

  it("removes combining macrons (U+0304 and U+0305)", () => {
    expect(removeMacrons("Mu\u0304sa")).toBe("Musa");
    expect(removeMacrons("Mu\u0305sa")).toBe("Musa");
  });

  it("preserves breves and other non-macron diacritics", () => {
    expect(removeMacrons("hăbēna")).toBe("hăbena");
    expect(removeMacrons("cöëunt")).toBe("cöëunt");
    expect(removeMacrons("Ōărĭon")).toBe("Oărĭon");
    expect(removeMacrons("a\u0304\u0306")).toBe("ă");
  });
});

describe("processWords", () => {
  it("splits across punctiation initial word final word", () => {
    expect(processWords("hello darkness. (my) old", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits words with newlines and tabs", () => {
    expect(processWords("hello\ndarkness\tmy", (s) => s)).toStrictEqual([
      "hello",
      "\n",
      "darkness",
      "\t",
      "my",
    ]);
  });

  it("splits across punctuation initial other final word", () => {
    expect(processWords("[hello darkness. (my) old", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits across punctuation initial word final other", () => {
    expect(processWords("hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });

  it("splits across punctuation initial other final other", () => {
    expect(processWords("[hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });

  it("splits punctuation inside word", () => {
    expect(processWords("h[ell]o darkness", (s) => s)).toStrictEqual([
      "h",
      "[",
      "ell",
      "]",
      "o",
      " ",
      "darkness",
    ]);
  });
});

describe("trimRawQuery", () => {
  it("trims surrounding quotes and brackets", () => {
    expect(trimRawQuery('"habeo"')).toBe("habeo");
    expect(trimRawQuery("'habeo'")).toBe("habeo");
    expect(trimRawQuery("«habeo»")).toBe("habeo");
    expect(trimRawQuery("„habeo“")).toBe("habeo");
    expect(trimRawQuery("[habeo]")).toBe("habeo");
    expect(trimRawQuery("(habeo)")).toBe("habeo");
  });

  it("trims trailing punctuation and whitespace", () => {
    expect(trimRawQuery("habeo,")).toBe("habeo");
    expect(trimRawQuery("habeo.")).toBe("habeo");
    expect(trimRawQuery("habeo;")).toBe("habeo");
    expect(trimRawQuery("habeo! ")).toBe("habeo");
    expect(trimRawQuery("  habeo  ")).toBe("habeo");
    expect(trimRawQuery("...habeo???")).toBe("habeo");
  });

  it("preserves valid macrons and breves within the word", () => {
    expect(trimRawQuery("hăbēna")).toBe("hăbēna");
    expect(trimRawQuery(' "hăbēna," ')).toBe("hăbēna");
    expect(trimRawQuery("causa\u0304s")).toBe("causa\u0304s");
  });

  it("returns empty string when input consists only of punctuation", () => {
    expect(trimRawQuery("")).toBe("");
    expect(trimRawQuery("   ")).toBe("");
    expect(trimRawQuery("...")).toBe("");
    expect(trimRawQuery('"""')).toBe("");
    expect(trimRawQuery("?!,;:()")).toBe("");
  });
});
