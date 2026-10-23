import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { macronizeInput } from "@/macronizer/morcronizer";
import * as latincy from "@/latincy/latincy_client";
import type { MacronizedWord } from "@/macronizer/macronizer_types";

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
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
      [" ", "", ""],
      ["acclinat", "acclino", "Tense=Pres"],
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
      ["Gallus", "Gallus", "Gender=Masc"],
      [" ", "", ""],
      ["acclinat", "acclino", "Tense=Pres"],
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

  it("should preserve case of all-caps word, send lowercase to tagger, and match proper-noun lemmas case-insensitively", async () => {
    const input = "EOS ACCLINATQUE";
    // When sent lowercase "eos", LatinCy may return lowercase lemma "eos"
    // while Morceus's proper-noun lemma is "Eos".
    mockLatincyAnalysis.mockResolvedValue([
      ["eos", "eos", "Gender=Fem"],
      [" ", "", ""],
      ["acclinat", "acclino", "Tense=Pres"],
      ["que", "que", ""],
    ]);

    const result = await macronizeInput(input);
    expect(mockLatincyAnalysis).toHaveBeenCalledWith(
      ["eos", " ", "acclinat", "que"],
      [false, true, false, false]
    );
    expect(result).toHaveLength(3);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("EOS");
    expect(eos.options).toEqual([
      {
        form: "E\u0304OS",
        options: [{ lemma: "Eos", morph: ["fem nom sg"] }],
      },
      { form: "EO\u0304S", options: [{ lemma: "is", morph: ["masc acc pl"] }] },
    ]);
    expect(eos.suggested).toBe(0);
    expect(eos.confidence).toBe("confident");

    const acclinatque = result[2] as MacronizedWord;
    expect(acclinatque.word).toBe("ACCLINATQUE");
    expect(acclinatque.options).toEqual([
      {
        form: "ACCLI\u0304NATQUE",
        options: [{ lemma: "acclino", morph: ["pres ind act 3rd sg"] }],
      },
    ]);
  });

  it("keeps lemma matching case-sensitive for non-all-caps words", async () => {
    // Non-all-caps "Eos" should NOT match lowercase tagger lemma "eos" in Pass 1.
    const result = await macronizeInput("Eos", async () => [
      ["Eos", "eos", "Gender=Fem|Case=Nom|Number=Sing"],
    ]);
    const eos = result[0] as MacronizedWord;
    expect(eos.suggested).toBe(0);
    expect(eos.confidence).toBe("weak");
  });

  it("handles mixed-case and 1-letter-stem enclitic words without alignment errors", async () => {
    const seenWords: string[] = [];
    const result = await macronizeInput(
      "ACCLINATque AcclinatQUE IQUE",
      async (words) => {
        seenWords.push(...words);
        return words.map((w): [string, string, string] => [w, "", ""]);
      }
    );
    expect(seenWords).toEqual([
      "ACCLINAT",
      "que",
      " ",
      "Acclinat",
      "que",
      " ",
      "i",
      "que",
    ]);
    const words = result.filter(
      (t): t is MacronizedWord => typeof t !== "string"
    );
    expect(words.map((w) => w.word)).toEqual([
      "ACCLINATque",
      "AcclinatQUE",
      "IQUE",
    ]);
  });

  it("should separate different case with different vowels", async () => {
    const input = "Eos acclinat";
    mockLatincyAnalysis.mockResolvedValue([
      ["Eos", "Eos", "Gender=Fem"],
      [" ", "", ""],
      ["acclinat", "acclino", "Tense=Pres"],
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
    mockLatincyAnalysis.mockResolvedValue([["Eos", "Eos", "Gender=Fem"]]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBe(0);
  });

  it("should ignore NLP result if morphology doesn't match", async () => {
    const input = "Eos";
    mockLatincyAnalysis.mockResolvedValue([["Eos", "Eos", "Gender=Masc"]]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBeUndefined();
  });

  it("should ignore NLP result if lemma doesn't match", async () => {
    const input = "Eos";
    mockLatincyAnalysis.mockResolvedValue([["Eos", "Error", "Gender=Fem"]]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(2);
    expect(eos.suggested).toBeUndefined();
  });

  it("should respect initial macronization over NLP result if available", async () => {
    const input = "Eōs";
    mockLatincyAnalysis.mockResolvedValue([["Eos", "Eos", "Gender=Fem"]]);

    const result = await macronizeInput(input);

    const eos = result[0] as MacronizedWord;
    expect(eos.word).toBe("Eos");
    expect(eos.options).toHaveLength(1);
    expect(eos.options[0].form).toBe("Eo\u0304s");
  });

  it("should preserve spacing and ignored characters.", async () => {
    const input = "Panthia].\nAcclinat";
    mockLatincyAnalysis.mockResolvedValue([
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
      ["].\n", "", ""],
      ["Acclinat", "acclino", "Tense=Pres"],
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
      ["Acclinat", "acclino", "Tense=Pres"],
      [" ", "", ""],
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
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
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
    ]);
    await expect(() => macronizeInput(input)).rejects.toThrow();
  });

  it("should handle words with enclitics", async () => {
    const input = "acclinatque Panthia";
    mockLatincyAnalysis.mockResolvedValue([
      ["acclinat", "acclino", "Tense=Pres"],
      ["que", "que", ""],
      [" ", "", ""],
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
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
      ["Blah", "", ""],
      [" ", "", ""],
      ["acclinat", "acclino", "Tense=Pres"],
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

  it("assigns confidence='confident' when Pass 1 matches a single form", async () => {
    const result = await macronizeInput("Panthia", async () => [
      ["Panthia", "Panthia", "Gender=Fem|Case=Abl"],
    ]);
    const panthia = result[0] as MacronizedWord;
    expect(panthia.suggested).toBe(1);
    expect(panthia.confidence).toBe("confident");
  });

  it("assigns confidence='tied' when Pass 1 matches multiple forms", async () => {
    // caveo has both cavē (regular conj2) and cave (short-e irreg) for 2nd sg pres imperat act.
    const result = await macronizeInput("cave", async () => [
      [
        "cave",
        "caveo",
        "Mood=Imp|Number=Sing|Person=2|Tense=Pres|VerbForm=Fin|Voice=Act",
      ],
    ]);
    const cave = result[0] as MacronizedWord;
    expect(cave.options.length).toBeGreaterThan(1);
    expect(cave.suggested).toBe(0);
    expect(cave.confidence).toBe("tied");
  });

  it("assigns confidence='weak' when Pass 1 misses lemma and Pass 2 matches exact morph", async () => {
    const result = await macronizeInput("Panthia", async () => [
      ["Panthia", "otherLemma", "Case=Abl|Gender=Fem|Number=Sing"],
    ]);
    const panthia = result[0] as MacronizedWord;
    expect(panthia.suggested).toBe(1);
    expect(panthia.confidence).toBe("weak");
  });

  it("leaves suggested and confidence undefined when neither Pass 1 nor Pass 2 matches", async () => {
    const result = await macronizeInput("Panthia", async () => [
      ["Panthia", "otherLemma", "Case=Dat|Gender=Masc|Number=Plur"],
    ]);
    const panthia = result[0] as MacronizedWord;
    expect(panthia.suggested).toBeUndefined();
    expect(panthia.confidence).toBeUndefined();
  });

  it("handles letterless tokens and soft hyphens (\\p{Cf})", async () => {
    const input = "ac\u00ADclinat — 123Panthia";
    const result = await macronizeInput(input, async (words) =>
      words.map((w) => [w, "", ""])
    );
    // "ac\u00ADclinat" crunches as acclinat while preserving raw word text
    const acclinat = result[0] as MacronizedWord;
    expect(acclinat.word).toBe("ac\u00ADclinat");
    expect(acclinat.options).toHaveLength(1);
    expect(acclinat.options[0].form).toBe("accli\u0304nat");
    // " — " has no letters -> plain string separator(s), never an unknown word
    expect(result.some((r) => typeof r !== "string" && r.word === "—")).toBe(
      false
    );
  });

  it("reclassifies unknown Roman numerals and praenomen/single-letter abbreviations before '.' as plain separators", async () => {
    const input = "XVIII xxiv M. Cn. Sex. M'. Q. Blah.";
    const result = await macronizeInput(input, async (words) =>
      words.map((w) => [w, "", ""])
    );
    const wordObjects = result.filter(
      (t): t is MacronizedWord => typeof t !== "string"
    );
    // Only "Blah" should remain a MacronizedWord (unknown); all numerals and abbreviations become string tokens.
    expect(wordObjects.map((w) => w.word)).toEqual(["Blah"]);
  });

  it("appends kind='numeral' option to known all-caps Roman numerals", async () => {
    // "I" is a known word (Ī from eo#1) and an all-caps Roman numeral.
    const nonNumResult = await macronizeInput("I", async () => [
      [
        "I",
        "eo",
        "Mood=Imp|Number=Sing|Person=2|Tense=Pres|VerbForm=Fin|Voice=Act",
      ],
    ]);
    const wordNonNum = nonNumResult[0] as MacronizedWord;
    expect(wordNonNum.options).toEqual([
      {
        form: "I\u0304",
        options: [
          {
            lemma: "eo#1",
            morph: ["perf ind act 1st sg", "pres imperat act 2nd sg"],
          },
        ],
      },
      {
        form: "I",
        kind: "numeral",
        options: [],
      },
    ]);
    expect(wordNonNum.suggested).toBeUndefined();
    expect(wordNonNum.confidence).toBeUndefined();

    // Lowercase "i" does not get a numeral option.
    const lowerResult = await macronizeInput("i", async () => [
      ["i", "eo", ""],
    ]);
    const wordLower = lowerResult[0] as MacronizedWord;
    expect(wordLower.options).toHaveLength(1);
    expect(wordLower.options[0].kind).toBeUndefined();
  });
});

describe("macronizeInput edge cases", () => {
  const echoTagger = async (words: string[]) =>
    words.map((w): [string, string, string] => [w, "", ""]);

  it("doesn't flag a numeral reading that prints the same as a known form", async () => {
    // "C" is known (Gaius) and has no macron, so the numeral reading would
    // print the same; "I" (Ī) still gets the numeral option.
    const result = await macronizeInput("C. Iulius I", echoTagger);
    const words = result.filter(
      (t): t is MacronizedWord => typeof t !== "string"
    );
    expect(words[0].word).toBe("C");
    expect(words[0].options.map((o) => o.kind)).toEqual([undefined]);
    const i = words.find((w) => w.word === "I");
    expect(i?.options.map((o) => o.kind)).toEqual([undefined, "numeral"]);
  });

  it("never suggests the numeral reading, even for a numeral-looking tag", async () => {
    const numeralLookingMorphs = [
      "NumForm=Roman|NumType=Card",
      "NumType=Card|NumForm=Roman|Number=Plur",
      "NumType=Ord|Case=Nom",
    ];
    for (const morph of numeralLookingMorphs) {
      const result = await macronizeInput("I", async () => [["I", "I", morph]]);
      const word = result[0] as MacronizedWord;
      expect(word.options.map((o) => o.kind)).toEqual([undefined, "numeral"]);
      expect(word.suggested).toBeUndefined();
      expect(word.confidence).toBeUndefined();
    }
  });

  it("treats CRLF line breaks like LF", async () => {
    const crlf = await macronizeInput("Panthia\r\nPanthia", echoTagger);
    const lf = await macronizeInput("Panthia\nPanthia", echoTagger);
    expect(crlf).toEqual(lf);
    expect(crlf[1]).toBe("\n");
  });

  it("keeps the typed spelling, macrons included, of unknown words", async () => {
    const result = await macronizeInput("Ōthō Panthiā", echoTagger);
    const otho = result[0] as MacronizedWord;
    expect(otho.options).toHaveLength(0);
    expect(otho.word).toBe("Ōthō");
    // Known words still report the plain word; the macron picks the form.
    const panthia = result[2] as MacronizedWord;
    expect(panthia.word).toBe("Panthia");
    expect(panthia.options.map((o) => o.form.normalize("NFC"))).toEqual([
      "Panthi\u0101",
    ]);
  });
});
