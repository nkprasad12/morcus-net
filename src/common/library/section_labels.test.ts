import {
  formatSectionLabel,
  formatSectionPath,
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
  });

  test("matches named tokens case-insensitively", () => {
    expect(formatSectionLabel("chapter", "Pr")).toBe("Praefatio");
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
