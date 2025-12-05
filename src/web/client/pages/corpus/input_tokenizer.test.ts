import { tokenizeInput } from "@/web/client/pages/corpus/input_tokenizer";

describe("tokenizeInput", () => {
  it("tokenizes the example from the docstring", () => {
    const result = tokenizeInput(" word1 (word2 word3)  ");
    expect(result).toEqual([
      [" ", 0, true],
      ["word1", 1, false],
      [" ", 6, true],
      ["(", 7, false],
      ["word2", 8, false],
      [" ", 13, true],
      ["word3", 14, false],
      [")", 19, false],
      ["  ", 20, true],
    ]);
  });

  it("handles simple word", () => {
    const result = tokenizeInput("word");
    expect(result).toEqual([["word", 0, false]]);
  });

  it("handles multiple words with single spaces", () => {
    const result = tokenizeInput("word1 word2 word3");
    expect(result).toEqual([
      ["word1", 0, false],
      [" ", 5, true],
      ["word2", 6, false],
      [" ", 11, true],
      ["word3", 12, false],
    ]);
  });

  it("handles multiple consecutive spaces", () => {
    const result = tokenizeInput("word1   word2");
    expect(result).toEqual([
      ["word1", 0, false],
      ["   ", 5, true],
      ["word2", 8, false],
    ]);
  });

  it("handles leading spaces", () => {
    const result = tokenizeInput("  word");
    expect(result).toEqual([
      ["  ", 0, true],
      ["word", 2, false],
    ]);
  });

  it("handles trailing spaces", () => {
    const result = tokenizeInput("word  ");
    expect(result).toEqual([
      ["word", 0, false],
      ["  ", 4, true],
    ]);
  });

  it("handles parentheses without spaces", () => {
    const result = tokenizeInput("(word)");
    expect(result).toEqual([
      ["(", 0, false],
      ["word", 1, false],
      [")", 5, false],
    ]);
  });

  it("handles parentheses with spaces", () => {
    const result = tokenizeInput("( word )");
    expect(result).toEqual([
      ["(", 0, false],
      [" ", 1, true],
      ["word", 2, false],
      [" ", 6, true],
      [")", 7, false],
    ]);
  });

  it("handles nested parentheses", () => {
    const result = tokenizeInput("((word))");
    expect(result).toEqual([
      ["(", 0, false],
      ["(", 1, false],
      ["word", 2, false],
      [")", 6, false],
      [")", 7, false],
    ]);
  });

  it("handles empty string", () => {
    const result = tokenizeInput("");
    expect(result).toEqual([]);
  });

  it("handles only spaces", () => {
    const result = tokenizeInput("   ");
    expect(result).toEqual([["   ", 0, true]]);
  });

  it("handles only parentheses", () => {
    const result = tokenizeInput("()");
    expect(result).toEqual([
      ["(", 0, false],
      [")", 1, false],
    ]);
  });
});
