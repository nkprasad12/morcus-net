import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";

describe("parseRomanNumeral", () => {
  it("Rejects illegal characters", () => {
    expect(parseRomanNumeral("xi V")).toBeUndefined();
    expect(parseRomanNumeral("CFD")).toBeUndefined();
    expect(parseRomanNumeral("K")).toBeUndefined();
    expect(parseRomanNumeral("KI")).toBeUndefined();
  });

  it("Handles single digit numerals", () => {
    expect(parseRomanNumeral("X")).toBe(10);
    expect(parseRomanNumeral("v")).toBe(5);
  });

  it("Rejects multiple subtractands", () => {
    expect(parseRomanNumeral("iiv")).toBeUndefined();
    expect(parseRomanNumeral("mxxcv")).toBeUndefined();
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
});
