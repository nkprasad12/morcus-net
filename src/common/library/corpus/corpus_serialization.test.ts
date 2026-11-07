import { checkLemmataQueryable } from "@/common/library/corpus/corpus_serialization";

describe("checkLemmataQueryable", () => {
  test("accepts letters with an optional homograph number", () => {
    expect(() =>
      checkLemmataQueryable(["amo", "Caesar", "edo#1", "volo#12"])
    ).not.toThrow();
  });

  test("names every lemma the query engine can't parse", () => {
    expect(() =>
      checkLemmataQueryable(["amo", "caro2", "terdecies:", "bonum#", "ēdo"])
    ).toThrow(/"caro2", "terdecies:", "bonum#", "ēdo"/);
  });
});
