import { tokenizeInput } from "@/web/client/pages/corpus/autocomplete/input_tokenizer";

describe("tokenizeInput", () => {
  it("tokenizes the example from the docstring", () => {
    const result = tokenizeInput(" word1 (word2 word3)  ");
    expect(result).toEqual([
      [" ", 0, "space"],
      ["word1", 1, "wordFilter"],
      [" ", 6, "space"],
      ["(", 7, "("],
      ["word2", 8, "wordFilter"],
      [" ", 13, "space"],
      ["word3", 14, "wordFilter"],
      [")", 19, ")"],
      ["  ", 20, "space"],
    ]);
  });

  it("handles simple word", () => {
    const result = tokenizeInput("word");
    expect(result).toEqual([["word", 0, "wordFilter"]]);
  });

  it("handles multiple words with single spaces", () => {
    const result = tokenizeInput("word1 word2 word3");
    expect(result).toEqual([
      ["word1", 0, "wordFilter"],
      [" ", 5, "space"],
      ["word2", 6, "wordFilter"],
      [" ", 11, "space"],
      ["word3", 12, "wordFilter"],
    ]);
  });

  it("handles multiple consecutive spaces", () => {
    const result = tokenizeInput("word1   word2");
    expect(result).toEqual([
      ["word1", 0, "wordFilter"],
      ["   ", 5, "space"],
      ["word2", 8, "wordFilter"],
    ]);
  });

  it("handles leading spaces", () => {
    const result = tokenizeInput("  word");
    expect(result).toEqual([
      ["  ", 0, "space"],
      ["word", 2, "wordFilter"],
    ]);
  });

  it("handles trailing spaces", () => {
    const result = tokenizeInput("word  ");
    expect(result).toEqual([
      ["word", 0, "wordFilter"],
      ["  ", 4, "space"],
    ]);
  });

  it("handles parentheses without spaces", () => {
    const result = tokenizeInput("(word)");
    expect(result).toEqual([
      ["(", 0, "("],
      ["word", 1, "wordFilter"],
      [")", 5, ")"],
    ]);
  });

  it("handles parentheses with spaces", () => {
    const result = tokenizeInput("( word )");
    expect(result).toEqual([
      ["(", 0, "("],
      [" ", 1, "space"],
      ["word", 2, "wordFilter"],
      [" ", 6, "space"],
      [")", 7, ")"],
    ]);
  });

  it("handles nested parentheses", () => {
    const result = tokenizeInput("((word))");
    expect(result).toEqual([
      ["(", 0, "("],
      ["(", 1, "("],
      ["word", 2, "wordFilter"],
      [")", 6, ")"],
      [")", 7, ")"],
    ]);
  });

  it("handles empty string", () => {
    const result = tokenizeInput("");
    expect(result).toEqual([]);
  });

  it("handles only spaces", () => {
    const result = tokenizeInput("   ");
    expect(result).toEqual([["   ", 0, "space"]]);
  });

  it("handles only parentheses", () => {
    const result = tokenizeInput("()");
    expect(result).toEqual([
      ["(", 0, "("],
      [")", 1, ")"],
    ]);
  });
});
