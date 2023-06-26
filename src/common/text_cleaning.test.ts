import { removeDiacritics } from "./text_cleaning";

describe("removeDiacritics", () => {
  it("does not modify text without diacritics", () => {
    expect(removeDiacritics("canaba")).toBe("canaba");
  });

  it("removes only diacritics if present", () => {
    expect(removeDiacritics("cānaba")).toBe("canaba");
  });

  it("handles weird tilde characters in o", () => {
    const result = removeDiacritics("Ōărĭon").toLowerCase();
    expect(result).toBe("oarion");
  });
});
