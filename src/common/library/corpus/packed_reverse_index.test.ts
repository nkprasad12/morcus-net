import { packIntegers } from "@/common/bytedata/packing";
import type { PackedIndexData } from "@/common/library/corpus/corpus_common";
import { PackedReverseIndex } from "@/common/library/corpus/packed_reverse_index";

describe("PackedReverseIndex", () => {
  const upperBound = 1000;

  describe("with packed array data", () => {
    let index: PackedReverseIndex<string>;
    const values = [10, 20, 30, 100, 200];
    const packedData = packIntegers(upperBound, values);
    const packedMap = new Map<string, PackedIndexData>([
      ["testKey", packedData],
    ]);

    beforeEach(() => {
      index = new PackedReverseIndex(packedMap, upperBound);
    });

    it("get() should unpack and return the correct values", () => {
      expect(index.get("testKey")).toEqual(values);
      expect(index.get("nonExistentKey")).toBeUndefined();
    });

    it("hasValueInRange() should correctly check for values in range", () => {
      expect(index.hasValueInRange("testKey", [25, 35])).toBe(true); // 30
      expect(index.hasValueInRange("testKey", [30, 30])).toBe(true);
      expect(index.hasValueInRange("testKey", [25, 29])).toBe(false);
      expect(index.hasValueInRange("nonExistentKey", [10, 20])).toBe(false);
      expect(index.hasValueInRange("testKey", [35, 25])).toBe(false); // Invalid range
    });

    it("filterCandidates() should filter candidates correctly", () => {
      const candidates = [15, 20, 25, 30, 35];
      expect(index.filterCandidates("testKey", candidates, {})).toEqual([
        20, 30,
      ]);
    });

    it("filterCandidates() should handle keepMisses option", () => {
      const candidates = [15, 20, 25, 30, 35];
      expect(
        index.filterCandidates("testKey", candidates, { keepMisses: true })
      ).toEqual([15, 25, 35]);
    });

    it("filterCandidates() should handle offset option", () => {
      const candidates = [115, 120, 125, 130, 135]; // offset by 100
      expect(
        index.filterCandidates("testKey", candidates, { offset: 100 })
      ).toEqual([120, 130]);
    });

    it("formatOf() should return undefined", () => {
      expect(index.formatOf("testKey")).toBeUndefined();
    });

    it("keys() should return all keys", () => {
      expect(Array.from(index.keys())).toEqual(["testKey"]);
    });
  });

  describe("with bitmask data", () => {
    let index: PackedReverseIndex<string>;
    const values = [2, 5, 8, 15];
    const bitmask = new Uint32Array(2); // enough for values up to 63
    values.forEach((v) => {
      bitmask[v >> 5] |= 1 << (v & 31);
    });
    const packedData: PackedIndexData = { format: "bitmask", data: bitmask };
    const packedMap = new Map<string, PackedIndexData>([
      ["testKey", packedData],
    ]);

    beforeEach(() => {
      index = new PackedReverseIndex(packedMap, upperBound);
    });

    it("get() should decode the bitmask and return correct values", () => {
      expect(index.get("testKey")).toEqual(values);
      expect(index.get("nonExistentKey")).toBeUndefined();
    });

    it("hasValueInRange() should correctly check for values in range", () => {
      expect(index.hasValueInRange("testKey", [4, 6])).toBe(true); // 5
      expect(index.hasValueInRange("testKey", [5, 5])).toBe(true);
      expect(index.hasValueInRange("testKey", [6, 7])).toBe(false);
      expect(index.hasValueInRange("nonExistentKey", [0, 100])).toBe(false);
      expect(index.hasValueInRange("testKey", [10, 4])).toBe(false); // Invalid range
    });

    it("filterCandidates() should filter candidates correctly", () => {
      const candidates = [1, 2, 3, 4, 5, 6];
      expect(index.filterCandidates("testKey", candidates, {})).toEqual([2, 5]);
    });

    it("filterCandidates() should handle keepMisses option", () => {
      const candidates = [1, 2, 3, 4, 5, 6];
      expect(
        index.filterCandidates("testKey", candidates, { keepMisses: true })
      ).toEqual([1, 3, 4, 6]);
    });

    it("filterCandidates() should handle offset option", () => {
      const candidates = [102, 105]; // offset by 100
      expect(
        index.filterCandidates("testKey", candidates, { offset: 100 })
      ).toEqual([102, 105]);
    });

    it("filterCandidates() should handle out-of-bounds candidates", () => {
      const candidates = [-1, 2, 20, 50]; // 20 and 50 are out of bitmask range
      expect(index.filterCandidates("testKey", candidates, {})).toEqual([2]);
    });

    it("formatOf() should return 'bitmask'", () => {
      expect(index.formatOf("testKey")).toBe("bitmask");
    });

    it("keys() should return all keys", () => {
      expect(Array.from(index.keys())).toEqual(["testKey"]);
    });
  });
});
