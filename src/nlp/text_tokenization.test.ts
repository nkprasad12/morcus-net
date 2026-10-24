import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { preprocessText, type TokenResult } from "@/nlp/text_tokenization";

setupMorceusWithFakeData();

describe("preprocessText", () => {
  it("should process basic text correctly", () => {
    const input = "acclinat Panthia";

    const [processed, words, spaces] = preprocessText(input);

    expect(processed).toHaveLength(3);
    expect(processed[0]).toHaveProperty("word", "acclinat");
    expect(processed[1]).toBe(" ");
    expect(processed[2]).toHaveProperty("word", "Panthia");

    expect(words).toEqual(["acclinat", " ", "Panthia"]);
    expect(spaces).toEqual([false, true, false]);
  });

  it("should handle text with punctuation", () => {
    const input = "acclinat, Panthia!";

    const [processed, words, spaces] = preprocessText(input);

    expect(processed).toHaveLength(4);
    const acclinat = processed[0] as TokenResult;
    const panthia = processed[2] as TokenResult;

    expect(processed[1]).toBe(", ");
    expect(processed[3]).toBe("!");
    expect(acclinat.word).toBe("acclinat");
    expect(panthia.word).toBe("Panthia");
    expect(panthia.crunched).toHaveLength(2);

    expect(words).toEqual(["acclinat", ", ", "Panthia", "!"]);
    expect(spaces).toEqual([false, true, false, true]);
  });

  it("should handle words with enclitics", () => {
    const input = "acclinatque Panthia";

    const [processed, words, spaces] = preprocessText(input);

    expect(processed).toHaveLength(3);
    const acclinat = processed[0] as TokenResult;
    const panthia = processed[2] as TokenResult;

    expect(processed[1]).toBe(" ");
    expect(acclinat.word).toBe("acclinatque");
    expect(panthia.word).toBe("Panthia");

    expect(words).toEqual(["acclinat", "que", " ", "Panthia"]);
    expect(spaces).toEqual([false, false, true, false]);
  });

  it("should handle empty input", () => {
    const input = "";

    const [processed, words, spaces] = preprocessText(input);

    expect(processed).toHaveLength(0);
    expect(words).toHaveLength(0);
    expect(spaces).toHaveLength(0);
  });

  it("should handle text with diacritics", () => {
    const input = "acclīnat";

    const [processed, words, spaces] = preprocessText(input);
    expect(processed).toHaveLength(1);
    const acclinat = processed[0] as TokenResult;
    expect(acclinat.word).toBe("acclinat");
    expect(acclinat.diacritics).toEqual(["\u0304"]);
    expect(acclinat.positions).toEqual([4]);

    expect(words).toEqual(["acclinat"]);
    expect(spaces).toEqual([false]);
  });

  it("lowercases multi-letter all-caps words for the tagger while keeping single-letter tokens, raw token casing, and Title Case", () => {
    const input = "C. ACCLINATQUE EOS Panthia";

    const [processed, words, spaces] = preprocessText(input);
    const c = processed[0] as TokenResult;
    const acclinatque = processed[2] as TokenResult;
    const eos = processed[4] as TokenResult;
    const panthia = processed[6] as TokenResult;

    expect(c.word).toBe("C");
    expect(acclinatque.word).toBe("ACCLINATQUE");
    expect(acclinatque.strippedWord).toBe("ACCLINATQUE");
    expect(eos.word).toBe("EOS");
    expect(eos.strippedWord).toBe("EOS");
    expect(panthia.word).toBe("Panthia");

    expect(words).toEqual([
      "C",
      ". ",
      "acclinat",
      "que",
      " ",
      "eos",
      " ",
      "Panthia",
    ]);
    expect(spaces).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
  });
});
