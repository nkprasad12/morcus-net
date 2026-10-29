import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  DICT_BIT_REGISTRY,
  DICT_SOURCE_LANG,
} from "@/web/ui/dict/settings/dict_bitmask.common";

describe("dict_bitmask.common invariants", () => {
  it("keeps DICT_SOURCE_LANG keys aligned in exact order with DICT_BIT_REGISTRY", () => {
    expect(Object.keys(DICT_SOURCE_LANG)).toEqual(DICT_BIT_REGISTRY);
  });

  it("covers the exact same set of dictionary keys as LatinDict.AVAILABLE", () => {
    expect(new Set(DICT_BIT_REGISTRY)).toEqual(
      new Set(LatinDict.AVAILABLE.map((d) => d.key))
    );
  });

  it("matches every dictionary's source language in LatinDict.AVAILABLE", () => {
    for (const d of LatinDict.AVAILABLE) {
      expect(DICT_SOURCE_LANG[d.key]).toBe(d.languages.from);
    }
  });

  it("ensures every non-Latin, non-wildcard dictionary targets Latin", () => {
    for (const d of LatinDict.AVAILABLE) {
      if (d.languages.from !== "La" && d.languages.from !== "*") {
        expect(d.languages.to).toBe("La");
      }
    }
  });
});
