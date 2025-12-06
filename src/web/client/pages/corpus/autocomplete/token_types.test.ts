import { categorizeToken } from "@/web/client/pages/corpus/autocomplete/token_types";

describe("categorizeToken", () => {
  it("categorizes opening parenthesis", () => {
    expect(categorizeToken("(")).toBe("(");
  });

  it("categorizes closing parenthesis", () => {
    expect(categorizeToken(")")).toBe(")");
  });

  it("categorizes 'and' as logical operator", () => {
    expect(categorizeToken("and")).toBe("logicalOperator");
  });

  it("categorizes 'or' as logical operator", () => {
    expect(categorizeToken("or")).toBe("logicalOperator");
  });

  it("categorizes empty string as space", () => {
    expect(categorizeToken("")).toBe("space");
  });

  it("categorizes whitespace as space", () => {
    expect(categorizeToken("   ")).toBe("space");
  });

  it("categorizes single space as space", () => {
    expect(categorizeToken(" ")).toBe("space");
  });

  it("categorizes token starting with @ as wordFilter", () => {
    expect(categorizeToken("@lemma")).toBe("wordFilter");
    expect(categorizeToken("@form")).toBe("wordFilter");
  });

  it("categorizes token starting with # as workFilter", () => {
    expect(categorizeToken("#aeneid")).toBe("workFilter");
    expect(categorizeToken("#caesar")).toBe("workFilter");
  });

  it("categorizes token containing ~ as proximity", () => {
    expect(categorizeToken("5~")).toBe("proximity");
    expect(categorizeToken("~5")).toBe("proximity");
  });

  it("categorizes plain word as wordFilter", () => {
    expect(categorizeToken("word")).toBe("wordFilter");
    expect(categorizeToken("puella")).toBe("wordFilter");
  });

  it("categorizes words with special characters as wordFilter", () => {
    expect(categorizeToken("word-with-dash")).toBe("wordFilter");
    expect(categorizeToken("word.with.dot")).toBe("wordFilter");
  });
});
