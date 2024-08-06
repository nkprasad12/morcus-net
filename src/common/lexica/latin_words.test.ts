import { checkPresent } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";

console.debug = jest.fn();

describe("LatinWords.resolveLatinWord", () => {
  it("handles base word", () => {
    const table = new Set(["Habeo", "habeo"]);
    const result = LatinWords.resolveLatinWord("habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles capitalized word", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("Habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles lower cased word word", () => {
    const table = new Set(["Habeo"]);
    const result = LatinWords.resolveLatinWord("habeo", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("Habeo");
  });

  it("handles word with enclitic", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("habeoque", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles word with enclitic and capitalization", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("Habeoque", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });

  it("handles all upper case with enclitic", () => {
    const table = new Set(["habeo"]);
    const result = LatinWords.resolveLatinWord("HABEOQUE", (w: string) => [
      table.has(w),
      undefined,
    ]);
    expect(checkPresent(result)[0]).toBe("habeo");
  });
});
