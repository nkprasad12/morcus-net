import { packSortedNats } from "@/common/bytedata/packing";
import type { PackedBitMask } from "@/common/library/corpus/corpus_common";
import {
  applyAndWithArrays,
  applyAndWithBitmaskAndArray,
  applyAndWithBitmasks,
  applyAndToIndices,
  unpackPackedIndexData,
  hasValueInRange,
  toBitMask,
  smearBitmask,
  findFuzzyMatchesWithArrays,
  maxElementsIn,
  findFuzzyMatchesWithBitmasks,
} from "@/common/library/corpus/corpus_byte_utils";

function bitMaskToBooleanArray(bitmask: Uint32Array): boolean[] {
  const unpacked = unpackPackedIndexData({ format: "bitmask", data: bitmask });
  const result = new Array(bitmask.length * 32).fill(false);
  for (let i = 0; i < unpacked.length; i++) {
    result[unpacked[i]] = true;
  }
  return result;
}

function booleanArrayToBitMask(bits: boolean[]): Uint32Array {
  return toBitMask(
    bits
      .map((v, i) => [v, i] as [boolean, number])
      .filter(([v]) => v)
      .map(([_, i]) => i),
    bits.length
  );
}

function applyAndWithBooleanArrays(
  first: boolean[],
  second: boolean[],
  offset: number
): boolean[] {
  const result: boolean[] = [];
  for (let i = 0; i < first.length; i++) {
    result.push(first[i] && (second[i - offset] ?? false));
  }
  return result;
}

describe("All `applyAnd` data types make equal results", () => {
  test.each([[0], [1], [2], [3], [4], [8], [16], [32], [33]])(
    "with data at offset %d",
    (offset) => {
      const first: PackedBitMask = {
        format: "bitmask",
        data: Uint32Array.of(0xd1a1c613, 0xf931e3ab),
      };
      const second: PackedBitMask = {
        format: "bitmask",
        data: Uint32Array.of(0x8363063b, 0x4fa44a4a),
      };

      const resultBitmasks: PackedBitMask = {
        format: "bitmask",
        data: applyAndWithBitmasks(first.data, second.data, offset),
      };
      const resultBitmaskArray = applyAndWithBitmaskAndArray(
        first.data,
        unpackPackedIndexData(second),
        offset
      );
      const resultArrays = applyAndWithArrays(
        unpackPackedIndexData(first),
        unpackPackedIndexData(second),
        offset
      );

      // console.log("Result Bitmasks: ", unpackPackedIndexData(resultBitmasks));
      // console.log("Result Bitmask Array: ", resultBitmaskArray);
      // console.log("Result Arrays: ", resultArrays);
      expect(resultBitmaskArray).toEqual(resultArrays);
      expect(unpackPackedIndexData(resultBitmasks)).toEqual(resultBitmaskArray);
    }
  );
});

