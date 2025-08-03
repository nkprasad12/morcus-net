import { packIntegers } from "@/common/bytedata/packing";
import type { PackedBitMask } from "@/common/library/corpus/corpus_common";
import {
  applyAndWithArrays,
  applyAndWithBitmaskAndArray,
  applyAndWithBitmasks,
  applyAndToIndices,
} from "@/common/library/corpus/corpus_byte_utils";

// Helper to convert Uint32Array to boolean[]
function bitMaskToBooleanArray(bitmask: Uint32Array): boolean[] {
  const result: boolean[] = [];
  for (let i = 0; i < bitmask.length * 32; i++) {
    const wordIndex = i >> 5; // i / 32
    const bitIndex = i & 31; // i % 32
    result.push((bitmask[wordIndex] & (1 << (31 - bitIndex))) !== 0);
  }
  return result;
}

// Helper to convert boolean[] to Uint32Array
function booleanArrayToBitMask(booleanArray: boolean[]): Uint32Array {
  const wordLength = Math.ceil(booleanArray.length / 32);
  const bitmask = new Uint32Array(wordLength);
  for (let i = 0; i < booleanArray.length; i++) {
    if (booleanArray[i]) {
      const wordIndex = i >> 5; // i / 32
      const bitIndex = i & 31; // i % 32
      bitmask[wordIndex] |= 1 << (31 - bitIndex);
    }
  }
  return bitmask;
}

function applyAndWithBooleanArrays(
  first: boolean[],
  second: boolean[],
  offset: number
): boolean[] {
  const result: boolean[] = [];
  for (let i = 0; i < first.length; i++) {
    result.push(first[i] && (second[i + offset] ?? false));
  }
  return result;
}

describe("applyAndWithBitmasks", () => {
  function verifyResults(a: Uint32Array, b: Uint32Array, offset: number) {
    const result = applyAndWithBitmasks(a, b, offset);
    const aBits = bitMaskToBooleanArray(a);
    const bBits = bitMaskToBooleanArray(b);
    const expectedBits = applyAndWithBooleanArrays(aBits, bBits, offset);
    const expectedResult = booleanArrayToBitMask(expectedBits);
    expect(Array.from(result)).toEqual(Array.from(expectedResult));
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
    const b = Uint32Array.of(0xaaaaaaaa, 0x55555555);
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
      const candidates = packIntegers(10, [1, 3, 5, 8]);
      const filterData = packIntegers(10, [3, 5, 9]);
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
      const candidates = packIntegers(10, [1, 3, 5, 8]);
      const filterData = packIntegers(10, [3, 5, 9]);
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
      const candidates = packIntegers(10, [3, 6, 9]);
      const filterData = packIntegers(10, [2, 4, 8]);
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
      const candidates = packIntegers(10, [3, 4, 8, 9]);
      const filterData = packIntegers(10, [1, 3, 6, 9]);
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
      const filterData = packIntegers(5, [1, 2, 4]);
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
      const filterData = packIntegers(5, [1, 2, 4]);
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
      const filterData = packIntegers(5, [0, 2, 3]);
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
      const candidates = packIntegers(5, [1, 2, 4]);
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
      const candidates = packIntegers(5, [0, 2, 3]);
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
      const expectedData = Uint32Array.of(0b10100000000000000000000000000000);
      expect(result).toEqual({ format: "bitmask", data: expectedData });
      expect(position).toBe(3);
    });
  });
});
