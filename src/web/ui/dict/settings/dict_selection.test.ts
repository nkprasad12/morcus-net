import type { Request } from "express";
import { DEFAULT_DICT_KEYS } from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  dictParamsFromQuery,
  resolveActiveDicts,
} from "@/web/ui/dict/settings/dict_selection.server";

describe("dict_selection.server", () => {
  describe("dictParamsFromQuery", () => {
    it("extracts dict, d, and in parameters", () => {
      const req = {
        query: {
          d: "3",
          dict: ["L&S", "GAF"],
          in: "LnS",
        },
      } as unknown as Request;
      expect(dictParamsFromQuery(req)).toEqual({
        bitmaskParam: "3",
        dictParam: ["L&S", "GAF"],
        inParam: "LnS",
      });
    });

    it("takes the last value when d is an array", () => {
      const req = {
        query: {
          d: ["1", "3"],
        },
      } as unknown as Request;
      expect(dictParamsFromQuery(req)).toEqual({
        bitmaskParam: "3",
        dictParam: undefined,
        inParam: undefined,
      });
    });

    it("handles missing dictionary query parameters gracefully", () => {
      const req = { query: {} } as unknown as Request;
      expect(dictParamsFromQuery(req)).toEqual({
        bitmaskParam: null,
        dictParam: undefined,
        inParam: undefined,
      });
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
