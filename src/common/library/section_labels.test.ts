import { formatSectionLabel } from "@/common/library/section_labels";

describe("formatSectionLabel", () => {
  test("capitalizes the part name before a numeric token", () => {
    expect(formatSectionLabel("chapter", "2")).toBe("Chapter 2");
    expect(formatSectionLabel("Book", "1")).toBe("Book 1");
  });

  test("uses the name alone for named tokens", () => {
    expect(formatSectionLabel("chapter", "pr")).toBe("Praefatio");
    expect(formatSectionLabel("poem", "prologus")).toBe("Prologus");
    expect(formatSectionLabel("poem", "epilogus")).toBe("Epilogus");
    expect(formatSectionLabel("book", "appendix")).toBe("Appendix");
    expect(formatSectionLabel("book", "index")).toBe("Index");
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