describe("applyAndWithBitmasks", () => {
  function bitsToStr(bits: boolean[]): string {
    return bits.map((v) => (v ? "1" : "0")).join("");
  }

  function verifyResults(a: Uint32Array, b: Uint32Array, offset: number) {
    const result = applyAndWithBitmasks(a, b, offset);
    const aBits = bitMaskToBooleanArray(a);
    const bBits = bitMaskToBooleanArray(b);
    const expectedBits = applyAndWithBooleanArrays(aBits, bBits, offset);
    expect(bitsToStr(bitMaskToBooleanArray(result))).toEqual(
      bitsToStr(expectedBits)
    );
  }

  it("returns correct AND with no offset", () => {
    const a = Uint32Array.of(
      0b10101010111100001100110000001111,
      0b11110000101010101100110000001111
    );
    const b = Uint32Array.of(
      0b11001100000011111111000010101010,
      0b00001111111100001010101001010101
    );
    verifyResults(a, b, 0);
  });

  it("returns correct AND with word offset", () => {
    const a = Uint32Array.of(0xffffffff, 0xffffffff);
    const b = Uint32Array.of(0x80000001, 0xaaaaaaaa);
    verifyResults(a, b, 32);
  });

  it("returns correct AND with bit offset within word", () => {
    const a = Uint32Array.of(0xffffffff, 0xffffffff);
    const b = Uint32Array.of(0xaaaaaaaa, 0xaaaaaaaa);
    verifyResults(a, b, 4);
  });

  it("returns all zeros if the mask is all zeros", () => {
    const a = Uint32Array.of(0xffffffff, 0xffffffff, 0xffffffff);
    const b = Uint32Array.of(0x0, 0x0, 0x0);
    verifyResults(a, b, 0);
  });

  it("returns all zeros if offset is out of bounds", () => {
    const a = Uint32Array.of(0xffffffff, 0xffffffff);
    const b = Uint32Array.of(0xffffffff, 0xffffffff);
    verifyResults(a, b, 64); // offset beyond b's length
  });

  it("handles empty arrays", () => {
    expect(
      Array.from(
        applyAndWithBitmasks(new Uint32Array([]), new Uint32Array([]), 0)
      )
    ).toEqual([]);
  });

  it("returns correct AND for data above 64 bits with no offset", () => {
    const a = Uint32Array.of(
      0b11110000101010101100110000001111,
      0b11111111000011110000111100001111,
      0b10101010101010101010101010101010
    );
    const b = Uint32Array.of(
      0b00001111111111111010101001010101,
      0b11111111000011110000111100001111,
      0b11000011110000111100001111000011
    );
    verifyResults(a, b, 0);
  });

  it("returns correct AND for data above 64 bits with offset", () => {
    const a = Uint32Array.of(
      0b11110000101010101100110000001111,
      0b11111111000011110000111100001111,
      0b10101010101010101010101010101010
    );
    const b = Uint32Array.of(
      0b00001111111111111010101001010101,
      0b11111111000011110000111100001111,
      0b11000011110000111100001111000011
    );
    verifyResults(a, b, 1);
  });

  it("returns correct AND for data above 64 bits with greater than word offset", () => {
    const a = Uint32Array.of(
      0b11110000101010101100110000001111,
      0b11111111000011110000111100001111,
      0b10101010101010101010101010101010
    );
    const b = Uint32Array.of(
      0b00001111111111111010101001010101,
      0b11111111000011110000111100001111,
      0b11000011110000111100001111000011
    );
    verifyResults(a, b, 33);
  });
});

describe("applyAndWithBitmaskAndArray", () => {
  it("returns correct intersection with no offset", () => {
    const bitmask = booleanArrayToBitMask([
      false,
      true,
      false,
      true,
      true,
      false,
    ]); // bits 1, 3, 4 are set
    const indices = [0, 1, 2, 4, 6];
    const offset = 0;
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([1, 4]);
  });

  it("returns correct intersection with a positive offset", () => {
    const bitmask = booleanArrayToBitMask([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
    ]); // bits 1, 3, 4, 6 are set
    const indices = [0, 2, 3, 6];
    const offset = 1;
    // indices + offset = [1, 3, 4, 7]
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([1, 3, 4]);
  });

  it("returns correct intersection with a negative offset", () => {
    const bitmask = booleanArrayToBitMask([
      false,
      true,
      false,
      true,
      true,
      false,
    ]); // bits 1, 3, 4 are set
    const indices = [1, 4, 5, 7];
    const offset = -1;
    // indices + offset = [0, 3, 4, 6]
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([3, 4]);
  });

  it("handles indices that go out of bounds", () => {
    const bitmask = booleanArrayToBitMask(new Array(32).fill(true));
    const indices = [-2, 0, 31, 32, 50];
    const offset = 1;
    // indices + offset = [-1, 1, 32, 33, 51]
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([1]); // only 1 is in bounds [0, 31]
  });

  it("handles empty indices array", () => {
    const bitmask = booleanArrayToBitMask([true, true, true]);
    const indices: number[] = [];
    const offset = 0;
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([]);
  });

  it("handles empty bitmask", () => {
    const bitmask = new Uint32Array([]);
    const indices = [0, 1, 2];
    const offset = 0;
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([]);
  });

  it("works with bitmasks larger than 32 bits", () => {
    const bools = new Array(70).fill(false);
    bools[31] = true;
    bools[32] = true;
    bools[65] = true;
    const bitmask = booleanArrayToBitMask(bools);
    const indices = [30, 31, 32, 33, 64, 65, 66];
    const offset = 0;
    const result = applyAndWithBitmaskAndArray(bitmask, indices, offset);
    expect(result).toEqual([31, 32, 65]);
  });
});

