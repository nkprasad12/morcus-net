import {
  DICT_BIT_REGISTRY,
  encodeDictBitmask,
  decodeDictBitmask,
  LATIN_SOURCE_DICT_KEYS,
  LATIN_SOURCE_DICT_BITMASK,
} from "@/web/v2/dict/dict_bitmask.common";

describe("dict_bitmask.common", () => {
  it("encodes and decodes single dictionary key", () => {
    const encoded = encodeDictBitmask(["L&S"]);
    expect(encoded).toBe("1");
    expect(decodeDictBitmask(encoded)).toEqual(["L&S"]);
  });

  it("encodes and decodes all 9 available dictionaries", () => {
    const all = [...DICT_BIT_REGISTRY];
    const encoded = encodeDictBitmask(all);
    // 2^9 - 1 = 511 -> 511.toString(36) === "e7"
    expect(encoded).toBe("e7");
    expect(encoded.length).toBe(2);
    expect(decodeDictBitmask(encoded)).toEqual(all);
  });

  it("encodes default set (all except Pozo/EGL)", () => {
    const defaultSet = DICT_BIT_REGISTRY.filter((k) => k !== "EGL");
    const encoded = encodeDictBitmask(defaultSet);
    // (511 - 128) = 383 -> 383.toString(36) === "an"
    expect(encoded).toBe("an");
    expect(encoded.length).toBe(2);
    expect(decodeDictBitmask(encoded)).toEqual(defaultSet);
  });

  it("is case-insensitive during decoding and alias resolution", () => {
    expect(decodeDictBitmask("AN")).toEqual(
      DICT_BIT_REGISTRY.filter((k) => k !== "EGL")
    );
    expect(decodeDictBitmask("e7")).toEqual([...DICT_BIT_REGISTRY]);
    expect(encodeDictBitmask(["ls", "gaffiot"])).toBe(
      encodeDictBitmask(["L&S", "GAF"])
    );
  });

  it("safely handles forward-compatible higher bits beyond registry", () => {
    // 511 | (1 << 15) = 33279 -> 33279.toString(36) === "pof"
    const higherBits = (511 | (1 << 15)).toString(36);
    expect(decodeDictBitmask(higherBits)).toEqual([...DICT_BIT_REGISTRY]);
  });

  it("exports LATIN_SOURCE_DICT_KEYS and LATIN_SOURCE_DICT_BITMASK correctly", () => {
    expect(encodeDictBitmask(LATIN_SOURCE_DICT_KEYS)).toBe(
      LATIN_SOURCE_DICT_BITMASK
    );
    expect(LATIN_SOURCE_DICT_BITMASK).toBe("7j");
    expect(decodeDictBitmask(LATIN_SOURCE_DICT_BITMASK)).toEqual([
      "L&S",
      "GAF",
      "GES",
      "FOR",
      "NUM",
    ]);
  });

  it("returns null for invalid inputs", () => {
    expect(decodeDictBitmask("")).toBeNull();
    expect(decodeDictBitmask("   ")).toBeNull();
    expect(decodeDictBitmask("0")).toBeNull();
    expect(decodeDictBitmask(null)).toBeNull();
    expect(decodeDictBitmask(undefined)).toBeNull();
  });
});
