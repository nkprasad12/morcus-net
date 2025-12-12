/**
 * @jest-environment jsdom
 */

import { findNextOptions } from "@/web/client/pages/corpus/autocomplete/state_transitions";
import type { QueryToken } from "@/web/client/pages/corpus/autocomplete/input_tokenizer";

describe("findNextOptions", () => {
  describe("initial state", () => {
    it("should allow workFilter and wordFilter at start", () => {
      const result = findNextOptions([]);
      expect(result).toEqual(
        expect.arrayContaining(["workFilter", "wordFilter", "("])
      );
      expect(result).toHaveLength(3);
    });
  });

  describe("after wordFilter", () => {
    it("should allow logical operators and proximity after a word filter", () => {
      const tokens: QueryToken[] = [["puella", 0, "wordFilter"]];
      const result = findNextOptions(tokens);
      expect(result).toEqual(
        expect.arrayContaining([
          "wordFilter",
          "logic:and",
          "logic:or",
          "proximity",
          "(",
        ])
      );
      expect(result).toHaveLength(5);
    });

    it("should handle spaces correctly", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        [" ", 12, "space"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(
        expect.arrayContaining([
          "wordFilter",
          "logic:and",
          "logic:or",
          "proximity",
          "(",
        ])
      );
      expect(result).toHaveLength(5);
    });
  });

  describe("after workFilter", () => {
    it("should allow another workFilter or start a span", () => {
      const tokens: QueryToken[] = [["#caesar", 0, "workFilter"]];
      const result = findNextOptions(tokens);
      expect(result).toEqual(expect.arrayContaining(["wordFilter", "("]));
      expect(result).toHaveLength(2);
    });
  });

  describe("logical operators", () => {
    it("should allow word filter after logical operator", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(["wordFilter"]);
    });

    it("should allow only `and` in complex term with `and`", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["@lemma:puer", 16, "wordFilter"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(
        expect.arrayContaining(["logic:and", "proximity", "wordFilter", "("])
      );
      expect(result).toHaveLength(4);
    });

    it("should reject mixing 'and' with 'or'", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["@lemma:puer", 16, "wordFilter"],
        ["or", 27, "logic:or"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toContain("Cannot mix");
    });

    it("should reject mixing 'or' with 'and'", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["or", 12, "logic:or"],
        ["@lemma:puer", 15, "wordFilter"],
        ["and", 26, "logic:and"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toContain("Cannot mix");
    });

    it("should allow multiple 'and' operators", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["@lemma:puer", 16, "wordFilter"],
        ["and", 27, "logic:and"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(["wordFilter"]);
    });

    it("should reset logical operator after completing a span term", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["@lemma:puer", 16, "wordFilter"],
        ["~5", 27, "proximity"],
        ["amat", 30, "wordFilter"],
        ["or", 40, "logic:or"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(["wordFilter"]);
    });
  });

  describe("parentheses", () => {
    it("should allow opening parenthesis at span start", () => {
      const tokens: QueryToken[] = [];
      const result = findNextOptions(tokens);
      expect(result).toEqual(
        expect.arrayContaining(["workFilter", "wordFilter", "("])
      );
      expect(result).toHaveLength(3);
    });

    it("should require wordFilter after opening parenthesis", () => {
      const tokens: QueryToken[] = [["(", 0, "("]];
      const result = findNextOptions(tokens);
      expect(result).toEqual(["wordFilter"]);
    });

    it("should allow closing parenthesis or op after completing complex term", () => {
      const tokens: QueryToken[] = [
        ["(", 0, "("],
        ["puella", 1, "wordFilter"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(
        expect.arrayContaining(["logic:and", "logic:or", ")"])
      );
      expect(result).toHaveLength(3);
    });

    it("should not allow closing parenthesis when no open paren", () => {
      const tokens: QueryToken[] = [["puella", 0, "wordFilter"]];
      const result = findNextOptions(tokens);
      expect(result).not.toContain(")");
    });
  });

  describe("proximity operators", () => {
    it("should allow proximity after completing a span", () => {
      const tokens: QueryToken[] = [["puella", 0, "wordFilter"]];
      const result = findNextOptions(tokens);
      expect(result).toContain("proximity");
    });

    it("should start new span after proximity", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["~5", 12, "proximity"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(expect.arrayContaining(["wordFilter", "("]));
      expect(result).toHaveLength(2);
    });
  });

  describe("error cases", () => {
    it("should reject invalid token at start", () => {
      const tokens: QueryToken[] = [["and", 0, "logic:and"]];
      const result = findNextOptions(tokens);
      expect(result).toContain("not allowed at start");
    });

    it("should reject proximity in complex term", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["~5", 16, "proximity"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toContain("not allowed after");
    });
  });

  describe("complex scenarios", () => {
    it("should handle work filter followed by complex query", () => {
      const tokens: QueryToken[] = [
        ["#caesar", 0, "workFilter"],
        ["(", 12, "("],
        ["puella", 13, "wordFilter"],
        ["and", 25, "logic:and"],
        ["@lemma:puer", 29, "wordFilter"],
        [")", 40, ")"],
        ["~5", 41, "proximity"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(expect.arrayContaining(["wordFilter", "("]));
      expect(result).toHaveLength(2);
    });

    it("should handle multiple spans with proximity", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["~5", 12, "proximity"],
        ["form:puer", 15, "wordFilter"],
        ["~3", 25, "proximity"],
      ];
      const result = findNextOptions(tokens);
      expect(result).toEqual(expect.arrayContaining(["wordFilter", "("]));
      expect(result).toHaveLength(2);
    });
  });
});
