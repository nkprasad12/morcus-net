import {
  MAX_QUERY_BODY_LENGTH,
  queryBodyLength,
} from "@/common/library/corpus/corpus_common";

describe("queryBodyLength", () => {
  it("counts the whole query when there is no scope prefix", () => {
    expect(queryBodyLength("amor 3~ @case:acc")).toBe(17);
  });

  it("ignores the [...] scope prefix and the space after it", () => {
    expect(queryBodyLength("[Cicero, Vergil] amor")).toBe(4);
    expect(queryBodyLength("  [Cicero]   amor")).toBe(4);
    expect(queryBodyLength("[Cicero]")).toBe(0);
  });

  it("lets a long scope through with a short body", () => {
    const scope = Array.from({ length: 20 }, (_, i) => `Author${i}`).join(", ");
    const query = `[${scope}] amor`;
    expect(query.length).toBeGreaterThan(MAX_QUERY_BODY_LENGTH);
    expect(queryBodyLength(query)).toBe(4);
  });

  it("only strips a prefix at the start", () => {
    expect(queryBodyLength("amor [x]")).toBe(8);
  });
});
