import {
  findDictInfo,
  getDictSourceLang,
  getExpandedPrefixes,
  clusterAndDeduplicate,
  filterAndClusterDictionaryChunks,
  type Candidate,
} from "@/web/v2/dict/dict_clustering.common";

describe("dict_clustering.common", () => {
  describe("findDictInfo", () => {
    test("resolves canonical keys and aliases", () => {
      expect(findDictInfo("L&S")?.key).toBe("L&S");
      expect(findDictInfo("ls")?.key).toBe("L&S");
      expect(findDictInfo("GAF")?.key).toBe("GAF");
      expect(findDictInfo("gaffiot")?.key).toBe("GAF");
      expect(findDictInfo("S&H")?.key).toBe("S&H");
      expect(findDictInfo("sh")?.key).toBe("S&H");
      expect(findDictInfo("R&A")?.key).toBe("R&A");
      expect(findDictInfo("ra")?.key).toBe("R&A");
      expect(findDictInfo("GRG")?.key).toBe("GRG");
      expect(findDictInfo("georges")?.key).toBe("GRG");
      expect(findDictInfo("EGL")?.key).toBe("EGL");
      expect(findDictInfo("pozo")?.key).toBe("EGL");
      expect(findDictInfo("GES")?.key).toBe("GES");
      expect(findDictInfo("gesner")?.key).toBe("GES");
      expect(findDictInfo("FOR")?.key).toBe("FOR");
      expect(findDictInfo("forcellini")?.key).toBe("FOR");
      expect(findDictInfo("NUM")?.key).toBe("NUM");
      expect(findDictInfo("numeral")?.key).toBe("NUM");
      expect(findDictInfo("unknown_dict")).toBeUndefined();
    });
  });

  describe("getDictSourceLang", () => {
    test("returns correct source language per lexicon", () => {
      expect(getDictSourceLang("L&S")).toBe("La");
      expect(getDictSourceLang("GAF")).toBe("La");
      expect(getDictSourceLang("FOR")).toBe("La");
      expect(getDictSourceLang("GES")).toBe("La");
      expect(getDictSourceLang("S&H")).toBe("En");
      expect(getDictSourceLang("R&A")).toBe("En");
      expect(getDictSourceLang("GRG")).toBe("De");
      expect(getDictSourceLang("EGL")).toBe("Es");
      expect(getDictSourceLang("NUM")).toBe("La"); // wildcard fallback to La
      expect(getDictSourceLang("unknown")).toBe("La");
    });
  });

  describe("getExpandedPrefixes", () => {
    test("expands Latin u/v and i/j", () => {
      expect(getExpandedPrefixes("am", "La")).toEqual(["am"]);
      expect(getExpandedPrefixes("i", "La")).toEqual(["i", "j"]);
      expect(getExpandedPrefixes("u", "La")).toEqual(["u", "v"]);
      const expanded = getExpandedPrefixes("iust", "La");
      expect(expanded).toContain("iust");
      expect(expanded).toContain("just");
      expect(expanded).toContain("ivst");
      expect(expanded).toContain("jvst");
    });

    test("expands German ß and ss", () => {
      const nuss = getExpandedPrefixes("nuss", "De");
      expect(nuss).toContain("nuss");
      expect(nuss).toContain("nuß");

      const nussSharp = getExpandedPrefixes("nuß", "De");
      expect(nussSharp).toContain("nuß");
      expect(nussSharp).toContain("nuss");
    });

    test("leaves English and Spanish unchanged", () => {
      expect(getExpandedPrefixes("love", "En")).toEqual(["love"]);
      expect(getExpandedPrefixes("amor", "Es")).toEqual(["amor"]);
    });
  });

  describe("clusterAndDeduplicate", () => {
    test("returns empty array for empty candidates or zero limit", () => {
      expect(clusterAndDeduplicate([])).toEqual([]);
      expect(
        clusterAndDeduplicate([{ dictKey: "L&S", lang: "La", word: "amo" }], 0)
      ).toEqual([]);
    });

    test("clusters vowel-length variants and picks Gaffiot as canonical leader", () => {
      const candidates: Candidate[] = [
        { dictKey: "L&S", lang: "La", word: "abactio" },
        { dictKey: "FOR", lang: "La", word: "abactio" },
        { dictKey: "GAF", lang: "La", word: "ăbāctĭō" },
      ];
      const results = clusterAndDeduplicate(candidates, 10);
      expect(results).toEqual([{ lang: "La", word: "ăbāctĭō" }]);
    });

    test("keeps separate distinct items for different source languages", () => {
      const candidates: Candidate[] = [
        { dictKey: "L&S", lang: "La", word: "in" },
        { dictKey: "S&H", lang: "En", word: "in" },
      ];
      const results = clusterAndDeduplicate(candidates, 10);
      expect(results).toHaveLength(2);
      expect(results).toEqual(
        expect.arrayContaining([
          { lang: "La", word: "in" },
          { lang: "En", word: "in" },
        ])
      );
    });

    test("stops early once limit is reached and preserves alphabetical order", () => {
      const candidates: Candidate[] = [
        { dictKey: "L&S", lang: "La", word: "coactio" },
        { dictKey: "L&S", lang: "La", word: "coactor" },
        { dictKey: "L&S", lang: "La", word: "coactus" },
        { dictKey: "L&S", lang: "La", word: "coacervatio" },
        { dictKey: "L&S", lang: "La", word: "coacervo" },
      ];
      const results = clusterAndDeduplicate(candidates, 3);
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.word)).toEqual([
        "coacervatio",
        "coacervo",
        "coactio",
      ]);
    });
  });

  describe("filterAndClusterDictionaryChunks", () => {
    test("returns empty array for empty query or empty chunks", () => {
      expect(filterAndClusterDictionaryChunks({}, ["L&S"], "am")).toEqual([]);
      expect(
        filterAndClusterDictionaryChunks(
          { "L&S": ["amo", "amor"] },
          ["L&S"],
          "   "
        )
      ).toEqual([]);
    });

    test("filters words matching query prefix and clusters across dictionaries", () => {
      const dictChunks = {
        "L&S": ["amabilis", "amator", "amicitia", "amo", "amor"],
        GAF: ["ămābĭlis", "ămātŏr", "ămīcĭtĭa", "ămō", "ămŏr"],
        FOR: ["amabilis", "amator", "amicitia", "amo", "amor"],
      };

      // Query "amo" should match "amo" and "amor"
      const results = filterAndClusterDictionaryChunks(
        dictChunks,
        ["L&S", "GAF"],
        "amo",
        10
      );

      // Gaffiot leader preferred
      expect(results).toEqual([
        { lang: "La", word: "ămō" },
        { lang: "La", word: "ămŏr" },
      ]);
    });

    test("respects active dictionary filtering", () => {
      const dictChunks = {
        "L&S": ["amator"],
        GAF: ["ămātŏr"],
        FOR: ["amicitia"],
      };

      // If only FOR is active
      const results = filterAndClusterDictionaryChunks(
        dictChunks,
        ["FOR"],
        "am",
        10
      );
      expect(results).toEqual([{ lang: "La", word: "amicitia" }]);
    });

    test("handles orthographic expansions when matching Latin prefixes", () => {
      const dictChunks = {
        "L&S": ["justus", "justitia"],
        GAF: ["iūstus", "iūstitia"],
      };

      // Query with "ivst" should match both "just" and "iust"
      const results = filterAndClusterDictionaryChunks(
        dictChunks,
        ["L&S", "GAF"],
        "ivst",
        10
      );

      // Both i-forms and j-forms should be present as valid spelling variants
      expect(results).toContainEqual({ lang: "La", word: "iūstitia" });
      expect(results).toContainEqual({ lang: "La", word: "iūstus" });
      expect(results).toContainEqual({ lang: "La", word: "justitia" });
      expect(results).toContainEqual({ lang: "La", word: "justus" });
    });
  });
});
