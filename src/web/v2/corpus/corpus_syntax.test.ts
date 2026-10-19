/**
 * Tests for the shared corpus grammar. The first four suites are ported from
 * V1 (`archive/ui-v1:src/web/client/pages/corpus/autocomplete/*.test.ts` and the
 * `transformQuery` suite in `corpus_view.test.tsx`) so V2 keeps V1's grammar.
 */

import {
  canonicalAuthor,
  categorizeToken,
  errorsForToken,
  findNextOptions,
  hasInflectionFilters,
  parseProximity,
  termGroups,
  tokenizeInput,
  transformQuery,
  validateQuery,
  type QueryToken,
} from "@/web/v2/corpus/corpus_syntax.common";

describe("categorizeToken", () => {
  it("categorizes opening parenthesis", () => {
    expect(categorizeToken("(")).toBe("(");
  });

  it("categorizes closing parenthesis", () => {
    expect(categorizeToken(")")).toBe(")");
  });

  it("categorizes 'and' as logical operator", () => {
    expect(categorizeToken("and")).toBe("logic:and");
  });

  it("categorizes 'or' as logical operator", () => {
    expect(categorizeToken("or")).toBe("logic:or");
  });

  it("categorizes empty string as space", () => {
    expect(categorizeToken("")).toBe("space");
  });

  it("categorizes whitespace as space", () => {
    expect(categorizeToken("   ")).toBe("space");
  });

  it("categorizes single space as space", () => {
    expect(categorizeToken(" ")).toBe("space");
  });

  it("categorizes token starting with @ as wordFilter", () => {
    expect(categorizeToken("@lemma")).toBe("wordFilter");
    expect(categorizeToken("@form")).toBe("wordFilter");
  });

  it("categorizes token starting with # as workFilter", () => {
    expect(categorizeToken("#aeneid")).toBe("workFilter");
    expect(categorizeToken("#caesar")).toBe("workFilter");
  });

  it("categorizes token containing ~ as proximity", () => {
    expect(categorizeToken("5~")).toBe("proximity");
    expect(categorizeToken("~5")).toBe("proximity");
  });

  it("categorizes plain word as wordFilter", () => {
    expect(categorizeToken("word")).toBe("wordFilter");
    expect(categorizeToken("puella")).toBe("wordFilter");
  });

  it("categorizes words with special characters as wordFilter", () => {
    expect(categorizeToken("word-with-dash")).toBe("wordFilter");
    expect(categorizeToken("word.with.dot")).toBe("wordFilter");
  });
});

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

