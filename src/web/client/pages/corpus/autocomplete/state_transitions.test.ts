/**
 * @jest-environment jsdom
 */

import {
  findNextOptions,
  termGroups,
} from "@/web/client/pages/corpus/autocomplete/state_transitions";
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

describe("termGroups", () => {
  describe("single terms", () => {
    it("should return single group for single word filter", () => {
      const tokens: QueryToken[] = [["puella", 0, "wordFilter"]];
      const result = termGroups(tokens);
      expect(result).toEqual([[["puella", 0, "wordFilter"]]]);
    });

    it("should include work filter in first group", () => {
      const tokens: QueryToken[] = [
        ["#caesar", 0, "workFilter"],
        ["puella", 12, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [["#caesar", 0, "workFilter"]],
        [["puella", 12, "wordFilter"]],
      ]);
    });

    it("should ignore spaces", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        [" ", 6, "space"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([[["puella", 0, "wordFilter"]]]);
    });
  });

  describe("complex terms with logical operators", () => {
    it("should group terms connected by 'and'", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["@lemma:puer", 16, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["puella", 0, "wordFilter"],
          ["and", 12, "logic:and"],
          ["@lemma:puer", 16, "wordFilter"],
        ],
      ]);
    });

    it("should group terms connected by 'or'", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["or", 12, "logic:or"],
        ["puer", 15, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["puella", 0, "wordFilter"],
          ["or", 12, "logic:or"],
          ["puer", 15, "wordFilter"],
        ],
      ]);
    });

    it("should group multiple terms with same operator", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["and", 25, "logic:and"],
        ["amor", 29, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["puella", 0, "wordFilter"],
          ["and", 12, "logic:and"],
          ["puer", 16, "wordFilter"],
          ["and", 25, "logic:and"],
          ["amor", 29, "wordFilter"],
        ],
      ]);
    });
  });

  describe("parenthesized expressions", () => {
    it("should group parenthesized complex term", () => {
      const tokens: QueryToken[] = [
        ["(", 0, "("],
        ["puella", 1, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        [")", 20, ")"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["(", 0, "("],
          ["puella", 1, "wordFilter"],
          ["and", 12, "logic:and"],
          ["puer", 16, "wordFilter"],
          [")", 20, ")"],
        ],
      ]);
    });

    it("should separate parenthesized term from following term", () => {
      const tokens: QueryToken[] = [
        ["(", 0, "("],
        ["puella", 1, "wordFilter"],
        [")", 7, ")"],
        ["puer", 12, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["(", 0, "("],
          ["puella", 1, "wordFilter"],
          [")", 7, ")"],
        ],
        [["puer", 12, "wordFilter"]],
      ]);
    });
  });

  describe("proximity operators", () => {
    it("should separate terms with proximity operator", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["~5", 12, "proximity"],
        ["puer", 15, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [["puella", 0, "wordFilter"]],
        [["~5", 12, "proximity"]],
        [["puer", 15, "wordFilter"]],
      ]);
    });

    it("should handle multiple proximity operators", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["~5", 12, "proximity"],
        ["puer", 15, "wordFilter"],
        ["~3", 25, "proximity"],
        ["amor", 28, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [["puella", 0, "wordFilter"]],
        [["~5", 12, "proximity"]],
        [["puer", 15, "wordFilter"]],
        [["~3", 25, "proximity"]],
        [["amor", 28, "wordFilter"]],
      ]);
    });

    it("should separate complex terms with proximity", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["~5", 25, "proximity"],
        ["amor", 28, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["puella", 0, "wordFilter"],
          ["and", 12, "logic:and"],
          ["puer", 16, "wordFilter"],
        ],
        [["~5", 25, "proximity"]],
        [["amor", 28, "wordFilter"]],
      ]);
    });
  });

  describe("complex scenarios", () => {
    it("should handle work filter with complex query", () => {
      const tokens: QueryToken[] = [
        ["#caesar", 0, "workFilter"],
        ["(", 12, "("],
        ["puella", 13, "wordFilter"],
        ["and", 25, "logic:and"],
        ["puer", 29, "wordFilter"],
        [")", 33, ")"],
        ["~5", 34, "proximity"],
        ["amor", 37, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [["#caesar", 0, "workFilter"]],
        [
          ["(", 12, "("],
          ["puella", 13, "wordFilter"],
          ["and", 25, "logic:and"],
          ["puer", 29, "wordFilter"],
          [")", 33, ")"],
        ],
        [["~5", 34, "proximity"]],
        [["amor", 37, "wordFilter"]],
      ]);
    });

    it("should handle parentheses with proximity", () => {
      const tokens: QueryToken[] = [
        ["(", 0, "("],
        ["puella", 1, "wordFilter"],
        ["or", 12, "logic:or"],
        ["puer", 15, "wordFilter"],
        [")", 19, ")"],
        ["~5", 20, "proximity"],
        ["(", 23, "("],
        ["amor", 24, "wordFilter"],
        [")", 28, ")"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [
          ["(", 0, "("],
          ["puella", 1, "wordFilter"],
          ["or", 12, "logic:or"],
          ["puer", 15, "wordFilter"],
          [")", 19, ")"],
        ],
        [["~5", 20, "proximity"]],
        [
          ["(", 23, "("],
          ["amor", 24, "wordFilter"],
          [")", 28, ")"],
        ],
      ]);
    });
  });

  describe("adjacent complex terms", () => {
    it("should separate unparenthesized terms", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["puer", 20, "wordFilter"],
        ["and", 25, "logic:and"],
        ["puella", 28, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [...tokens.slice(0, 3)],
        [...tokens.slice(3, 6)],
      ]);
    });

    it("should separate adjacent terms where first is parenthesized", () => {
      const tokens: QueryToken[] = [
        ["(", 0, "("],
        ["puella", 1, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        [")", 17, ")"],
        ["puer", 20, "wordFilter"],
        ["and", 25, "logic:and"],
        ["puella", 28, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [...tokens.slice(0, 5)],
        [...tokens.slice(5, 8)],
      ]);
    });

    it("should separate adjacent terms where second is parenthesized", () => {
      const tokens: QueryToken[] = [
        ["puella", 1, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["(", 17, "("],
        ["puer", 20, "wordFilter"],
        ["and", 25, "logic:and"],
        ["puella", 28, "wordFilter"],
        [")", 0, ")"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [...tokens.slice(0, 3)],
        [...tokens.slice(3, 8)],
      ]);
    });

    it("should separate adjacent terms where second is missing close", () => {
      const tokens: QueryToken[] = [
        ["puella", 1, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["(", 17, "("],
        ["puer", 20, "wordFilter"],
        ["and", 25, "logic:and"],
        ["puella", 28, "wordFilter"],
      ];
      const result = termGroups(tokens);
      expect(result).toEqual([
        [...tokens.slice(0, 3)],
        [...tokens.slice(3, 7)],
      ]);
    });
  });

  describe("error cases", () => {
    it("should return error for invalid token sequence", () => {
      const tokens: QueryToken[] = [["and", 0, "logic:and"]];
      const result = termGroups(tokens);
      expect(typeof result).toBe("string");
      expect(result).toContain("not allowed");
    });

    it("should return error for mixed logical operators", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["and", 12, "logic:and"],
        ["puer", 16, "wordFilter"],
        ["or", 25, "logic:or"],
      ];
      const result = termGroups(tokens);
      expect(typeof result).toBe("string");
      expect(result).toContain("Cannot mix");
    });

    it("should return error for multiple work filters", () => {
      const tokens: QueryToken[] = [
        ["#caesar", 0, "workFilter"],
        ["#cicero", 12, "workFilter"],
      ];
      const result = termGroups(tokens);
      expect(typeof result).toBe("string");
      expect(result).toContain("only one");
    });

    it("should return error for work filter not at start", () => {
      const tokens: QueryToken[] = [
        ["puella", 0, "wordFilter"],
        ["#caesar", 12, "workFilter"],
      ];
      const result = termGroups(tokens);
      expect(typeof result).toBe("string");
      expect(result).toContain("must be at start");
    });
  });
});
