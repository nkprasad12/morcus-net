import { isRomanNumeral } from "@/morceus/numerals/roman_numerals";

describe("isRomanNumeral", () => {
  it("Rejects invalid", () => {
    expect(isRomanNumeral("xi V")).toBe(false);
    expect(isRomanNumeral("CFD")).toBe(false);
  });

  it("Accepts valid numerals", () => {
    expect(isRomanNumeral("XiV")).toBe(true);
    expect(isRomanNumeral("DDCC")).toBe(true);
  });
});
