import { normalizeCorpusToken } from "@/common/library/corpus/corpus_normalization";

describe("normalizeCorpusToken", () => {
  it("strips macrons, breves, ictus, diaereses, circumflexes, underdots, overlines, and strokes on the Latin path", () => {
    expect(normalizeCorpusToken("māter")).toBe("mater");
    expect(normalizeCorpusToken("bŏnus")).toBe("bonus");
    expect(normalizeCorpusToken("égo")).toBe("ego");
    expect(normalizeCorpusToken("Égo")).toBe("Ego");
    expect(normalizeCorpusToken("poëtae")).toBe("poetae");
    expect(normalizeCorpusToken("aër")).toBe("aer");
    expect(normalizeCorpusToken("denûm")).toBe("denum");
    expect(normalizeCorpusToken("ca\u0323sin\u0323u\u0323st")).toBe("casinust");
    expect(normalizeCorpusToken("x\u0305v\u0305i\u0305")).toBe("xvi");
    expect(normalizeCorpusToken("|x\u0305x\u0305x\u0305")).toBe("|xxx");
    expect(normalizeCorpusToken("verres\u0335")).toBe("verres");
  });

  it("folds Roman numeral codepoints U+2160–U+217F to ASCII letters", () => {
    expect(normalizeCorpusToken("ⅹ\u0305ⅰ\u0305ⅰ\u0305")).toBe("xii");
    expect(
      normalizeCorpusToken(
        "|ⅽ\u0305ⅹ\u0305ⅹ\u0305ⅹ\u0305ⅰ\u0305ⅰ\u0305ⅰ\u0305ⅰ\u0305|"
      )
    ).toBe("|cxxxiiii|");
    expect(
      normalizeCorpusToken("ⅾ\u0305ⅽ\u0305ⅽ\u0305ⅹ\u0305ⅹ\u0305ⅴ\u0305")
    ).toBe("dccxxv");
    expect(normalizeCorpusToken("ⅼ\u0305ⅹ\u0305ⅹ\u0305ⅰ\u0305ⅰ\u0305")).toBe(
      "lxxii"
    );
    expect(normalizeCorpusToken("ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅬⅭⅮⅯ")).toBe(
      "IIIIIIIVVVIVIIVIIIIXXXIXIILCDM"
    );
    expect(normalizeCorpusToken("ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻⅼⅽⅾⅿ")).toBe(
      "iiiiiiivvviviiviiiixxxixiilcdm"
    );
  });

  it("folds Latin ligatures æ Æ œ Œ (including precomposed ǽ Ǽ ǣ Ǣ) to ASCII digraphs", () => {
    expect(normalizeCorpusToken("præterierat")).toBe("praeterierat");
    expect(normalizeCorpusToken("quæso")).toBe("quaeso");
    expect(normalizeCorpusToken("Ægyptus")).toBe("Aegyptus");
    expect(normalizeCorpusToken("cœrceas")).toBe("coerceas");
    expect(normalizeCorpusToken("Œdipus")).toBe("Oedipus");
    expect(normalizeCorpusToken("quǽso")).toBe("quaeso");
    expect(normalizeCorpusToken("Ǽgyptus")).toBe("Aegyptus");
    expect(normalizeCorpusToken("prǣter")).toBe("praeter");
    expect(normalizeCorpusToken("Ǣgyptus")).toBe("Aegyptus");
  });

  it("preserves Greek accents, breathings, and iota subscripts while stripping macrons/breves", () => {
    expect(normalizeCorpusToken("καὶ")).toBe("και\u0300");
    expect(normalizeCorpusToken("ἀφροδίτη")).toBe("α\u0313φροδι\u0301τη");
    expect(normalizeCorpusToken("οἴνῳque")).toBe("οι\u0313\u0301νω\u0345que");
    expect(normalizeCorpusToken("ὅμοιόνque")).toBe(
      "ο\u0314\u0301μοιο\u0301νque"
    );
    expect(normalizeCorpusToken("α\u0304\u0301")).toBe("α\u0301");
    expect(normalizeCorpusToken("α\u0306")).toBe("α");
  });

  it("leaves apostrophus numerals ↄ, ∞, |, Vitruvius fraction marks, and Cyrillic intact", () => {
    expect(normalizeCorpusToken("ciↄ")).toBe("ciↄ");
    expect(normalizeCorpusToken("ccciↄↄↄ")).toBe("ccciↄↄↄ");
    expect(normalizeCorpusToken("ⅰↄ")).toBe("iↄ");
    expect(normalizeCorpusToken("∞cc")).toBe("∞cc");
    expect(normalizeCorpusToken("s¯")).toBe("s¯");
    expect(normalizeCorpusToken("is÷")).toBe("is÷");
    expect(normalizeCorpusToken("\u0430c")).toBe("\u0430c");
  });

  it("falls back to the original token when stripping combining marks leaves an empty string", () => {
    expect(normalizeCorpusToken("\u0335")).toBe("\u0335");
    expect(normalizeCorpusToken("\u0301")).toBe("\u0301");
    expect(() => normalizeCorpusToken("")).toThrow(
      "Corpus word token must not be empty"
    );
  });
});