describe("transformQuery", () => {
  describe("simple queries", () => {
    it("should pass through single word unchanged", () => {
      expect(transformQuery("puella")).toBe("puella");
    });

    it("should pass through adjacent words unchanged", () => {
      expect(transformQuery("puella puer")).toBe("puella puer");
    });

    it("should handle work filters", () => {
      expect(transformQuery("#caesar puella")).toBe("[caesar] puella");
    });

    it("should transform proximity operators", () => {
      expect(transformQuery("puella ~5 puer")).toBe("puella 5~ puer");
    });

    it("should transform directed proximity operators", () => {
      expect(transformQuery("puella ~5> puer")).toBe("puella 5~> puer");
    });
  });

  describe("complex terms with logical operators", () => {
    it("should wrap unparenthesized 'and' terms in parentheses", () => {
      expect(transformQuery("puella and puer")).toBe("( puella and puer )");
    });

    it("should preserve existing parentheses", () => {
      expect(transformQuery("(puella and puer)")).toBe("( puella and puer )");
    });

    it("should handle multiple operators", () => {
      expect(transformQuery("puella or puer or amor")).toBe(
        "( puella or puer or amor )"
      );
    });
  });

  describe("complex scenarios", () => {
    it("should handle adjacent complex terms", () => {
      expect(transformQuery("puella and puer amor and bellum")).toBe(
        "( puella and puer ) ( amor and bellum )"
      );
    });

    it("should handle adjacent complex terms with missing close parentheses", () => {
      expect(transformQuery("puella and puer (amor and bellum")).toBe(
        "( puella and puer ) ( amor and bellum )"
      );
    });

    it("should handle complex terms with proximity", () => {
      expect(transformQuery("puella and puer ~5 amor")).toBe(
        "( puella and puer ) 5~ amor"
      );
    });

    it("should handle parenthesized term followed by simple term", () => {
      expect(transformQuery("(puella and puer) amor")).toBe(
        "( puella and puer ) amor"
      );
    });

    it("should handle simple term followed by parenthesized term", () => {
      expect(transformQuery("amor (puella and puer)")).toBe(
        "amor ( puella and puer )"
      );
    });

    it("should handle work filter with complex query", () => {
      expect(transformQuery("#caesar (puella and puer) ~5 amor")).toBe(
        "[caesar] ( puella and puer ) 5~ amor"
      );
    });

    it("should handle multiple parenthesized terms with proximity", () => {
      expect(transformQuery("(puella or puer) ~5 (amor and bellum)")).toBe(
        "( puella or puer ) 5~ ( amor and bellum )"
      );
    });

    it("should handle filters in complex terms", () => {
      expect(transformQuery("@lemma:amo and @case:genitive")).toBe(
        "( @lemma:amo and @case:genitive )"
      );
    });

    it("should handle mixed filters and words", () => {
      expect(transformQuery("puella and @lemma:puer ~3 @case:acc")).toBe(
        "( puella and @lemma:puer ) 3~ @case:acc"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty query", () => {
      expect(transformQuery("")).toBe("");
    });

    it("should return query as-is on parse error", () => {
      // Invalid query: 'and' at start
      expect(transformQuery("and puella")).toBe("and puella");
    });

    it("should handle proximity at different positions", () => {
      expect(transformQuery("puella ~5 puer ~3 amor")).toBe(
        "puella 5~ puer 3~ amor"
      );
    });
  });

  describe("canonicalization context", () => {
    const authors = ["Caesar", "Cicero"];
    const lemmaMap = new Map([
      ["fero", "fero"],
      ["Fero", "fero"],
      ["Caesar", "Caesar"],
      ["caesar", "Caesar"],
    ]);
    const canonicalLemma = (v: string) => lemmaMap.get(v);

    it("canonicalizes #author when authors are provided", () => {
      expect(transformQuery("#caesar amor", { authors })).toBe("[Caesar] amor");
    });

    it("leaves #author raw when no context is provided", () => {
      expect(transformQuery("#caesar amor")).toBe("[caesar] amor");
    });

    it("canonicalizes @lemma: and @l: values via canonicalLemma", () => {
      expect(transformQuery("@lemma:Fero", { canonicalLemma })).toBe(
        "@lemma:fero"
      );
      expect(transformQuery("@l:Fero", { canonicalLemma })).toBe("@l:fero");
    });

    it("preserves capitalized lemmata when canonicalLemma returns them", () => {
      expect(transformQuery("@lemma:Caesar", { canonicalLemma })).toBe(
        "@lemma:Caesar"
      );
      expect(transformQuery("@lemma:caesar", { canonicalLemma })).toBe(
        "@lemma:Caesar"
      );
    });

    it("keeps user spelling when canonicalLemma returns undefined", () => {
      expect(
        transformQuery("@lemma:Xyz", { canonicalLemma: () => undefined })
      ).toBe("@lemma:Xyz");
    });

    it("combines author, proximity, and lemma canonicalization in order", () => {
      expect(
        transformQuery("#caesar amor ~3> @lemma:Fero", {
          authors,
          canonicalLemma,
        })
      ).toBe("[Caesar] amor 3~> @lemma:fero");
    });
  });
});

describe("canonicalAuthor", () => {
  const authors = ["Caesar", "Cicero"];

  it("matches case-insensitively and prefers exact match", () => {
    expect(canonicalAuthor("caesar", authors)).toBe("Caesar");
    expect(canonicalAuthor("CAESAR", authors)).toBe("Caesar");
    expect(canonicalAuthor("Caesar", authors)).toBe("Caesar");
  });

  it("returns undefined for unknown authors", () => {
    expect(canonicalAuthor("Homer", authors)).toBeUndefined();
  });
});

describe("parseProximity", () => {
  it("defaults to 5 undirected", () => {
    expect(parseProximity("~")).toEqual({ distance: 5, directed: false });
  });

  it("parses distance and direction", () => {
    expect(parseProximity("~3>")).toEqual({ distance: 3, directed: true });
    expect(parseProximity("~>")).toEqual({ distance: 5, directed: true });
  });

  it("rejects out-of-range distances", () => {
    expect(parseProximity("~0")).toContain("1-15");
    expect(parseProximity("~16")).toContain("1-15");
  });

  it("rejects trailing junk", () => {
    expect(parseProximity("~3x")).toContain("expected ~, ~N, or ~N>");
  });
});

describe("errorsForToken", () => {
  const authors = ["Caesar", "Cicero"];

  it("accepts known authors case-insensitively", () => {
    expect(errorsForToken("#caesar", authors)).toEqual([]);
    expect(errorsForToken("#CAESAR", authors)).toEqual([]);
  });

  it("rejects unknown authors", () => {
    expect(errorsForToken("#Homer", authors)).toEqual([
      "invalid author #Homer",
    ]);
    expect(errorsForToken("#nobody", ["Caesar"])).toEqual([
      "invalid author #nobody",
    ]);
  });

  it("skips the author check without a list", () => {
    expect(errorsForToken("#Homer", undefined)).toEqual([]);
  });

  it("accepts long and short inflection forms and keywords", () => {
    expect(errorsForToken("@case:genitive", authors)).toEqual([]);
    expect(errorsForToken("@c:gen", authors)).toEqual([]);
    expect(errorsForToken("@l:amo", authors)).toEqual([]);
  });

  it("rejects bad keywords, values and shapes", () => {
    expect(errorsForToken("@foo:bar", authors)).toEqual([
      "invalid keyword @foo",
    ]);
    expect(errorsForToken("@case:locative", authors)[0]).toContain(
      "invalid option `locative`"
    );
    expect(errorsForToken("@case", authors)[0]).toContain("without `:value`");
    expect(errorsForToken("@lemma:", authors)[0]).toContain("without `:value`");
    expect(errorsForToken("case:gen", authors)[0]).toContain(
      "without @keyword"
    );
  });

  it("checks proximity tokens", () => {
    expect(errorsForToken("~20", authors)).toEqual([
      "range after ~ must be 1-15",
    ]);
  });
});

describe("validateQuery", () => {
  const authors = ["Caesar"];

  it("accepts valid queries", () => {
    expect(validateQuery("amor", authors)).toBeNull();
    expect(
      validateQuery("#Caesar @lemma:do and @case:dat ~3> hostis", authors)
    ).toBeNull();
  });

  it("reports structural errors first", () => {
    expect(validateQuery("and amor", authors)).toContain("not allowed");
    expect(validateQuery("amor #Caesar", authors)).toContain("at start");
  });

  it("reports token errors", () => {
    expect(validateQuery("#Homer amor", authors)).toBe("invalid author #Homer");
    expect(validateQuery("amor ~99 amo", authors)).toContain("1-15");
  });
});

describe("hasInflectionFilters", () => {
  it("detects @keyword:value filters", () => {
    expect(hasInflectionFilters("@case:gen amor")).toBe(true);
    expect(hasInflectionFilters("amor #Caesar")).toBe(false);
  });
});
