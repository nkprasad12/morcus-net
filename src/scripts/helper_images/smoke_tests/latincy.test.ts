import { assertLatincyLemma } from "@/scripts/helper_images/smoke_tests/latincy";

describe("assertLatincyLemma", () => {
  test("validates parsed JSON lemma", () => {
    expect(() =>
      assertLatincyLemma(
        JSON.stringify([
          ["Gallia", "Gallia", "Case=Nom|Gender=Fem|Number=Sing"],
          [" ", " ", ""],
          ["est", "sum", "Mood=Ind|Number=Sing|Person=3|Tense=Pres"],
        ]),
        "Gallia"
      )
    ).not.toThrow();

    expect(() =>
      assertLatincyLemma(
        JSON.stringify([["Gallia", "gallia", "Case=Nom"]]),
        "Gallia"
      )
    ).not.toThrow();

    expect(() => assertLatincyLemma("not-json", "Gallia")).toThrow(
      /invalid JSON/
    );
    expect(() =>
      assertLatincyLemma(JSON.stringify([["Gallia", "wrong"]]), "Gallia")
    ).toThrow(/Expected first token lemma 'Gallia'/);
  });
});
