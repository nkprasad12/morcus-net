import { describe, expect, test } from '@jest/globals';
import { readFile } from '@/common/perseus_parser'

const ROOT = 'testdata/perseus'

describe('readFile', () => {
  test('parses books correctly', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books).toHaveLength(2);
    expect(result.books[0].num).toBe("1");
    expect(result.books[0].chapters).toHaveLength(2);
    expect(result.books[1].num).toBe("2");
    expect(result.books[1].chapters).toHaveLength(2);
  });

  test('parses chapters correctly', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books[0].chapters[0].num).toBe("1");
    expect(result.books[0].chapters[0].sections).toHaveLength(2);
    expect(result.books[0].chapters[1].num).toBe("2");
    expect(result.books[0].chapters[1].sections).toHaveLength(3);
  });

  test('parses chapters correctly', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books[0].chapters[0].sections[0].num).toBe("1");
    expect(result.books[0].chapters[0].sections[0].passage).toBe("Book1Chapter1Section1");
    expect(result.books[0].chapters[0].sections[1].num).toBe("2");
    expect(result.books[0].chapters[0].sections[1].passage).toBe("Book1Chapter1Section2");
  });

  test('parses chapters correctly', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books[0].chapters[0].sections[0].num).toBe("1");
    expect(result.books[0].chapters[0].sections[0].passage).toBe("Book1Chapter1Section1");
    expect(result.books[0].chapters[0].sections[1].num).toBe("2");
    expect(result.books[0].chapters[0].sections[1].passage).toBe("Book1Chapter1Section2");
  });

  test('handles sections with gap elements', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books[1].chapters[1].sections[1].num).toBe("2");
    expect(result.books[1].chapters[1].sections[1].passage).toBe("Book2Chapter2Section2");
  });

  test('handles chapters with only one section', () => {
    const result = readFile(`${ROOT}/doc_with_books_chapters_sections.xml`)

    expect(result.books[1].chapters[0].sections).toHaveLength(1);
    expect(result.books[1].chapters[0].sections[0].num).toBe("1");
    expect(result.books[1].chapters[0].sections[0].passage).toBe("Book2Chapter1Section1");
  });
});