describe("applyAndWithArrays", () => {
  it("returns correct intersection with no offset", () => {
    const first = [1, 3, 5, 8, 10];
    const second = [3, 4, 5, 9, 10];
    const offset = 0;
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([3, 5, 10]);
  });

  it("returns correct intersection with a positive offset", () => {
    const first = [3, 5, 9, 12];
    const second = [1, 3, 7, 10];
    const offset = 2;
    // second + offset = [3, 5, 9, 12]
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([3, 5, 9, 12]);
  });

  it("returns correct intersection with a negative offset", () => {
    const first = [1, 3, 7, 10];
    const second = [3, 5, 9, 12];
    const offset = -2;
    // second + offset = [1, 3, 7, 10]
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([1, 3, 7, 10]);
  });

  it("handles empty first array", () => {
    const first: number[] = [];
    const second = [1, 2, 3];
    const offset = 0;
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([]);
  });

  it("handles empty second array", () => {
    const first = [1, 2, 3];
    const second: number[] = [];
    const offset = 0;
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([]);
  });

  it("handles both arrays being empty", () => {
    const first: number[] = [];
    const second: number[] = [];
    const offset = 0;
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([]);
  });

  it("returns an empty array when there is no intersection", () => {
    const first = [1, 2, 3];
    const second = [4, 5, 6];
    const offset = 0;
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([]);
  });

  it("handles arrays of different lengths", () => {
    const first = [1, 5, 10, 15, 20, 25];
    const second = [0, 10, 20];
    const offset = 5;
    // second + offset = [5, 15, 25]
    const result = applyAndWithArrays(first, second, offset);
    expect(result).toEqual([5, 15, 25]);
  });
});

