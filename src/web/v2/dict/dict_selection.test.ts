import {
  parseDictsFromCookie,
  formatDictsCookie,
  resolveActiveDicts,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/dict_selection.server";

describe("dict_selection.server", () => {
  describe("parseDictsFromCookie", () => {
    it("decodes the morcus_d bitmask from the cookie header", () => {
      // L&S (1) | GAF (2) = 3
      const cookie = "foo=bar; morcus_d=3; other=baz";
      expect(parseDictsFromCookie(cookie)).toEqual(["L&S", "GAF"]);
    });

    it("returns null when morcus_d is absent", () => {
      expect(parseDictsFromCookie("foo=bar; test=123")).toBeNull();
      expect(parseDictsFromCookie(undefined)).toBeNull();
    });

    it("ignores the old morcus_dicts cookie", () => {
      expect(parseDictsFromCookie("morcus_dicts=L%26S%3BGAF")).toBeNull();
    });

    it("rejects non-canonical values instead of misreading them", () => {
      // parseInt("L&S;GAF", 36) would read "l" = 21: L&S + GES + S&H.
      expect(parseDictsFromCookie("morcus_d=L%26S%3BGAF")).toBeNull();
      expect(parseDictsFromCookie("morcus_d=GAF")).toBeNull();
      expect(parseDictsFromCookie("morcus_d=0")).toBeNull();
    });
  });

  describe("formatDictsCookie", () => {
    it("writes the canonical bitmask", () => {
      const header = formatDictsCookie(["L&S", "GAF"]);
      expect(header).toContain("morcus_d=3;");
      expect(header).toContain("Path=/;");
      expect(header).toContain("SameSite=Lax");
    });

    it("round-trips through parseDictsFromCookie", () => {
      const keys = ["L&S", "S&H", "GRG", "NUM"];
      const pair = formatDictsCookie(keys).split(";")[0];
      expect(parseDictsFromCookie(pair)).toEqual(keys);
    });
  });

  describe("resolveActiveDicts", () => {
    it("prefers keys resolved from the query over cookie and default", () => {
      const res = resolveActiveDicts({
        keysFromQuery: ["GAF"],
        cookieHeader: "morcus_d=1",
      });
      expect(res.dictKeys).toEqual(["GAF"]);
    });

    it("falls back to cookie if the query resolved nothing", () => {
      const res = resolveActiveDicts({
        keysFromQuery: null,
        cookieHeader: "morcus_d=3",
      });
      expect(res.dictKeys).toEqual(["L&S", "GAF"]);
    });

    it("resolves a single-dictionary cookie exactly", () => {
      const res = resolveActiveDicts({ cookieHeader: "morcus_d=2" });
      expect(res.dictKeys).toEqual(["GAF"]);
    });

    it("falls back to default preset if both are absent", () => {
      const res = resolveActiveDicts({});
      expect(res.dictKeys).toEqual(DEFAULT_DICT_KEYS);
    });

    it("filters by source language (e.g. lang=La)", () => {
      const res = resolveActiveDicts({
        keysFromQuery: ["L&S", "S&H", "GAF", "NUM"],
        lang: "La",
      });
      // L&S (La->En), GAF (La->Fr), NUM (*->*) match. S&H (En->La) is filtered out.
      expect(res.dictKeys).toEqual(["L&S", "GAF", "NUM"]);
    });

    it("applies lang=La to default dictionaries, retaining only Latin-source lexica", () => {
      const res = resolveActiveDicts({ lang: "La" });
      // Default 8 enabled: L&S, GAF, GES, FOR, S&H, R&A, GRG, NUM.
      // Filtered with lang=La removes reverse dicts (S&H, R&A, GRG):
      expect(res.dictKeys).toEqual(["L&S", "GAF", "GES", "FOR", "NUM"]);
    });

    it("applies lang=La while respecting user's custom cookie preferences", () => {
      // User has explicitly enabled only L&S, GES, S&H, and GRG (1 + 4 + 16 + 64 = 85 = "2d")
      const res = resolveActiveDicts({
        cookieHeader: "morcus_d=2d",
        lang: "La",
      });
      // Only L&S and GES match from="La"; S&H and GRG dropped; GAF not present in cookie
      expect(res.dictKeys).toEqual(["L&S", "GES"]);
    });

    it("falls back to in-scope defaults when the cookie contains only out-of-scope dictionaries", () => {
      // S&H (16 = "g") is En -> La, so filtering by lang=La would leave 0 dictionaries.
      const res = resolveActiveDicts({
        cookieHeader: "morcus_d=g",
        lang: "La",
      });
      expect(res.dictKeys).toEqual(["L&S", "GAF", "GES", "FOR", "NUM"]);
    });
  });
});
