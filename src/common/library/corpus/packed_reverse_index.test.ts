import { packSortedNats } from "@/common/bytedata/packing";
import type { PackedIndexData } from "@/common/library/corpus/corpus_common";
import { PackedReverseIndex } from "@/common/library/corpus/packed_reverse_index";

describe("PackedReverseIndex", () => {
  const upperBound = 1000;

  describe("with packed array data", () => {
    let index: PackedReverseIndex<string>;
    const values = [10, 20, 30, 100, 200];
    const packedData = packSortedNats(values);
    const packedMap = new Map<string, PackedIndexData>([
      ["testKey", packedData],
    ]);

    beforeEach(() => {
      index = new PackedReverseIndex(packedMap);
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
      bitmask[v >> 5] |= 1 << (31 - (v & 31));
    });
    const packedData: PackedIndexData = { format: "bitmask", data: bitmask };
    const packedMap = new Map<string, PackedIndexData>([
      ["testKey", packedData],
    ]);

    beforeEach(() => {
      index = new PackedReverseIndex(packedMap);
    });

    it("formatOf() should return 'bitmask'", () => {
      expect(index.formatOf("testKey")).toBe("bitmask");
    });

    it("keys() should return all keys", () => {
      expect(Array.from(index.keys())).toEqual(["testKey"]);
    });
  });
});