describe("filterCandidates", () => {
  describe("when both candidates and filter are arrays", () => {
    it("should return correct intersection with no offset", () => {
      const candidates = packSortedNats([1, 3, 5, 8]);
      const filterData = packSortedNats([3, 5, 9]);
      const [result, position] = applyAndToIndices(
        candidates,
        0,
        filterData,
        0
      );
      expect(result).toEqual([3, 5]);
      expect(position).toBe(0);
    });

    it("should return correct intersection with no offset but with positions", () => {
      const candidates = packSortedNats([1, 3, 5, 8]);
      const filterData = packSortedNats([3, 5, 9]);
      const [result, position] = applyAndToIndices(
        candidates,
        2,
        filterData,
        2
      );
      expect(result).toEqual([3, 5]);
      expect(position).toBe(2);
    });

    it("should return correct intersection with a positive offset", () => {
      const candidates = packSortedNats([3, 6, 9]);
      const filterData = packSortedNats([2, 4, 8]);
      const [result, position] = applyAndToIndices(
        candidates,
        2,
        filterData,
        1
      );
      expect(result).toEqual([3, 9]);
      expect(position).toBe(2);
    });

    it("should return correct intersection with a negative offset", () => {
      const candidates = packSortedNats([3, 4, 8, 9]);
      const filterData = packSortedNats([1, 3, 6, 9]);
      const [result, position] = applyAndToIndices(
        candidates,
        1,
        filterData,
        3
      );
      expect(result).toEqual([4]);
      expect(position).toBe(1);
    });
  });

  // Case 2: Bitmask and Array
  describe("when candidates is a bitmask and filter is an array", () => {
    it("should return correct intersection with no offset", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]), // 1, 3, 4
      };
      const filterData = packSortedNats([1, 2, 4]);
      const [result, position] = applyAndToIndices(
        candidates,
        0,
        filterData,
        0
      );
      expect(result).toEqual([1, 4]);
      expect(position).toBe(0);
    });

    it("should return correct intersection with no offset but with positions", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]), // 1, 3, 4
      };
      const filterData = packSortedNats([1, 2, 4]);
      const [result, position] = applyAndToIndices(
        candidates,
        1,
        filterData,
        1
      );
      expect(result).toEqual([1, 4]);
      expect(position).toBe(1);
    });

    it("should return correct intersection with a positive offset", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]), // 1, 3, 4
      };
      const filterData = packSortedNats([0, 2, 3]);
      const [result, position] = applyAndToIndices(
        candidates,
        1,
        filterData,
        0
      ); // offset = 1
      expect(result).toEqual([1, 3, 4]);
      expect(position).toBe(1);
    });
  });

  // Case 3: Array and Bitmask
  describe("when candidates is an array and filter is a bitmask", () => {
    it("should return correct intersection with no offset", () => {
      const candidates = packSortedNats([1, 2, 4]);
      const filterData: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]), // 1, 3, 4
      };
      const [result, position] = applyAndToIndices(
        candidates,
        0,
        filterData,
        0
      );
      expect(result).toEqual([1, 4]);
      expect(position).toBe(0);
    });

    it("should return correct intersection with a negative offset", () => {
      const candidates = packSortedNats([0, 2, 3]);
      const filterData: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]), // 1, 3, 4
      };
      const [result, position] = applyAndToIndices(
        candidates,
        0,
        filterData,
        1
      ); // offset = -1
      expect(result).toEqual([1, 3, 4]);
      expect(position).toBe(1);
    });
  });

  // Case 4: Bitmask and Bitmask
  describe("when both candidates and filter are bitmasks", () => {
    it("should return correct intersection with no offset", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: Uint32Array.of(0b10101010111100001100110000001111),
      };
      const filterData: PackedBitMask = {
        format: "bitmask",
        data: Uint32Array.of(0b11001100000011111111000010101010),
      };
      const [result, position] = applyAndToIndices(
        candidates,
        0,
        filterData,
        0
      );
      const expectedData = Uint32Array.of(0b10001000000000001100000000001010);
      expect(result).toEqual({ format: "bitmask", data: expectedData });
      expect(position).toBe(0);
    });

    it("should return correct intersection with a positive offset", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]),
      };
      const filterData: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([true, false, true, false, true]),
      };
      const [result, position] = applyAndToIndices(
        candidates,
        3,
        filterData,
        2
      );
      const expectedData = Uint32Array.of(0b01010000000000000000000000000000);
      expect(result).toEqual({ format: "bitmask", data: expectedData });
      expect(position).toBe(3);
    });

    it("should return correct intersection with a negative offset", () => {
      const candidates: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([false, true, false, true, true]),
      };
      const filterData: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask([true, false, true, false, true]),
      };
      const [result, position] = applyAndToIndices(
        candidates,
        2,
        filterData,
        3
      );
      const expectedData = Uint32Array.of(0b00101000000000000000000000000000);
      expect(result).toEqual({ format: "bitmask", data: expectedData });
      expect(position).toBe(3);
    });
  });

  describe("unpackPackedIndexData", () => {
    it("should return an empty array if packedData is undefined", () => {
      const result = unpackPackedIndexData(undefined);
      expect(result).toEqual([]);
    });

    it("should unpack an array of of packed integers", () => {
      const originalData = [10, 25, 150, 300];
      const packedData = packSortedNats(originalData);
      const result = unpackPackedIndexData(packedData);
      expect(result).toEqual(originalData);
    });

    it("should unpack a bitmask", () => {
      const bools = new Array(70).fill(false);
      bools[31] = true;
      bools[32] = true;
      bools[65] = true;
      const packedData: PackedBitMask = {
        format: "bitmask",
        data: booleanArrayToBitMask(bools),
      };
      const result = unpackPackedIndexData(packedData);
      expect(result).toEqual([31, 32, 65]);
    });
  });
});

