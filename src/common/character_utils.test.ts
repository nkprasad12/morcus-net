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
