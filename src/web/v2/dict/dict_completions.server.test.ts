import {
  cleanCompletionQuery,
  getExpandedPrefixes,
  clusterAndDeduplicate,
  getV2Completions,
  findDictInfo,
  type CompletionsProvider,
} from "@/web/v2/dict/dict_completions.server";

describe("dict_completions.server", () => {
  describe("cleanCompletionQuery", () => {
    test("preserves leading hyphen for suffix search", () => {
      expect(cleanCompletionQuery("-arum")).toEqual({
        query: "-arum",
        isSuffix: true,
      });
      expect(cleanCompletionQuery("  -ibus  ")).toEqual({
        query: "-ibus",
        isSuffix: true,
      });
    });

    test("trims trailing punctuation on suffix search", () => {
      expect(cleanCompletionQuery('-arum,"')).toEqual({
        query: "-arum",
        isSuffix: true,
      });
    });

    test("returns empty query for isolated hyphen", () => {
      expect(cleanCompletionQuery("-")).toEqual({
        query: "",
        isSuffix: false,
      });
      expect(cleanCompletionQuery("  -  ")).toEqual({
        query: "",
        isSuffix: false,
      });
    });

    test("sanitizes standard prefix query", () => {
      expect(cleanCompletionQuery('  "amo,"  ')).toEqual({
        query: "amo",
        isSuffix: false,
      });
      expect(cleanCompletionQuery("habeo")).toEqual({
        query: "habeo",
        isSuffix: false,
      });
      expect(cleanCompletionQuery("")).toEqual({
        query: "",
        isSuffix: false,
      });
    });
  });

  describe("getExpandedPrefixes", () => {
    test("expands Latin u/v and i/j", () => {
      expect(getExpandedPrefixes("am", "La")).toEqual(["am"]);
      expect(getExpandedPrefixes("i", "La")).toEqual(["i", "j"]);
      expect(getExpandedPrefixes("u", "La")).toEqual(["u", "v"]);
      const ivst = getExpandedPrefixes("ivst", "La");
      expect(ivst).toContain("iust");
      expect(ivst).toContain("just");
      expect(ivst).toContain("ivst");
      expect(ivst).toContain("jvst");
    });

    test("expands German ß and ss", () => {
      const nuss = getExpandedPrefixes("nuss", "De");
      expect(nuss).toContain("nuss");
      expect(nuss).toContain("nuß");

      const nussSharp = getExpandedPrefixes("nuß", "De");
      expect(nussSharp).toContain("nuß");
      expect(nussSharp).toContain("nuss");
    });

    test("preserves non-Latin non-German languages verbatim", () => {
      expect(getExpandedPrefixes("have", "En")).toEqual(["have"]);
      expect(getExpandedPrefixes("haber", "Es")).toEqual(["haber"]);
    });
  });

  describe("findDictInfo", () => {
    test("finds dictionary by canonical key or alias", () => {
      expect(findDictInfo("L&S")?.key).toBe("L&S");
      expect(findDictInfo("ls")?.key).toBe("L&S");
      expect(findDictInfo("GAF")?.key).toBe("GAF");
      expect(findDictInfo("gaffiot")?.key).toBe("GAF");
      expect(findDictInfo("S&H")?.key).toBe("S&H");
      expect(findDictInfo("sh")?.key).toBe("S&H");
      expect(findDictInfo("GRG")?.key).toBe("GRG");
    });
  });

  describe("clusterAndDeduplicate", () => {
    test("merges compatible Latin vowel length variants and chooses Gaffiot as leader", () => {
      const candidates = [
        { dictKey: "L&S", lang: "La" as const, word: "abactio" },
        { dictKey: "GAF", lang: "La" as const, word: "ăbāctĭō" },
        { dictKey: "FOR", lang: "La" as const, word: "abactio" },
      ];
      const results = clusterAndDeduplicate(candidates);
      expect(results).toEqual([{ lang: "La", word: "ăbāctĭō" }]);
    });

    test("preserves distinct items for different languages", () => {
      const candidates = [
        { dictKey: "L&S", lang: "La" as const, word: "in" },
        { dictKey: "S&H", lang: "En" as const, word: "in" },
      ];
      const results = clusterAndDeduplicate(candidates);
      expect(results).toHaveLength(2);
      expect(results).toEqual(
        expect.arrayContaining([
          { lang: "La", word: "in" },
          { lang: "En", word: "in" },
        ])
      );
    });

    test("sorts results alphabetically and respects limit", () => {
      const candidates = [
        { dictKey: "L&S", lang: "La" as const, word: "caesar" },
        { dictKey: "L&S", lang: "La" as const, word: "amo" },
        { dictKey: "L&S", lang: "La" as const, word: "belli" },
      ];
      const results = clusterAndDeduplicate(candidates, 2);
      expect(results).toEqual([
        { lang: "La", word: "amo" },
        { lang: "La", word: "belli" },
      ]);
    });
  });

  describe("getV2Completions", () => {
    test("returns empty array immediately for Greek query without calling provider", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn(),
      };
      const results = await getV2Completions(mockProvider, {
        rawQuery: "λόγος",
        activeDictKeys: ["L&S", "GAF"],
      });
      expect(results).toEqual([]);
      expect(mockProvider.getCompletions).not.toHaveBeenCalled();
    });

    test("returns empty array for empty or punctuation-only query", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn(),
      };
      const results = await getV2Completions(mockProvider, {
        rawQuery: '  "-"  ',
        activeDictKeys: ["L&S"],
      });
      expect(results).toEqual([]);
      expect(mockProvider.getCompletions).not.toHaveBeenCalled();
    });

    test("dispatches suffix search directly to provider", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn().mockResolvedValue({
          "L&S": ["-arum", "luparum"],
        }),
      };
      const results = await getV2Completions(mockProvider, {
        rawQuery: "-arum",
        activeDictKeys: ["L&S"],
      });
      expect(mockProvider.getCompletions).toHaveBeenCalledWith({
        query: "-arum",
        dicts: ["L&S"],
      });
      expect(results).toEqual([
        { lang: "La", word: "-arum" },
        { lang: "La", word: "luparum" },
      ]);
    });

    test("expands orthographic prefixes for Latin and deduplicates results", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn().mockImplementation(async (req) => {
          if (req.query === "iust") {
            return { GAF: ["iūstus", "iūstitia"] };
          }
          if (req.query === "just") {
            return { "L&S": ["justus", "justitia"] };
          }
          return {};
        }),
      };

      const results = await getV2Completions(mockProvider, {
        rawQuery: "ivst",
        activeDictKeys: ["L&S", "GAF"],
      });

      // Should have queried expanded branches
      expect(mockProvider.getCompletions).toHaveBeenCalledWith(
        expect.objectContaining({ query: "iust" })
      );
      expect(mockProvider.getCompletions).toHaveBeenCalledWith(
        expect.objectContaining({ query: "just" })
      );

      // Results should contain both iūstus (Gaffiot leader for iustus) and justus
      expect(results).toContainEqual({ lang: "La", word: "iūstitia" });
      expect(results).toContainEqual({ lang: "La", word: "iūstus" });
      expect(results).toContainEqual({ lang: "La", word: "justitia" });
      expect(results).toContainEqual({ lang: "La", word: "justus" });
    });

    test("partitions queries by dictionary language (e.g. Latin and German)", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn().mockImplementation(async (req) => {
          if (req.dicts.includes("GRG")) {
            return { GRG: ["nuss", "nuß"] };
          }
          return {};
        }),
      };

      const results = await getV2Completions(mockProvider, {
        rawQuery: "nuss",
        activeDictKeys: ["L&S", "GRG"],
      });

      expect(results).toContainEqual({ lang: "De", word: "nuß" });
    });
  });
});