describe("hasValueInRange", () => {
  it("returns false for undefined packedData", () => {
    expect(hasValueInRange(undefined, [0, 10])).toBe(false);
  });

  it("returns false for invalid range (start > end)", () => {
    const bitmask = toBitMask([1, 2, 3], 10);
    expect(hasValueInRange({ format: "bitmask", data: bitmask }, [5, 2])).toBe(
      false
    );
  });

  it("returns true if any value in range is set (bitmask)", () => {
    const bitmask: PackedBitMask = {
      format: "bitmask",
      data: toBitMask([2, 5, 8], 10),
    };
    expect(hasValueInRange(bitmask, [5, 5])).toBe(true);
    expect(hasValueInRange(bitmask, [2, 2])).toBe(true);
    expect(hasValueInRange(bitmask, [7, 9])).toBe(true);
    expect(hasValueInRange(bitmask, [0, 1])).toBe(false);
    expect(hasValueInRange(bitmask, [6, 7])).toBe(false);
  });

  it("returns true if any value in range is set (packed array)", () => {
    const packedArray = packSortedNats([2, 5, 8]);
    expect(hasValueInRange(packedArray, [5, 5])).toBe(true);
    expect(hasValueInRange(packedArray, [2, 2])).toBe(true);
    expect(hasValueInRange(packedArray, [7, 9])).toBe(true);
    expect(hasValueInRange(packedArray, [0, 1])).toBe(false);
    expect(hasValueInRange(packedArray, [6, 7])).toBe(false);
  });

  it("returns false for empty bitmask", () => {
    const bitmask = toBitMask([], 10);
    expect(hasValueInRange({ format: "bitmask", data: bitmask }, [0, 9])).toBe(
      false
    );
  });

  it("returns false for empty packed array", () => {
    expect(hasValueInRange([] as any, [0, 9])).toBe(false);
  });
});

describe("smearBitmask", () => {
  it("should smear to the right within a single word", () => {
    const original = toBitMask([5], 64); // 0...1000... at bit 5
    const smeared = smearBitmask(original, 3, "right");
    // Expect bits 5, 6, 7, 8 to be set
    const expected = toBitMask([5, 6, 7, 8], 64);
    expect(smeared).toEqual(expected);
  });

  it("should smear to the left within a single word", () => {
    const original = toBitMask([5], 64); // 0...1000... at bit 5
    const smeared = smearBitmask(original, 3, "left");
    // Expect bits 2, 3, 4, 5 to be set
    const expected = toBitMask([2, 3, 4, 5], 64);
    expect(smeared).toEqual(expected);
  });

  it("should smear in both directions within a single word", () => {
    const original = toBitMask([5], 64);
    const smeared = smearBitmask(original, 2, "both");
    // Expect bits 3, 4, 5, 6, 7 to be set
    const expected = toBitMask([3, 4, 5, 6, 7], 64);
    expect(smeared).toEqual(expected);
  });

  it("should smear to the right across word boundaries", () => {
    const original = toBitMask([30], 64);
    const smeared = smearBitmask(original, 3, "right");
    // Expect bits 30, 31, 32, 33 to be set
    const expected = toBitMask([30, 31, 32, 33], 64);
    expect(smeared).toEqual(expected);
  });

  it("should smear to the left across word boundaries", () => {
    const original = toBitMask([33], 64);
    const smeared = smearBitmask(original, 3, "left");
    // Expect bits 30, 31, 32, 33 to be set
    const expected = toBitMask([30, 31, 32, 33], 64);
    expect(smeared).toEqual(expected);
  });

  it("should smear in both directions across word boundaries", () => {
    const original = toBitMask([31], 64);
    const smeared = smearBitmask(original, 2, "both");
    // Expect bits 29, 30, 31, 32, 33 to be set
    const expected = toBitMask([29, 30, 31, 32, 33], 64);
    expect(smeared).toEqual(expected);
  });

  it("should handle multiple bits set, smearing right", () => {
    const original = toBitMask([5, 15], 64);
    const smeared = smearBitmask(original, 2, "right");
    const expected = toBitMask([5, 6, 7, 15, 16, 17], 64);
    expect(smeared).toEqual(expected);
  });

  it("should handle multiple bits set, smearing left", () => {
    const original = toBitMask([5, 15], 64);
    const smeared = smearBitmask(original, 2, "left");
    const expected = toBitMask([3, 4, 5, 13, 14, 15], 64);
    expect(smeared).toEqual(expected);
  });

  it("should handle multiple bits set, smearing both", () => {
    const original = toBitMask([5, 15], 64);
    const smeared = smearBitmask(original, 1, "both");
    const expected = toBitMask([4, 5, 6, 14, 15, 16], 64);
    expect(smeared).toEqual(expected);
  });

  it("should handle overlapping smears", () => {
    const original = toBitMask([5, 8], 64);
    const smeared = smearBitmask(original, 2, "right");
    // Smear from 5: [5, 6, 7]. Smear from 8: [8, 9, 10].
    const expected = toBitMask([5, 6, 7, 8, 9, 10], 64);
    expect(smeared).toEqual(expected);
  });

  it("should handle overlapping smears with 'both'", () => {
    const original = toBitMask([5, 8], 64);
    const smeared = smearBitmask(original, 2, "both");
    // Smear from 5: [3,4,5,6,7]. Smear from 8: [6,7,8,9,10].
    const expected = toBitMask([3, 4, 5, 6, 7, 8, 9, 10], 64);
    expect(smeared).toEqual(expected);
  });
});

