import {
  combineLengthCombiners,
  getVowelLength,
  haveCompatibleVowelLength,
  stripCombiners,
} from "@/common/character_utils";

describe("stripCombiners", () => {
  it("removes all combiners", () => {
    expect(stripCombiners("u\u0304")).toBe("u");
    expect(stripCombiners("a\u0304e\u0306")).toBe("ae");
  });

  it("keeps macrons not from combiners", () => {
    expect(stripCombiners("ōi\u0304")).toBe("ōi");
  });
});

describe("combineLengthCombiners", () => {
  it("Handles initial combiner", () => {
    expect(combineLengthCombiners("u\u0304helloh")).toBe("ūhelloh");
    expect(combineLengthCombiners("u\u0306helloh")).toBe("ŭhelloh");
  });

  it("Handles final combiner", () => {
    expect(combineLengthCombiners("u\u0304hellohi\u0304")).toBe("ūhellohī");
    expect(combineLengthCombiners("u\u0304hellohi\u0306")).toBe("ūhellohĭ");
  });

  it("Handles middle combiners", () => {
    expect(combineLengthCombiners("hello\u0304hi\u0304")).toBe("hellōhī");
    expect(combineLengthCombiners("hello\u0306hi\u0306")).toBe("hellŏhĭ");
  });
});

describe("getVowelLength", () => {
  it("returns unspecified on other", () => {
    expect(getVowelLength("a")).toBe("Ambiguous");
    expect(getVowelLength("á")).toBe("Ambiguous");
    expect(getVowelLength("")).toBe("Ambiguous");
    expect(getVowelLength("ōō")).toBe("Ambiguous");
  });

  it("returns Long on macron", () => {
    expect(getVowelLength("ō")).toBe("Long");
    expect(getVowelLength("Ē")).toBe("Long");
  });

  it("returns short on breve", () => {
    expect(getVowelLength("ў")).toBe("Short");
    expect(getVowelLength("Ă")).toBe("Short");
  });
});

describe("haveCompatibleVowelLength", () => {
  it("returns true on breve and unmarked", () => {
    expect(haveCompatibleVowelLength("quĭs", "quis")).toBe(true);
  });

  it("returns false on differing length", () => {
    expect(haveCompatibleVowelLength("quiis", "quis")).toBe(false);
  });

  it("returns false on breve and macron", () => {
    expect(haveCompatibleVowelLength("quĭs", "quīs")).toBe(false);
  });

  it("returns false on caret and macron", () => {
    expect(haveCompatibleVowelLength("qui^s", "quīs")).toBe(false);
  });

  it("returns true on macron and unmarked", () => {
    expect(haveCompatibleVowelLength("quis", "quīs")).toBe(true);
  });

  it("returns true on underscore and unmarked", () => {
    expect(haveCompatibleVowelLength("quis", "qui_s")).toBe(true);
  });

  it("returns true on macron and macron combiner", () => {
    expect(haveCompatibleVowelLength("quīs", "quīs")).toBe(true);
  });

  it("returns true on underscore and macron combiner", () => {
    expect(haveCompatibleVowelLength("quīs", "qui_s")).toBe(true);
  });

  it("returns true on macron and underscore", () => {
    expect(haveCompatibleVowelLength("qui_s", "quīs")).toBe(true);
  });

  it("returns true on macron + breve and underscore", () => {
    expect(haveCompatibleVowelLength("qui_^s", "quīs")).toBe(true);
  });

  it("returns true on unmarked and macron combiner", () => {
    expect(haveCompatibleVowelLength("quīs", "quis")).toBe(true);
  });

  it("returns true on breve and breve combiner", () => {
    expect(haveCompatibleVowelLength("quĭs", "quĭs")).toBe(true);
  });

  it("returns true on caret and breve combiner", () => {
    expect(haveCompatibleVowelLength("quĭs", "qui^s")).toBe(true);
  });

  it("returns true on breve and caret", () => {
    expect(haveCompatibleVowelLength("quĭs", "qui^s")).toBe(true);
  });

  it("returns true on breve and caret + underscore", () => {
    expect(haveCompatibleVowelLength("quĭs", "qui^_s")).toBe(true);
  });

  it("returns true on unmarked and breve combiner", () => {
    expect(haveCompatibleVowelLength("quĭs", "quis")).toBe(true);
  });

  it("returns true on unmarked and caret", () => {
    expect(haveCompatibleVowelLength("qui^s", "quis")).toBe(true);
  });

  it("returns true with mix", () => {
    expect(haveCompatibleVowelLength("qĭŭs", "qĭŭs")).toBe(true);
  });
});
