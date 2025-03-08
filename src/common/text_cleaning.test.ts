import {
  processWords,
  removeDiacritics,
  stripDiacritics,
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
