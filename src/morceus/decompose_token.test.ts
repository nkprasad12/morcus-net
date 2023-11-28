import { decomposeToken } from "@/morceus/decompose_token";

describe("decomposeToken", () => {
  it("handles simple token", () => {
    expect(decomposeToken("verum")).toEqual([["verum"]]);
  });

  it("handles token with whitespace", () => {
    expect(decomposeToken(" verum")).toEqual([["verum"]]);
  });

  it("handles split prodelision", () => {
    expect(decomposeToken("'st")).toEqual([["est"]]);
  });

  it("handles prodelision with default mark", () => {
    expect(decomposeToken("verum'st")).toEqual([["verum", "est"]]);
  });

  it("handles prodelision with alternate mark", () => {
    expect(decomposeToken("verum’st")).toEqual([["verum", "est"]]);
  });

  it("handles prodelision without mark", () => {
    expect(decomposeToken("verumst")).toEqual([["verumst"], ["verum", "est"]]);
  });

  it("handles -us prodelision without mark", () => {
    expect(decomposeToken("verust")).toEqual([["verust"], ["verus", "est"]]);
  });

  it("handles enclitic alone", () => {
    expect(decomposeToken("facillimumque")).toEqual([
      ["facillimumque"],
      ["facillimum", "que"],
    ]);
  });

  it("handles word that appears to have multiple enclitics", () => {
    expect(decomposeToken("ubicumque")).toEqual([
      ["ubicumque"],
      ["ubicum", "que"],
    ]);
  });

  it("handles enclitic then prodelision", () => {
    expect(decomposeToken("facillimumquest")).toEqual([
      ["facillimumquest"],
      ["facillimumque", "est"],
      ["facillimum", "que", "est"],
    ]);
  });
});