describe("findFuzzyMatchesWithArrays", () => {
  it("should handle multiple consecutive `first` elements matching one `second` element (both)", () => {
    const first = [10, 11];
    const second = [9];
    const offset = 0;
    const maxDistance = 2;
    // The match window for `second` element 9 is [7, 11].
    // Both 10 and 11 from `first` fall within this window.
    expect(
      findFuzzyMatchesWithArrays(first, second, offset, maxDistance, "both")
    ).toEqual([10, 11]);
  });

  it("should return an empty array if the first array is empty", () => {
    expect(findFuzzyMatchesWithArrays([], [1, 2, 3], 0, 1, "both")).toEqual([]);
  });

  it("should return an empty array if the second array is empty", () => {
    expect(findFuzzyMatchesWithArrays([1, 2, 3], [], 0, 1, "both")).toEqual([]);
  });

  it("should return an empty array if no matches are found", () => {
    expect(
      findFuzzyMatchesWithArrays([1, 2, 3], [10, 11, 12], 0, 1, "both")
    ).toEqual([]);
  });

  it("should find exact matches with zero offset and zero distance", () => {
    expect(
      findFuzzyMatchesWithArrays([1, 5, 10], [1, 6, 10], 0, 0, "both")
    ).toEqual([1, 10]);
  });

  it("should find exact matches with a non-zero offset and zero distance", () => {
    expect(
      findFuzzyMatchesWithArrays([3, 7, 12], [1, 6, 10], 2, 0, "both")
    ).toEqual([3, 12]);
  });

  it("should find fuzzy matches with a zero offset (both)", () => {
    // second becomes [1, 12].
    // 3 is in range of 1 (1-2 to 1+2 => [-1, 3]).
    // 8,9 are not in range of 12 (12-2 to 12+2 => [10, 14]).
    expect(
      findFuzzyMatchesWithArrays([3, 8, 9], [0, 11], 1, 2, "both")
    ).toEqual([3]);
  });

  it("should find fuzzy matches with a non-zero offset (both)", () => {
    // second becomes [4, 9, 19].
    // 5 is in range of 4. 10 is in range of 9. 15 is not in range of 19.
    expect(
      findFuzzyMatchesWithArrays([5, 10, 15], [3, 8, 18], 1, 1, "both")
    ).toEqual([5, 10]);
  });

  it("should handle multiple matches for a single element in the first array (both)", () => {
    // first: [10], second: [8, 9, 10] -> offset 0, dist 1.
    // second vals are 8,9,10. 10 matches all of them.
    expect(findFuzzyMatchesWithArrays([10], [8, 9, 10], 0, 1, "both")).toEqual([
      10,
    ]);
  });

  it("should handle multiple matches for a single element in the second array (both)", () => {
    // first: [8, 9, 10], second: [9] -> offset 0, dist 1.
    // second val is 9. Its range [8, 10] matches all elements in first.
    expect(findFuzzyMatchesWithArrays([8, 9, 10], [9], 0, 1, "both")).toEqual([
      8, 9, 10,
    ]);
  });

  it("should handle overlapping fuzzy matches (both)", () => {
    // first: [5, 6], second: [7], offset: 0, dist: 2.
    // second val is 7. Its range [5, 9] matches both 5 and 6.
    expect(findFuzzyMatchesWithArrays([5, 6], [7], 0, 2, "both")).toEqual([
      5, 6,
    ]);
  });

  it("should handle complex cases with multiple overlapping matches (both)", () => {
    // first: [10, 11, 15, 20], second: [12, 18], offset: 0, dist: 2.
    // second val 12: range [10, 14]. Matches 10, 11.
    // second val 18: range [16, 20]. Matches 20. (15 is not in range).
    expect(
      findFuzzyMatchesWithArrays([10, 11, 15, 20], [12, 18], 0, 2, "both")
    ).toEqual([10, 11, 20]);
  });

  it("should handle another complex case correctly (both)", () => {
    const first = [10, 20, 30, 40, 50];
    const second = [12, 33, 48];
    // second val 12: range [9, 15]. Matches 10.
    // second val 33: range [30, 36]. Matches 30.
    // second val 48: range [45, 51]. Matches 50.
    expect(findFuzzyMatchesWithArrays(first, second, 0, 3, "both")).toEqual([
      10, 30, 50,
    ]);
  });

  it("should handle the case from the original code comments (both)", () => {
    // first: [3, 8, 9], second: [0, 11], offset: 1, maxDistance: 2.
    // second becomes [1, 12].
    // second val 1: range [-1, 3]. Matches 3.
    // second val 12: range [10, 14]. No matches.
    expect(
      findFuzzyMatchesWithArrays([3, 8, 9], [0, 11], 1, 2, "both")
    ).toEqual([3]);
  });

  it("should find fuzzy matches with direction 'right'", () => {
    // second val 5: range [5, 7]. Matches 5, 7.
    // second val 10: range [10, 12]. Matches 10.
    expect(
      findFuzzyMatchesWithArrays([5, 7, 9, 10], [5, 10], 0, 2, "right")
    ).toEqual([5, 7, 10]);
  });

  it("should find fuzzy matches with direction 'left'", () => {
    // second val 5: range [3, 5]. Matches 3, 5.
    // second val 10: range [8, 10]. Matches 9, 10.
    expect(
      findFuzzyMatchesWithArrays([3, 5, 7, 9, 10], [5, 10], 0, 2, "left")
    ).toEqual([3, 5, 9, 10]);
  });

  it("should find no matches if direction restricts range (right)", () => {
    // second val 10: range [10, 12]. No match for 9.
    expect(findFuzzyMatchesWithArrays([9], [10], 0, 2, "right")).toEqual([]);
  });

  it("should find no matches if direction restricts range (left)", () => {
    // second val 10: range [8, 10]. No match for 11.
    expect(findFuzzyMatchesWithArrays([11], [10], 0, 2, "left")).toEqual([]);
  });
});

