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
    const longText = "a".repeat(20001);
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

  it("should group different case with same vowels", async () => {
    const input = "Gallus acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Gallus", lemma: "Gallus", morph: "Gender=Masc" },
      { text: " " },
      { text: "acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);
    expect(result).toHaveLength(3);

    const gallus = result[0] as MacronizedWord;
    expect(gallus.word).toBe("Gallus");
    expect(gallus.options).toEqual([
      {
        form: "Gallus",
        options: [
          { lemma: "Gallus", morph: ["masc nom sg"] },
          { lemma: "gallus", morph: ["masc nom sg"] },
        ],
      },
    ]);
  });

  it("should preserve case of all-caps word", async () => {
    const input = "EOS";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "EOS", lemma: "Eos", morph: "Gender=Fem" },
    ]);

    const result = await macronizeInput(input);
    expect(result).toHaveLength(1);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("EOS");
    expect(eos.options).toEqual([
      {
        form: "E\u0304OS",
        options: [{ lemma: "Eos", morph: ["fem nom sg"] }],
      },
      { form: "EO\u0304S", options: [{ lemma: "is", morph: ["masc acc pl"] }] },
    ]);
  });

  it("should separate different case with different vowels", async () => {
    const input = "Eos acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Eos", lemma: "Eos", morph: "Gender=Fem" },
      { text: " " },
      { text: "acclinat", lemma: "acclino", morph: "Tense=Pres" },
    ]);

    const result = await macronizeInput(input);
    expect(result).toHaveLength(3);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toEqual([
      {
        form: "E\u0304os",
        options: [{ lemma: "Eos", morph: ["fem nom sg"] }],
      },
      { form: "Eo\u0304s", options: [{ lemma: "is", morph: ["masc acc pl"] }] },
    ]);
  });

  it("should respect NLP result if matches", async () => {
    const input = "Eos";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Eos", lemma: "Eos", morph: "Gender=Fem" },
    ]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBe(0);
  });

  it("should ignore NLP result if morphology doesn't match", async () => {
    const input = "Eos";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Eos", lemma: "Eos", morph: "Gender=Masc" },
    ]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBeUndefined();
  });

  it("should ignore NLP result if lemma doesn't match", async () => {
    const input = "Eos";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Eos", lemma: "Error", morph: "Gender=Fem" },
    ]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBeUndefined();
  });

  it("should respect initial macronization over NLP result if available", async () => {
    const input = "Eōs";
    mockLatincyAnalysis.mockResolvedValue([
      { text: "Eos", lemma: "Eos", morph: "Gender=Fem" },
    ]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(1);
    expect(eos.options[0].form).toBe("Eo\u0304s");
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
