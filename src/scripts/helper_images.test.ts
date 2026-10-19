import {
  ALL_HELPER_IMAGE_NAMES,
  assertLatincyLemma,
  computeTreeHash,
  HELPER_IMAGES,
  isHelperImageName,
} from "@/scripts/helper_images";

describe("helper_images", () => {
  test("isHelperImageName recognizes supported helper images", () => {
    expect(isHelperImageName("morcus-proxy")).toBe(true);
    expect(isHelperImageName("morcus-latincy")).toBe(true);
    expect(isHelperImageName("unknown-image")).toBe(false);
    expect(ALL_HELPER_IMAGE_NAMES).toEqual(Object.keys(HELPER_IMAGES));
  });

  test("computeTreeHash is deterministic and sensitive to both inputs", () => {
    const hashA = computeTreeHash("aaa111", "bbb222");
    expect(hashA).toHaveLength(40);
    expect(computeTreeHash("aaa111\n", "bbb222\n")).toBe(hashA);
    expect(computeTreeHash("aaa999", "bbb222")).not.toBe(hashA);
    expect(computeTreeHash("aaa111", "bbb999")).not.toBe(hashA);
  });

  test("assertLatincyLemma validates parsed JSON lemma", () => {
    expect(() =>
      assertLatincyLemma(
        JSON.stringify([
          ["Galliā", "Gallia", "Case=Abl|Gender=Fem|Number=Sing"],
          [" ", " ", ""],
          ["est", "sum", "Mood=Ind|Number=Sing|Person=3|Tense=Pres"],
        ]),
        "Gallia"
      )
    ).not.toThrow();

    expect(() => assertLatincyLemma("not-json", "Gallia")).toThrow(
      /invalid JSON/
    );
    expect(() =>
      assertLatincyLemma(JSON.stringify([["Galliā", "wrong"]]), "Gallia")
    ).toThrow(/Expected first token lemma 'Gallia'/);
  });
});
