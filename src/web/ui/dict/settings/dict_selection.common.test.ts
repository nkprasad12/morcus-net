import {
  findDictInfo,
  parseDictKeys,
  resolveDictParams,
  parseInflectionParam,
  formatDictsCookie,
  formatInflectedCookie,
  parseDictsFromCookie,
  readSavedDictPrefs,
  isGuestView,
  filterDictsByLang,
  filterKeysByLang,
  mergeDictKeysForSave,
} from "@/web/ui/dict/settings/dict_selection.common";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

describe("dict_selection.common", () => {
  describe("findDictInfo", () => {
    it("resolves canonical keys and V1 URL-safe forms case-insensitively", () => {
      expect(findDictInfo("L&S")?.key).toBe("L&S");
      expect(findDictInfo("l&s")?.key).toBe("L&S");
      expect(findDictInfo("LnS")?.key).toBe("L&S");
      expect(findDictInfo("lns")?.key).toBe("L&S");
      expect(findDictInfo("GAF")?.key).toBe("GAF");
      expect(findDictInfo("gaf")?.key).toBe("GAF");
      expect(findDictInfo("S&H")?.key).toBe("S&H");
      expect(findDictInfo("SnH")?.key).toBe("S&H");
      expect(findDictInfo("R&A")?.key).toBe("R&A");
      expect(findDictInfo("RnA")?.key).toBe("R&A");
      expect(findDictInfo("GRG")?.key).toBe("GRG");
      expect(findDictInfo("EGL")?.key).toBe("EGL");
      expect(findDictInfo("GES")?.key).toBe("GES");
      expect(findDictInfo("FOR")?.key).toBe("FOR");
      expect(findDictInfo("NUM")?.key).toBe("NUM");
      expect(findDictInfo("unknown_dict")).toBeUndefined();
    });
  });

  describe("readSavedDictPrefs", () => {
    it("reads both dictionary and inflection cookies in a single pass", () => {
      expect(readSavedDictPrefs("morcus_d=3; morcus_inflected=0")).toEqual({
        dicts: ["L&S", "GAF"],
        inflected: false,
      });
      expect(readSavedDictPrefs(undefined)).toEqual({
        dicts: null,
        inflected: undefined,
      });
    });
  });

  describe("parseDictKeys", () => {
    it("parses comma-separated keys", () => {
      expect(parseDictKeys("L&S,GAF,NUM")).toEqual(["L&S", "GAF", "NUM"]);
    });

    it("parses hyphen-separated keys with unaliasing LnS -> L&S", () => {
      expect(parseDictKeys("LnS-SnH-GAF")).toEqual(["L&S", "S&H", "GAF"]);
    });

    it("parses lowercase canonical and V1 URL-safe keys", () => {
      expect(parseDictKeys("lns,snh,gaf,grg,egl")).toEqual([
        "L&S",
        "S&H",
        "GAF",
        "GRG",
        "EGL",
      ]);
    });

    it("parses array of strings from repeated query parameters", () => {
      expect(parseDictKeys(["L&S", "GAF"])).toEqual(["L&S", "GAF"]);
    });

    it("splits delimited lists inside array entries", () => {
      // URLSearchParams.getAll("dict") yields ["L&S,GAF"] for ?dict=L%26S,GAF
      expect(parseDictKeys(["L&S,GAF"])).toEqual(["L&S", "GAF"]);
      expect(parseDictKeys(["LnS-SnH", "GAF"])).toEqual(["L&S", "S&H", "GAF"]);
    });

    it.each([
      ["GAF", "GAF"],
      ["GRG", "GRG"],
      ["FOR", "FOR"],
      ["GES", "GES"],
      ["NUM", "NUM"],
      ["EGL", "EGL"],
      ["L&S", "L&S"],
      ["S&H", "S&H"],
      ["R&A", "R&A"],
      ["LnS", "L&S"],
      ["SnH", "S&H"],
      ["RnA", "R&A"],
    ])("resolves the single key %s without base36 corruption", (raw, key) => {
      expect(parseDictKeys(raw)).toEqual([key]);
    });

    it("does not interpret base36 bitmasks", () => {
      // "3" would decode to ["L&S", "GAF"] as a bitmask; only ?d= may mean that.
      expect(parseDictKeys("3")).toBeNull();
      expect(parseDictKeys("e7")).toBeNull();
    });

    it("returns null for empty or invalid input", () => {
      expect(parseDictKeys("")).toBeNull();
      expect(parseDictKeys(undefined)).toBeNull();
      expect(parseDictKeys("unknown,invalid")).toBeNull();
    });
  });

  describe("parseInflectionParam", () => {
    it("parses scalar values", () => {
      expect(parseInflectionParam("1")).toBe(true);
      expect(parseInflectionParam("true")).toBe(true);
      expect(parseInflectionParam("0")).toBe(false);
      expect(parseInflectionParam("false")).toBe(false);
    });

    it("treats a checked No-JS checkbox (hidden 0 + checkbox 1) as enabled", () => {
      expect(parseInflectionParam(["0", "1"])).toBe(true);
      expect(parseInflectionParam(["1", "0"])).toBe(true);
    });

    it("treats an unchecked No-JS checkbox (hidden 0 only) as disabled", () => {
      expect(parseInflectionParam(["0"])).toBe(false);
    });

    it("returns undefined when absent or unrecognized", () => {
      expect(parseInflectionParam(undefined)).toBeUndefined();
      expect(parseInflectionParam(null)).toBeUndefined();
      expect(parseInflectionParam([])).toBeUndefined();
      expect(parseInflectionParam("")).toBeUndefined();
      expect(parseInflectionParam("banana")).toBeUndefined();
    });
  });

  describe("resolveDictParams", () => {
    it("prefers explicit checkboxes over a stale bitmask", () => {
      expect(
        resolveDictParams({ dictParam: ["GAF"], bitmaskParam: "an" })
      ).toEqual(["GAF"]);
    });

    it("decodes the bitmask when no checkboxes were submitted", () => {
      expect(resolveDictParams({ bitmaskParam: "3" })).toEqual(["L&S", "GAF"]);
    });

    it("falls back to the legacy in parameter last", () => {
      expect(resolveDictParams({ inParam: "LnS-SnH" })).toEqual(["L&S", "S&H"]);
    });

    it("returns null when nothing was supplied", () => {
      expect(resolveDictParams({})).toBeNull();
      expect(resolveDictParams({ dictParam: [], inParam: [] })).toBeNull();
      expect(resolveDictParams({ dictParam: "nonsense" })).toBeNull();
    });
  });

  describe("formatDictsCookie & formatInflectedCookie", () => {
    it("formats the dictionary cookie as the bitmask, with attributes", () => {
      const cookie = formatDictsCookie(["L&S", "GAF"]);
      expect(cookie).toContain("morcus_d=3;");
      expect(cookie).toContain("Path=/;");
      expect(cookie).toContain("Max-Age=31536000;");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("round-trips through parseDictsFromCookie", () => {
      const keys = ["L&S", "S&H", "GRG", "NUM"];
      const pair = formatDictsCookie(keys).split(";")[0];
      expect(parseDictsFromCookie(pair)).toEqual(keys);
    });

    it("formats morcus_inflected cookie correctly", () => {
      expect(formatInflectedCookie(true)).toBe(
        "morcus_inflected=1; Path=/; Max-Age=31536000; SameSite=Lax"
      );
      expect(formatInflectedCookie(false)).toBe(
        "morcus_inflected=0; Path=/; Max-Age=31536000; SameSite=Lax"
      );
    });
  });

  describe("parseDictsFromCookie", () => {
    it("extracts and decodes the bitmask from a cookie string", () => {
      const header = "foo=bar; morcus_d=3; other=baz";
      expect(parseDictsFromCookie(header)).toEqual(["L&S", "GAF"]);
    });

    it("returns null when cookie header is missing or does not have the cookie", () => {
      expect(parseDictsFromCookie(undefined)).toBeNull();
      expect(parseDictsFromCookie("other=123")).toBeNull();
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

  describe("isGuestView", () => {
    const LS_GAF = { dictKeys: ["L&S", "GAF"], isInflected: true };

    test("is never a guest without saved preferences", () => {
      expect(isGuestView(LS_GAF, undefined)).toBe(false);
      expect(isGuestView(LS_GAF, "other=1")).toBe(false);
    });

    test("compares the dictionary set, ignoring order", () => {
      expect(isGuestView(LS_GAF, "morcus_d=3")).toBe(false);
      expect(
        isGuestView({ ...LS_GAF, dictKeys: ["GAF", "L&S"] }, "morcus_d=3")
      ).toBe(false);
      expect(isGuestView(LS_GAF, "morcus_d=1")).toBe(true);
      expect(isGuestView(LS_GAF, "morcus_d=7")).toBe(true);
    });

    test("compares inflection only when it is saved", () => {
      const exact = { ...LS_GAF, isInflected: false };
      expect(isGuestView(exact, "morcus_inflected=0")).toBe(false);
      expect(isGuestView(exact, "morcus_inflected=1")).toBe(true);
      // An unsaved inflection preference can't be diverged from.
      expect(isGuestView(exact, "morcus_d=3")).toBe(false);
    });

    test("either mismatch is enough", () => {
      expect(isGuestView(LS_GAF, "morcus_d=3; morcus_inflected=0")).toBe(true);
    });

    test("ignores invalid cookie values", () => {
      expect(isGuestView(LS_GAF, "morcus_d=L%26S")).toBe(false);
      expect(isGuestView(LS_GAF, "morcus_inflected=yes")).toBe(false);
    });
  });
});

describe("lang scoping and masked save", () => {
  const FROM_LATIN = ["L&S", "GAF", "GES", "FOR", "NUM"];
  const TO_LATIN = ["S&H", "R&A", "GRG", "EGL"];
  const keysOf = (dicts: { key: string }[]) => dicts.map((d) => d.key);

  describe("filterDictsByLang", () => {
    it("keeps the dictionaries from that language plus the wildcard ones", () => {
      expect(
        new Set(keysOf(filterDictsByLang(LatinDict.AVAILABLE, "La")))
      ).toEqual(new Set(FROM_LATIN));
    });

    it("accepts several languages", () => {
      expect(
        new Set(keysOf(filterDictsByLang(LatinDict.AVAILABLE, ["De", "Es"])))
      ).toEqual(new Set(["GRG", "EGL", "NUM"]));
    });

    it.each([[undefined], [null], [""], [[]]])(
      "returns every dictionary for no scope (%p)",
      (lang) => {
        expect(keysOf(filterDictsByLang(LatinDict.AVAILABLE, lang))).toEqual(
          keysOf(LatinDict.AVAILABLE)
        );
      }
    );
  });

  describe("filterKeysByLang", () => {
    it("filters keys by source language, keeping wildcard ones", () => {
      expect(filterKeysByLang(["S&H", "L&S", "NUM", "GRG"], "La")).toEqual([
        "L&S",
        "NUM",
      ]);
      expect(filterKeysByLang(["S&H", "L&S", "GRG"], ["En", "De"])).toEqual([
        "S&H",
        "GRG",
      ]);
    });

    it("drops unknown keys, with or without a scope", () => {
      expect(filterKeysByLang(["L&S", "nope"], "La")).toEqual(["L&S"]);
      expect(filterKeysByLang(["L&S", "nope", "S&H"])).toEqual(["L&S", "S&H"]);
    });
  });

  describe("mergeDictKeysForSave", () => {
    it("takes the selection for in-scope keys and the saved value for the rest", () => {
      const merged = mergeDictKeysForSave(["GAF"], FROM_LATIN, [
        "L&S",
        "S&H",
        "GRG",
      ]);
      expect(new Set(merged)).toEqual(new Set(["GAF", "S&H", "GRG"]));
    });

    it("falls back to the defaults for out-of-scope keys when nothing is saved", () => {
      const merged = mergeDictKeysForSave(["L&S"], FROM_LATIN, null);
      expect(new Set(merged)).toEqual(
        new Set(["L&S", ...TO_LATIN.filter((k) => k !== "EGL")])
      );
    });

    it("with every key in scope, is just the selection", () => {
      expect(
        mergeDictKeysForSave(["GRG", "L&S"], keysOf(LatinDict.AVAILABLE), [
          "S&H",
        ])
      ).toEqual(["L&S", "GRG"]);
    });

    it("ignores selected keys outside the scope", () => {
      expect(
        new Set(mergeDictKeysForSave(["L&S", "S&H"], ["L&S"], ["GAF"]))
      ).toEqual(new Set(["L&S", "GAF"]));
    });
  });
});