describe("maxElementsIn", () => {
  it("should return 0 for undefined packedData", () => {
    expect(maxElementsIn(undefined)).toBe(0);
  });

  it("should return the number of elements for a packed array", () => {
    const data = [1, 5, 10, 20, 100];
    const packedData = packSortedNats(data);
    expect(maxElementsIn(packedData)).toBe(data.length);
  });

  it("should return 0 for an empty packed array", () => {
    const packedData = packSortedNats([]);
    expect(maxElementsIn(packedData)).toBe(0);
  });

  it("should return numSet when it is defined in a PackedBitMask", () => {
    const packedData: PackedBitMask = {
      format: "bitmask",
      data: new Uint32Array([1, 2, 3]),
      numSet: 42,
    };
    expect(maxElementsIn(packedData)).toBe(42);
  });

  it("should return the total possible bits when numSet is not defined", () => {
    const packedData: PackedBitMask = {
      format: "bitmask",
      data: new Uint32Array(3), // 3 words * 32 bits/word = 96
    };
    expect(maxElementsIn(packedData)).toBe(96);
  });

  it("should return 0 for a bitmask with an empty data array and no numSet", () => {
    const packedData: PackedBitMask = {
      format: "bitmask",
      data: new Uint32Array([]),
    };
    expect(maxElementsIn(packedData)).toBe(0);
  });
});

