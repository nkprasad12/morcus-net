import { parseRomanNumeral, toRoman } from "@/morceus/numerals/roman_numerals";

describe("toRoman", () => {
  it("formats positive integers as canonical uppercase Roman numerals", () => {
    expect(toRoman(1)).toBe("I");
    expect(toRoman(4)).toBe("IV");
    expect(toRoman(9)).toBe("IX");
    expect(toRoman(14)).toBe("XIV");
    expect(toRoman(49)).toBe("XLIX");
    expect(toRoman(99)).toBe("XCIX");
    expect(toRoman(444)).toBe("CDXLIV");
    expect(toRoman(1999)).toBe("MCMXCIX");
    expect(toRoman(3999)).toBe("MMMCMXCIX");
  });

  it("returns empty string for non-positive or non-integer values", () => {
    expect(toRoman(0)).toBe("");
    expect(toRoman(-5)).toBe("");
    expect(toRoman(1.5)).toBe("");
    expect(toRoman(NaN)).toBe("");
  });
});

describe("parseRomanNumeral", () => {
  it("Rejects illegal characters", () => {
    expect(parseRomanNumeral("xi V")).toBeUndefined();
    expect(parseRomanNumeral("CFD")).toBeUndefined();
    expect(parseRomanNumeral("K")).toBeUndefined();
    expect(parseRomanNumeral("KI")).toBeUndefined();
    expect(parseRomanNumeral("XIé")).toBeUndefined();
  });

  it("Handles single digit numerals", () => {
    expect(parseRomanNumeral("X")).toBe(10);
    expect(parseRomanNumeral("v")).toBe(5);
  });

  it("Rejects multiple subtractands before the five-times symbol", () => {
    expect(parseRomanNumeral("iiv")).toBeUndefined();
    expect(parseRomanNumeral("mxxlv")).toBeUndefined();
  });

  it("handles subtractands", () => {
    expect(parseRomanNumeral("MXCIV")).toBe(1094);
    expect(parseRomanNumeral("IX")).toBe(9);
  });

  it("handles equal in a row", () => {
    expect(parseRomanNumeral("MCCVII")).toBe(1207);
    expect(parseRomanNumeral("CCLI")).toBe(251);
  });

  it("parses misc number", () => {
    expect(parseRomanNumeral("MDCLXVI")).toBe(1666);
    expect(parseRomanNumeral("MMMM")).toBe(4000);
    expect(parseRomanNumeral("III")).toBe(3);
  });

  it("parses every canonical numeral from 1 to 4999 in either case", () => {
    for (let value = 1; value <= 4999; value++) {
      const numeral = toRoman(value);
      expect([numeral, parseRomanNumeral(numeral)]).toEqual([numeral, value]);
      expect([numeral, parseRomanNumeral(numeral.toLowerCase())]).toEqual([
        numeral,
        value,
      ]);
    }
  });

  it.each([
    ["IIII", 4],
    ["VIIII", 9],
    ["XIIII", 14],
    ["CCCC", 400],
    ["XXXX", 40],
    ["LXXXX", 90],
    ["DCCCC", 900],
    ["XLIIII", 44],
    ["IIX", 8],
    ["XIIX", 18],
    ["XXIIX", 28],
    ["XXC", 80],
    ["MXXCV", 1085],
    ["MMMM", 4000],
  ])("accepts the additive or attested form %s", (numeral, value) => {
    expect(parseRomanNumeral(numeral)).toBe(value);
    expect(parseRomanNumeral(numeral.toLowerCase())).toBe(value);
  });

  it.each([
    "",
    "IC",
    "IIC",
    "IM",
    "ID",
    "VV",
    "LL",
    "DD",
    "VIV",
    "IIV",
    "XXL",
    "CCD",
    "IIXX",
    "IIIII",
    "IIIX",
    "VIX",
    "XLX",
    "LXL",
    "XCX",
    "CMD",
    "IXC",
    "DIVI",
    "CIVI",
    "MIMI",
    "LIVI",
  ])("rejects the malformed numeral %p", (numeral) => {
    expect(parseRomanNumeral(numeral)).toBeUndefined();
    expect(parseRomanNumeral(numeral.toLowerCase())).toBeUndefined();
  });

  it.each([
    "id",
    "dic",
    "dixi",
    "dici",
    "illi",
    "mil",
    "divi",
    "didici",
    "vivi",
    "clivi",
  ])("rejects the Latin word %p", (word) => {
    expect(parseRomanNumeral(word)).toBeUndefined();
  });
});
