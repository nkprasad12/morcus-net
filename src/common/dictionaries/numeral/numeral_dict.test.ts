import {
  NumeralDict,
  buildEntryFor,
} from "@/common/dictionaries/numeral/numeral_dict";
import { XmlNode } from "@/common/xml/xml_node";
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
      expect(result.entry).toBeInstanceOf(XmlNode);
      expect(result.entry.name).toBe("div");
      expect(result.entry.getAttr("id")).toBe("num1");
    });

    it("should include numeral data in the entry content", () => {
      const result = buildEntryFor(1);
      const table = result.entry.children[0] as XmlNode;
      expect(table.name).toBe("table");

      const arabicRow = table.children[0] as XmlNode;
      const arabicCells = arabicRow.children;
      expect(XmlNode.assertIsNode(arabicCells[0]).children[0]).toBe("Arabic");
      expect(XmlNode.assertIsNode(arabicCells[1]).children[0]).toBe("1");

      const cardinalRow = table.children[1] as XmlNode;
      const cardinalCells = cardinalRow.children;
      expect(XmlNode.assertIsNode(cardinalCells[0]).children[0]).toBe(
        "Cardinal"
      );
      expect(XmlNode.assertIsNode(cardinalCells[1]).children[0]).toBe("unus");
    });
  });
});
