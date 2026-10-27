import {
  getDictSourceLang,
  foldOrthography,
  clusterAndDeduplicate,
  filterAndClusterDictionaryChunks,
  type Candidate,
} from "@/web/ui/dict/search/dict_clustering.common";

describe("dict_clustering.common", () => {
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

  describe("foldOrthography", () => {
    test("folds Latin v -> u and j -> i", () => {
      expect(foldOrthography("iustus", "La")).toBe("iustus");
      expect(foldOrthography("justus", "La")).toBe("iustus");
      expect(foldOrthography("jvstvs", "La")).toBe("iustus");
      expect(foldOrthography("vir", "La")).toBe("uir");
    });

    test("folds German ß -> ss", () => {
      expect(foldOrthography("nuß", "De")).toBe("nuss");
      expect(foldOrthography("nuss", "De")).toBe("nuss");
      expect(foldOrthography("vjß", "De")).toBe("vjss");
    });

    test("leaves English and Spanish unchanged", () => {
      expect(foldOrthography("love", "En")).toBe("love");
      expect(foldOrthography("viaje", "Es")).toBe("viaje");
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
    test("matches German ß, ss, and partial eszett prefixes", () => {
      const chunks = { GRG: ["nuß", "nus", "nusflicht", "nußbaum"] };
      for (const q of ["nuß", "nuss"]) {
        expect(
          filterAndClusterDictionaryChunks(chunks, ["GRG"], q).map(
            (r) => r.word
          )
        ).toEqual(["nuß", "nußbaum"]);
      }
      expect(
        filterAndClusterDictionaryChunks(chunks, ["GRG"], "nus").map(
          (r) => r.word
        )
      ).toEqual(["nus", "nusflicht", "nuß", "nußbaum"]);
    });

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

    test("folds macrons, breves (NFC and NFD), and uppercase in query prefixes", () => {
      const dictChunks = {
        "L&S": ["amo", "amor", "fero", "rex"],
      };

      for (const query of ["amō", "ămo", "a\u0306mo", "AMŌ"]) {
        expect(
          filterAndClusterDictionaryChunks(dictChunks, ["L&S"], query)
        ).toEqual([
          { lang: "La", word: "amo" },
          { lang: "La", word: "amor" },
        ]);
      }

      expect(
        filterAndClusterDictionaryChunks(dictChunks, ["L&S"], "ferō")
      ).toEqual([{ lang: "La", word: "fero" }]);
      expect(
        filterAndClusterDictionaryChunks(dictChunks, ["L&S"], "rēx")
      ).toEqual([{ lang: "La", word: "rex" }]);
    });
  });
});
