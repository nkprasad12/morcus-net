import {
  compactRomanLawTokens,
  elideRomanLawTitleZero,
  expandRomanLawCitationAliases,
  expandRomanLawCompactPrTokens,
  formatCitationId,
  formatPageSpanLabel,
  formatRomanLawGutter,
  formatSectionIdPart,
  formatSectionLabel,
  formatSectionPath,
  formatVerboseSectionLabel,
} from "@/common/library/section_labels";

describe("formatSectionLabel", () => {
  test("capitalizes the part name before a numeric token", () => {
    expect(formatSectionLabel("chapter", "2")).toBe("Chapter 2");
    expect(formatSectionLabel("Book", "1")).toBe("Book 1");
  });

  test("uses the name alone for named tokens", () => {
    expect(formatSectionLabel("chapter", "pr")).toBe("Praefatio");
    expect(formatSectionLabel("chapter", "praef")).toBe("Praefatio");
    expect(formatSectionLabel("poem", "prologus")).toBe("Prologus");
    expect(formatSectionLabel("poem", "epilogus")).toBe("Epilogus");
    expect(formatSectionLabel("book", "appendix")).toBe("Appendix");
    expect(formatSectionLabel("book", "index")).toBe("Index");
    expect(formatSectionLabel("chapter", "sigla")).toBe("Sigla");
    expect(formatSectionLabel("chapter", "arg")).toBe("Argumentum");
    expect(formatSectionLabel("chapter", "fragments")).toBe("Fragmenta");
    expect(formatSectionLabel("section", "thema")).toBe("Thema");
  });

  test("matches named tokens case-insensitively", () => {
    expect(formatSectionLabel("chapter", "Pr")).toBe("Praefatio");
  });

  test("numbers appendix items", () => {
    expect(formatSectionLabel("chapter", "appendix2")).toBe("Appendix 2");
    expect(formatSectionPath(["chapter"], ["appendix4"])).toBe("Appendix 4");
  });

  test("leaves other non-numeric tokens alone", () => {
    expect(formatSectionLabel("book", "4a")).toBe("Book 4a");
    expect(formatSectionLabel("poem", "ep")).toBe("Poem ep");
    expect(formatSectionLabel("book", "Jul")).toBe("Book Jul");
    expect(formatSectionLabel("section", "fr1")).toBe("Section fr1");
  });

  test("omits the trailing space for an empty token", () => {
    expect(formatSectionLabel("section", "")).toBe("Section");
  });
});

describe("prologues of plays", () => {
  test("labels a prologue act or scene as Prologus", () => {
    expect(formatSectionLabel("act", "prologue")).toBe("Prologus");
    expect(formatSectionLabel("scene", "prologue", "1")).toBe("Prologus");
  });

  test("labels a pr scene inside a prologue act as the prologue", () => {
    expect(formatSectionLabel("scene", "pr", "prologue")).toBe("Prologus");
    expect(formatSectionLabel("scene", "pr2", "prologue")).toBe("Prologus 2");
    // Elsewhere `pr` is still a praefatio.
    expect(formatSectionLabel("chapter", "pr", "1")).toBe("Praefatio");
    expect(formatSectionLabel("scene", "pr2", "1")).toBe("Scene pr2");
  });

  test("formats a whole citation without repeating the prologue", () => {
    const parts = ["act", "scene", "line"];
    expect(formatSectionPath(parts, ["prologue", "pr"])).toBe("Prologus");
    expect(formatSectionPath(parts, ["prologue", "pr1"])).toBe("Prologus 1");
    expect(formatSectionPath(parts, ["1", "prologue"])).toBe("Act 1, Prologus");
    expect(formatSectionPath(parts, ["2", "3"])).toBe("Act 2, Scene 3");
    expect(formatSectionPath(["book", "chapter"], ["1", "pr"])).toBe(
      "Book 1, Praefatio"
    );
  });
});

describe("Livy's Periochae", () => {
  test("labels the group Periochae and each chapter in it a periocha", () => {
    expect(formatSectionLabel("book", "per")).toBe("Periochae");
    expect(formatSectionLabel("chapter", "49", "per")).toBe("Periocha 49");
    // Elsewhere a chapter is still a chapter.
    expect(formatSectionLabel("chapter", "49", "45")).toBe("Chapter 49");
  });

  test("formats a whole citation without repeating the group", () => {
    const parts = ["book", "chapter", "section"];
    expect(formatSectionPath(parts, ["per", "142"])).toBe("Periocha 142");
    expect(formatSectionPath(parts, ["45", "1"])).toBe("Book 45, Chapter 1");
  });
});

