import { Vowels } from "@/common/character_utils";

describe("Vowels getLength", () => {
  it("returns unspecified on other", () => {
    expect(Vowels.getLength("a")).toBe("Ambiguous");
    expect(Vowels.getLength("á")).toBe("Ambiguous");
  });

  it("returns Long on macron", () => {
    expect(Vowels.getLength("ō")).toBe("Long");
    expect(Vowels.getLength("Ē")).toBe("Long");
  });

  it("returns short on breve", () => {
    expect(Vowels.getLength("ў")).toBe("Short");
    expect(Vowels.getLength("Ă")).toBe("Short");
  });
});

describe("Vowels haveCompatibleLength", () => {
  it("returns true on breve and unmarked", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quis")).toBe(true);
  });

  it("returns false on breve and macron", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quīs")).toBe(false);
  });

  it("returns true on macron and unmarked", () => {
    expect(Vowels.haveCompatibleLength("quis", "quīs")).toBe(true);
  });

  it("returns true on macron and macron combiner", () => {
    expect(Vowels.haveCompatibleLength("quīs", "quīs")).toBe(true);
  });

  it("returns true on unmarked and macron combiner", () => {
    expect(Vowels.haveCompatibleLength("quīs", "quis")).toBe(true);
  });

  it("returns true on breve and breve combiner", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quĭs")).toBe(true);
  });

  it("returns true on unmarked and breve combiner", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quis")).toBe(true);
  });

  it("returns true with mix", () => {
    expect(Vowels.haveCompatibleLength("qĭŭs", "qĭŭs")).toBe(true);
  });
});
