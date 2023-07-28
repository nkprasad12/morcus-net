import { describe, expect, test } from "@jest/globals";
import { Book, Chapter, FullText, Section } from "@/common/texts";

describe("Section", () => {
  test("has expected toString", () => {
    const result = new Section("Foo bar", 3).toString();

    expect(result).toContain("Foo bar");
    expect(result).toContain("3:");
  });
});

describe("Chapter", () => {
  test("has expected toString", () => {
    const sections = [new Section("Foo bar", 3)];
    const result = new Chapter(sections, 2).toString();

    expect(result).toContain("Chapter 2");
    expect(result).toContain("3:");
  });
});

describe("Book", () => {
  test("has expected toString", () => {
    const sections = [new Section("Foo bar", 3)];
    const chapters = [new Chapter(sections, 2)];
    const result = new Book(chapters, 6).toString();

    expect(result).toContain("Book 6");
    expect(result).toContain("Chapter 2");
  });
});

describe("FullText", () => {
  test("has expected toString", () => {
    const sections = [new Section("Foo bar", 3)];
    const chapters = [new Chapter(sections, 2)];
    const books = [new Book(chapters, 6), new Book(chapters, 7)];
    const result = new FullText(books).toString();

    expect(result).toContain("Book 6");
    expect(result).toContain("Book 7");
  });
});
