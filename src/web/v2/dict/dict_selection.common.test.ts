import {
  parseDictKeys,
  resolveDictParams,
  parseInflectionParam,
} from "@/web/v2/dict/dict_selection.common";

describe("dict_selection.common", () => {
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
      expect(resolveDictParams({ inParam: "ls-sh" })).toEqual(["L&S", "S&H"]);
    });

    it("returns null when nothing was supplied", () => {
      expect(resolveDictParams({})).toBeNull();
      expect(resolveDictParams({ dictParam: [], inParam: [] })).toBeNull();
      expect(resolveDictParams({ dictParam: "nonsense" })).toBeNull();
    });
  });
});
