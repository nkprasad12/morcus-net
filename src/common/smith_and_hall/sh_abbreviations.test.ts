import { expandShAbbreviationsIn } from "@/common/smith_and_hall/sh_abbreviations";

describe("expandAbbreviationsIn", () => {
  it("has expected result with no abbreviations", () => {
    expect(expandShAbbreviationsIn("foo")).toStrictEqual(["foo"]);
  });
});
