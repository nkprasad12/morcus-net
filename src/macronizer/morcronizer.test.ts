import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { macronizeInput } from "@/macronizer/morcronizer";
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
      { text: "Acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);

    expect(mockLatincyAnalysis).toHaveBeenCalledWith(input);
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
      { text: "Panthia", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
    ]);

    const result = await macronizeInput(input);

    expect(mockLatincyAnalysis).toHaveBeenCalledWith(input);
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

  it("should handle odd tokenization.", async () => {
    const input = "Panthia].\nAcclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Panthia].", lemma: "Panthia", morph: "Gender=Fem|Case=Abl" },
      { text: "\nAcclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);

    expect(mockLatincyAnalysis).toHaveBeenCalledWith(input);
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
