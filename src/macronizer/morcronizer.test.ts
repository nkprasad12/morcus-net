import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import {
  macronizeInput,
  preprocessText,
  type TokenResult,
} from "@/macronizer/morcronizer";
import * as latincy from "@/latincy/latincy_client";
import type { MacronizedWord } from "@/web/api_routes";

// Mock the latincyAnalysis function
jest.mock("@/latincy/latincy_client", () => ({
  latincyAnalysis: jest.fn(),
}));

const mockLatincyAnalysis = latincy.latincyAnalysis as jest.Mock;

setupMorceusWithFakeData();

const PANTHIA_OPTIONS: MacronizedWord["options"] = [
  {
    form: "Panthia",
    options: [{ lemma: "Panthia", morph: ["fem nom/voc sg"] }],
  },
  {
    form: "Panthiā",
    options: [{ lemma: "Panthia", morph: ["fem abl sg"] }],
  },
];

describe("macronizeInput", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should reject input exceeding character limit", async () => {
    const longText = "a".repeat(10001);
    await expect(macronizeInput(longText)).rejects.toThrow(/Input long/);
  });

  it("should process simple text correctly", async () => {
    const input = "Panthia acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
      { text: " " },
      { text: "acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);

    expect(result).toHaveLength(3);

    const panthia = result[0] as MacronizedWord;
    expect(panthia.word).toBe("Panthia");
    expect(panthia.options).toStrictEqual(PANTHIA_OPTIONS);
    expect(panthia.suggested).toBe(1);

    expect(result[1]).toBe(" ");

    const acclinat = result[2] as MacronizedWord;
    expect(acclinat.word).toBe("acclinat");
    expect(acclinat.options).toHaveLength(1);
    expect(acclinat.suggested).toBeUndefined();
  });

  it("should preserve spacing and ignored characters.", async () => {
    const input = "Panthia].\nAcclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
      { text: "].\n" },
      { text: "Acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);

    expect(result).toHaveLength(3);

    const panthia = result[0] as MacronizedWord;
    expect(panthia.word).toBe("Panthia");
    expect(panthia.options).toStrictEqual(PANTHIA_OPTIONS);
    expect(panthia.suggested).toBe(1);

    expect(result[1]).toBe("].\n");

    const acclinat = result[2] as MacronizedWord;
    expect(acclinat.word).toBe("Acclinat");
    expect(acclinat.options).toHaveLength(1);
    expect(acclinat.suggested).toBeUndefined();
  });

  it("should preserve case of original text.", async () => {
    const input = "Acclinat Panthia";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Acclinat", lemma: "acclino", morph: "Tense=Pres" },
      { text: " " },
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
    ]);

    const result = await macronizeInput(input);

    expect(mockLatincyAnalysis).toHaveBeenCalledWith(
      ["Acclinat", " ", "Panthia"],
      [false, true, false]
    );
    expect(result).toHaveLength(3);

    expect(result[1]).toBe(" ");
    const panthia = result[2] as MacronizedWord;
    const acclinat = result[0] as MacronizedWord;

    expect(panthia.word).toBe("Panthia");
    expect(panthia.options).toStrictEqual(PANTHIA_OPTIONS);

    expect(acclinat.word).toBe("Acclinat");
    expect(acclinat.options).toStrictEqual([
      {
        form: "Acclīnat",
        options: [{ lemma: "acclino", morph: ["pres ind act 3rd sg"] }],
      },
    ]);
  });

  it("should raise on missing nlp tokens", async () => {
    const input = "Panthia acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
    ]);
    await expect(() => macronizeInput(input)).rejects.toThrow();
  });

  it("should handle words with enclitics", async () => {
    const input = "acclinatque Panthia";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "acclinat", lemma: "acclino", morph: "Tense=Pres" },
      { text: "que", lemma: "que" },
      { text: " " },
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
    ]);

    const result = await macronizeInput(input);

    const acclinatque = result[0] as MacronizedWord;
    expect(acclinatque.word).toBe("acclinatque");
    expect(acclinatque.options).toEqual([
      {
        form: "acclīnatque",
        options: [{ lemma: "acclino", morph: ["pres ind act 3rd sg"] }],
      },
    ]);
    const panthia = result[2] as MacronizedWord;
    expect(panthia.word).toBe("Panthia");
  });

  it("should handle text with words that are not known to either", async () => {
    const input = "Blah acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Blah" },
      { text: " " },
      { text: "acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);

    const blah = result[0] as MacronizedWord;
    expect(blah.word).toBe("Blah");
    expect(blah.options).toHaveLength(0);
    expect(blah.suggested).toBeUndefined();

    const acclinat = result[2] as MacronizedWord;
    expect(acclinat.word).toBe("acclinat");
    expect(acclinat.options).toHaveLength(1);
  });
});

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
});
