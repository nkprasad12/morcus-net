import {
  parseDictsFromCookie,
  formatDictsCookie,
  formatDictsParam,
  readCookie,
  resolveActiveDicts,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/dict_selection.server";

describe("dict_selection.server", () => {
  describe("readCookie", () => {
    it("reads and decodes a named cookie", () => {
      expect(
        readCookie("foo=bar; morcus_inflected=0", "morcus_inflected")
      ).toBe("0");
      expect(readCookie("morcus_dicts=L%26S%3BGAF", "morcus_dicts")).toBe(
        "L&S;GAF"
      );
    });

    it("does not match a name embedded in another cookie's value", () => {
      expect(
        readCookie("other=morcus_inflected=0", "morcus_inflected")
      ).toBeNull();
      expect(readCookie(undefined, "morcus_inflected")).toBeNull();
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