describe("findFuzzyMatchesWithBitmasks", () => {
  const runTest = (
    firstIndices: number[],
    secondIndices: number[],
    offset: number,
    maxDistance: number,
    direction: "left" | "right" | "both",
    expectedIndices: number[],
    size = 64
  ) => {
    const first = toBitMask(firstIndices, size);
    const second = toBitMask(secondIndices, size);
    const resultBitmask = findFuzzyMatchesWithBitmasks(
      first,
      second,
      offset,
      maxDistance,
      direction
    );
    const resultIndices = unpackPackedIndexData({
      format: "bitmask",
      data: resultBitmask,
    });
    expect(resultIndices).toEqual(expectedIndices);
  };

  it("should find matches with direction 'right'", () => {
    // second[3] smeared right by 2 becomes [3,4,5].
    // first[5] intersects with smeared second.
    runTest([5], [3], 0, 2, "right", [5]);
  });

  it("should find matches with direction 'right' and an offset", () => {
    // second[3] + offset(1) = 4. Smeared right by 2 becomes [4,5,6].
    // first[5] intersects.
    runTest([5], [3], 1, 2, "right", [5]);
  });

  it("should find matches with direction 'left'", () => {
    // second[5] smeared left by 2 becomes [3,4,5].
    // first[3] intersects.
    runTest([3], [5], 0, 2, "left", [3]);
  });

  it("should find matches with direction 'left' and an offset", () => {
    // second[5] + offset(1) = 6. Smeared left by 2 becomes [4,5,6].
    // first[5] intersects.
    runTest([5], [5], 1, 2, "left", [5]);
  });

  it("should find matches with direction 'both'", () => {
    // second[5] smeared both by 2 becomes [3,4,5,6,7].
    // first[3] and first[7] intersect.
    runTest([3, 7], [5], 0, 2, "both", [3, 7]);
  });

  it("should find matches with direction 'both' and an offset", () => {
    // second[5] + offset(1) = 6. Smeared both by 2 becomes [4,5,6,7,8].
    // first[4] and first[8] intersect.
    runTest([4, 8], [5], 1, 2, "both", [4, 8]);
  });

  it("should return an empty bitmask if no matches are found", () => {
    runTest([10], [1], 0, 2, "both", []);
  });

  it("should handle multiple bits and overlapping smears", () => {
    // second[5] smeared both by 2 -> [3,4,5,6,7]
    // second[10] smeared both by 2 -> [8,9,10,11,12]
    // first has bits at [3, 8, 13].
    // Match at 3 and 8.
    runTest([3, 8, 13], [5, 10], 0, 2, "both", [3, 8]);
  });

  it("should handle matches across word boundaries", () => {
    // second[30] + offset(0) = 30. Smeared both by 3 -> [27..33]
    // first has bits at [28, 32]. Both should match.
    runTest([28, 32], [30], 0, 3, "both", [28, 32]);
  });

  it("should handle matches across word boundaries with an offset", () => {
    // second[30] + offset(5) = 35. Smeared both by 3 -> [32..38]
    // first has bits at [33, 37]. Both should match.
    runTest([33, 37], [30], 5, 3, "both", [33, 37]);
  });

  it("should handle empty input bitmasks", () => {
    runTest([], [1, 2, 3], 0, 2, "both", []);
    runTest([1, 2, 3], [], 0, 2, "both", []);
    runTest([], [], 0, 2, "both", []);
  });
});
