import {
  NumeralDict,
  buildEntryFor,
} from "@/common/dictionaries/numeral/numeral_dict";
import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";

setupMorceusWithFakeData();

describe("NumeralDict", () => {
  let numeralDict: NumeralDict;

  beforeEach(() => {
    numeralDict = new NumeralDict();
  });

  describe("getEntry", () => {
    it("should return an entry for an Arabic numeral", async () => {
      const result = await numeralDict.getEntry("3");
      expect(result).toHaveLength(1);
      expect(result[0].outline.mainKey).toBe("3");
      expect(result[0].outline.mainSection.text).toBe("Numeral: 3");
      expect(result[0].outline.mainSection.sectionId).toBe("num3");
      expect(result[0].entry.toString()).toContain("III");
    });

    it("should return an entry for a Roman numeral", async () => {
      const result = await numeralDict.getEntry("IV");
      expect(result).toHaveLength(1);
      expect(result[0].outline.mainKey).toBe("4");
    });

    it("should return empty array for invalid input", async () => {
      const result = await numeralDict.getEntry("not a numeral");
      expect(result).toHaveLength(0);
    });

    it("should not treat Latin words made of numeral letters as numerals", async () => {
      expect(await numeralDict.getEntry("id")).toHaveLength(0);
      expect(await numeralDict.getEntry("dixi")).toHaveLength(0);
    });
  });

  describe("getEntryById", () => {
    it("should return an entry for a valid numeral id", async () => {
      const result = await numeralDict.getEntryById("num5");
      expect(result).toBeDefined();
      expect(result!.outline.mainKey).toBe("5");
    });

    it("should return undefined for an invalid id format", async () => {
      const result = await numeralDict.getEntryById("invalid-id");
      expect(result).toBeUndefined();
    });
  });

  describe("getCompletions", () => {
    it("should return an empty array", async () => {
      const result = await numeralDict.getCompletions("3");
      expect(result).toEqual([]);
    });
  });

  describe("buildEntryFor", () => {
    it("should create an entry result with correct structure", () => {
      const result = buildEntryFor(1);
      expect(result.outline.mainKey).toBe("1");
      expect(result.outline.mainSection.sectionId).toBe("num1");
      expect(typeof result.entry).toBe("string");
      expect(result.entry).toContain('<table class="numeralTable">');
    });

    it("should include numeral data in the entry content", () => {
      const result = buildEntryFor(1);
      expect(result.entry).toContain(
        '<tr><td class="text md light">Arabic</td><td>1</td></tr>'
      );
      expect(result.entry).toContain(
        '<tr><td class="text md light">Cardinal</td><td>unus</td></tr>'
      );
    });
  });
});
