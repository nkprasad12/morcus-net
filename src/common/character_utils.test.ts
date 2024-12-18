import {
  combineLengthCombiners,
  stripCombiners,
  Vowels,
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

describe("Vowels getLength", () => {
  it("returns unspecified on other", () => {
    expect(Vowels.getLength("a")).toBe("Ambiguous");
    expect(Vowels.getLength("á")).toBe("Ambiguous");
  });

  it("returns Long on macron", () => {
    expect(Vowels.getLength("ō")).toBe("Long");
    expect(Vowels.getLength("Ē")).toBe("Long");
  });

  it("returns short on breve", () => {
    expect(Vowels.getLength("ў")).toBe("Short");
    expect(Vowels.getLength("Ă")).toBe("Short");
  });
});

describe("Vowels haveCompatibleLength", () => {
  it("returns true on breve and unmarked", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quis")).toBe(true);
  });

  it("returns false on differing length", () => {
    expect(Vowels.haveCompatibleLength("quiis", "quis")).toBe(false);
  });

  it("returns false on breve and macron", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quīs")).toBe(false);
  });

  it("returns false on caret and macron", () => {
    expect(Vowels.haveCompatibleLength("qui^s", "quīs")).toBe(false);
  });

  it("returns true on macron and unmarked", () => {
    expect(Vowels.haveCompatibleLength("quis", "quīs")).toBe(true);
  });

  it("returns true on underscore and unmarked", () => {
    expect(Vowels.haveCompatibleLength("quis", "qui_s")).toBe(true);
  });

  it("returns true on macron and macron combiner", () => {
    expect(Vowels.haveCompatibleLength("quīs", "quīs")).toBe(true);
  });

  it("returns true on underscore and macron combiner", () => {
    expect(Vowels.haveCompatibleLength("quīs", "qui_s")).toBe(true);
  });

  it("returns true on macron and underscore", () => {
    expect(Vowels.haveCompatibleLength("qui_s", "quīs")).toBe(true);
  });

  it("returns true on macron + breve and underscore", () => {
    expect(Vowels.haveCompatibleLength("qui_^s", "quīs")).toBe(true);
  });

  it("returns true on unmarked and macron combiner", () => {
    expect(Vowels.haveCompatibleLength("quīs", "quis")).toBe(true);
  });

  it("returns true on breve and breve combiner", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quĭs")).toBe(true);
  });

  it("returns true on caret and breve combiner", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "qui^s")).toBe(true);
  });

  it("returns true on breve and caret", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "qui^s")).toBe(true);
  });

  it("returns true on breve and caret + underscore", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "qui^_s")).toBe(true);
  });

  it("returns true on unmarked and breve combiner", () => {
    expect(Vowels.haveCompatibleLength("quĭs", "quis")).toBe(true);
  });

  it("returns true on unmarked and caret", () => {
    expect(Vowels.haveCompatibleLength("qui^s", "quis")).toBe(true);
  });

  it("returns true with mix", () => {
    expect(Vowels.haveCompatibleLength("qĭŭs", "qĭŭs")).toBe(true);
  });
});
