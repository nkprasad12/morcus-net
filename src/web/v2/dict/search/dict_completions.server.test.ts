import { cleanCompletionQuery } from "@/web/v2/dict/search/dict_completions.common";
import {
  getV2Completions,
  getV2DictChunks,
  type CompletionsProvider,
} from "@/web/v2/dict/search/dict_completions.server";

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

    test("returns empty array for non-suffix queries (prefix searches use getV2DictChunks)", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn(),
      };
      const results = await getV2Completions(mockProvider, {
        rawQuery: "amo",
        activeDictKeys: ["L&S", "GAF"],
      });
      expect(results).toEqual([]);
      expect(mockProvider.getCompletions).not.toHaveBeenCalled();
    });
  });

  describe("getV2DictChunks", () => {
    test("returns empty object for Greek query or empty prefix", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn(),
      };
      const resGreek = await getV2DictChunks(mockProvider, {
        rawPrefix: "λόγος",
      });
      expect(resGreek).toEqual({});

      const resEmpty = await getV2DictChunks(mockProvider, {
        rawPrefix: "  ",
      });
      expect(resEmpty).toEqual({});
      expect(mockProvider.getCompletions).not.toHaveBeenCalled();
    });

    test("returns empty object for suffix queries", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn(),
      };
      const res = await getV2DictChunks(mockProvider, {
        rawPrefix: "-arum",
      });
      expect(res).toEqual({});
      expect(mockProvider.getCompletions).not.toHaveBeenCalled();
    });

    test("returns dictionary map of sorted words and expands prefixes", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn().mockImplementation(async (req) => {
          if (req.query === "am" && req.dicts.includes("L&S")) {
            return {
              "L&S": ["amor", "amabilis", "amator"],
              GAF: ["ămō", "ămātŏr"],
            };
          }
          return {};
        }),
      };

      const res = await getV2DictChunks(mockProvider, {
        rawPrefix: "am",
      });

      expect(res).toEqual({
        "L&S": ["amabilis", "amator", "amor"],
        GAF: ["ămātŏr", "ămō"],
      });
    });

    test("expands orthographic variants across dictionaries", async () => {
      const mockProvider: CompletionsProvider = {
        getCompletions: jest.fn().mockImplementation(async (req) => {
          if (req.query === "iust") {
            return { GAF: ["iūstus"] };
          }
          if (req.query === "just") {
            return { "L&S": ["justus"] };
          }
          return {};
        }),
      };

      const res = await getV2DictChunks(mockProvider, {
        rawPrefix: "ivst",
      });

      expect(res).toEqual({
        GAF: ["iūstus"],
        "L&S": ["justus"],
      });
    });
  });
});
