import {
  parseDictKeys,
  parseDictsFromCookie,
  formatDictsCookie,
  formatDictsParam,
  resolveActiveDicts,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/dict_selection.server";

describe("dict_selection.server", () => {
  describe("parseDictKeys", () => {
    it("parses comma-separated keys", () => {
      expect(parseDictKeys("L&S,GAF,NUM")).toEqual(["L&S", "GAF", "NUM"]);
    });

    it("parses hyphen-separated keys with unaliasing LnS -> L&S", () => {
      expect(parseDictKeys("LnS-SnH-GAF")).toEqual(["L&S", "S&H", "GAF"]);
    });

    it("parses lowercase aliases", () => {
      expect(parseDictKeys("ls,sh,gaffiot,georges,pozo")).toEqual([
        "L&S",
        "S&H",
        "GAF",
        "GRG",
        "EGL",
      ]);
    });

    it("parses array of strings from repeated query parameters", () => {
      expect(parseDictKeys(["ls", "gaffiot"])).toEqual(["L&S", "GAF"]);
    });

    it("parses Base36 bitmask strings", () => {
      expect(parseDictKeys("3")).toEqual(["L&S", "GAF"]);
      expect(parseDictKeys("e7")).toEqual([
        "L&S",
        "GAF",
        "GES",
        "FOR",
        "S&H",
        "R&A",
        "GRG",
        "EGL",
        "NUM",
      ]);
    });

    it("returns null for empty or invalid input", () => {
      expect(parseDictKeys("")).toBeNull();
      expect(parseDictKeys(undefined)).toBeNull();
      expect(parseDictKeys("unknown,invalid")).toBeNull();
    });
  });

  describe("parseDictsFromCookie", () => {
    it("extracts morcus_dicts from cookie header", () => {
      const cookie = "foo=bar; morcus_dicts=L%26S%3BGAF; other=baz";
      expect(parseDictsFromCookie(cookie)).toEqual(["L&S", "GAF"]);
    });

    it("returns null when morcus_dicts is absent", () => {
      expect(parseDictsFromCookie("foo=bar; test=123")).toBeNull();
      expect(parseDictsFromCookie(undefined)).toBeNull();
    });
  });

  describe("formatDictsCookie & formatDictsParam", () => {
    it("formats cookie header string correctly", () => {
      const header = formatDictsCookie(["L&S", "GAF"]);
      expect(header).toContain("morcus_dicts=L%26S%3BGAF;");
      expect(header).toContain("Path=/;");
      expect(header).toContain("SameSite=Lax");
    });

    it("formats URL param using hyphen and n alias", () => {
      expect(formatDictsParam(["L&S", "S&H", "GAF"])).toBe("LnS-SnH-GAF");
    });
  });

  describe("resolveActiveDicts", () => {
    it("prefers URL parameter over cookie and default", () => {
      const res = resolveActiveDicts({
        urlParam: "gaffiot",
        cookieHeader: "morcus_dicts=L%26S",
      });
      expect(res.source).toBe("url");
      expect(res.dictKeys).toEqual(["GAF"]);
    });

    it("falls back to cookie if URL parameter is absent", () => {
      const res = resolveActiveDicts({
        cookieHeader: "morcus_dicts=L%26S%3BGAF",
      });
      expect(res.source).toBe("cookie");
      expect(res.dictKeys).toEqual(["L&S", "GAF"]);
    });

    it("falls back to default preset if both are absent", () => {
      const res = resolveActiveDicts({});
      expect(res.source).toBe("default");
      expect(res.dictKeys).toEqual(DEFAULT_DICT_KEYS);
    });

    it("filters by source language (e.g. lang=La)", () => {
      const res = resolveActiveDicts({
        urlParam: "ls,sh,gaffiot,numeral",
        lang: "La",
      });
      // L&S (La->En), GAF (La->Fr), NUM (*->*) match. S&H (En->La) is filtered out.
      expect(res.dictKeys).toEqual(["L&S", "GAF", "NUM"]);
    });

    it("applies lang=La to default dictionaries, retaining only Latin-source lexica", () => {
      const res = resolveActiveDicts({ lang: "La" });
      expect(res.source).toBe("default");
      // Default 8 enabled: L&S, GAF, GES, FOR, S&H, R&A, GRG, NUM.
      // Filtered with lang=La removes reverse dicts (S&H, R&A, GRG):
      expect(res.dictKeys).toEqual(["L&S", "GAF", "GES", "FOR", "NUM"]);
    });

    it("applies lang=La while respecting user's custom cookie preferences", () => {
      // User has explicitly enabled only L&S, GES, S&H, and GRG in cookies (Gaffiot disabled)
      const res = resolveActiveDicts({
        cookieHeader: "morcus_dicts=L%26S%3BGES%3BS%26H%3BGRG",
        lang: "La",
      });
      expect(res.source).toBe("cookie");
      // Only L&S and GES match from="La"; S&H and GRG dropped; GAF not present in cookie
      expect(res.dictKeys).toEqual(["L&S", "GES"]);
    });
  });
});
