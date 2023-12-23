import { processWords, removeDiacritics } from "@/common/text_cleaning";

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

describe("processWords", () => {
  it("splits across punctiation initial word final word", () => {
    expect(processWords("hello darkness. (my) old", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits across punctuation initial other final word", () => {
    expect(processWords("[hello darkness. (my) old", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
    ]);
  });

  it("splits across punctuation initial word final other", () => {
    expect(processWords("hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });

  it("splits across punctuation initial other final other", () => {
    expect(processWords("[hello darkness. (my) old]", (s) => s)).toStrictEqual([
      "[",
      "hello",
      " ",
      "darkness",
      ". (",
      "my",
      ") ",
      "old",
      "]",
    ]);
  });
});