describe("citationStyle: roman_law", () => {
  const DIGEST_PARTS = ["book", "title", "lex", "paragraph"];

  test("Rule A: renders pr as Principium under roman_law and Praefatio by default", () => {
    expect(formatSectionLabel("paragraph", "pr", "1", "roman_law")).toBe(
      "Principium"
    );
    expect(formatSectionLabel("paragraph", "PR", undefined, "roman_law")).toBe(
      "Principium"
    );
    expect(formatSectionIdPart("paragraph", "pr", undefined, "roman_law")).toBe(
      "Principium"
    );
    expect(formatSectionLabel("paragraph", "pr", "1", "default")).toBe(
      "Praefatio"
    );
    expect(formatSectionLabel("paragraph", "pr")).toBe("Praefatio");

    expect(
      formatSectionPath(DIGEST_PARTS, ["1", "1", "1", "pr"], "roman_law")
    ).toBe("Book 1, Title 1, Lex 1, Principium");
    expect(
      formatVerboseSectionLabel(DIGEST_PARTS, ["1", "1", "1pr"], "roman_law")
    ).toBe("Book 1, Title 1, Lex 1, Principium");
    expect(formatSectionPath(DIGEST_PARTS, ["1", "1", "1", "pr"])).toBe(
      "Book 1, Title 1, Lex 1, Praefatio"
    );
  });

  test("Rule B: omits Title 0 in Digest Books 30–32 labels", () => {
    expect(formatSectionLabel("title", "0", "30", "roman_law")).toBe("");
    expect(formatSectionLabel("title", "0", "30", "default")).toBe("Title 0");
    expect(formatSectionLabel("title", "1", "30", "roman_law")).toBe("Title 1");

    expect(formatSectionPath(["book", "title"], ["30", "0"], "roman_law")).toBe(
      "Book 30"
    );
    expect(
      formatPageSpanLabel(
        ["book", "title"],
        ["30", "0"],
        undefined,
        "roman_law"
      )
    ).toBe("Book 30");
    expect(
      formatSectionPath(DIGEST_PARTS, ["30", "0", "79", "1"], "roman_law")
    ).toBe("Book 30, Lex 79, Paragraph 1");
    expect(
      formatSectionPath(DIGEST_PARTS, ["30", "79", "1"], "roman_law")
    ).toBe("Book 30, Lex 79, Paragraph 1");
    expect(
      formatSectionPath(DIGEST_PARTS, ["30", "0", "1", "pr"], "roman_law")
    ).toBe("Book 30, Lex 1, Principium");
    expect(formatSectionPath(DIGEST_PARTS, ["30", "1pr"], "roman_law")).toBe(
      "Book 30, Lex 1, Principium"
    );
  });

  test("Rule C: formats compact pr citations (1.1.1pr) and local gutter labels (1pr) while keeping raw dotId", () => {
    expect(compactRomanLawTokens(["1", "1", "1", "pr"])).toEqual([
      "1",
      "1",
      "1pr",
    ]);
    expect(expandRomanLawCompactPrTokens(["1", "1", "1pr"])).toEqual([
      "1",
      "1",
      "1",
      "pr",
    ]);
    expect(
      elideRomanLawTitleZero(["30", "0", "79", "1"], DIGEST_PARTS)
    ).toEqual(["30", "79", "1"]);
    expect(
      formatCitationId(["1", "1", "1", "pr"], "roman_law", DIGEST_PARTS)
    ).toBe("1.1.1pr");
    expect(
      formatCitationId(["30", "0", "1", "pr"], "roman_law", DIGEST_PARTS)
    ).toBe("30.1pr");
    expect(
      formatCitationId(["30", "0", "79", "1"], "roman_law", DIGEST_PARTS)
    ).toBe("30.79.1");

    const principium = formatRomanLawGutter(
      ["1", "1", "1", "pr"],
      ["1", "1"],
      "roman_law",
      DIGEST_PARTS
    );
    expect(principium).toEqual({
      dotId: "1.1.1.pr",
      localId: "1pr",
      prefix: "1.1.",
      aliasIds: ["1.1.1pr", "1.1.1"],
    });

    const lex2Pr = formatRomanLawGutter(
      ["1", "1", "2", "pr"],
      ["1", "1"],
      "roman_law",
      DIGEST_PARTS
    );
    expect(lex2Pr.localId).toBe("2pr");
    expect(lex2Pr.dotId).toBe("1.1.2.pr");
    expect(lex2Pr.aliasIds).toContain("1.1.2pr");

    const numberedPara = formatRomanLawGutter(
      ["1", "1", "1", "1"],
      ["1", "1"],
      "roman_law",
      DIGEST_PARTS
    );
    expect(numberedPara).toEqual({
      dotId: "1.1.1.1",
      localId: "1",
      prefix: "1.1.1.",
      aliasIds: [],
    });

    const book30Pr = formatRomanLawGutter(
      ["30", "0", "1", "pr"],
      ["30", "0"],
      "roman_law",
      DIGEST_PARTS
    );
    expect(book30Pr.dotId).toBe("30.0.1.pr");
    expect(book30Pr.localId).toBe("1pr");
    expect(book30Pr.prefix).toBe("30.");
    expect(book30Pr.aliasIds).toEqual(
      expect.arrayContaining(["30.1pr", "30.0.1pr", "30.1.pr", "30.1"])
    );

    expect(expandRomanLawCitationAliases("30.79.1", DIGEST_PARTS)).toEqual(
      expect.arrayContaining(["30.79.1", "30.0.79.1"])
    );
    expect(expandRomanLawCitationAliases("30.1pr", DIGEST_PARTS)).toEqual(
      expect.arrayContaining(["30.1pr", "30.1.pr", "30.0.1.pr", "30.0.1pr"])
    );
    expect(expandRomanLawCitationAliases("1.1.1pr", DIGEST_PARTS)).toEqual(
      expect.arrayContaining(["1.1.1pr", "1.1.1.pr"])
    );
  });
});
