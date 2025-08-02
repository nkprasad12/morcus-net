import {
  pack,
  readMetadata,
  unpackStreamed,
  packIntegers,
  unpackIntegers,
  PackedNumbers,
} from "@/common/bytedata/packing";

const BUF1 = new Uint8Array([0x17, 0x21, 0x62]);
const BUF2 = new Uint8Array([0x57, 0x42, 0x57, 0x42, 0x57]);

async function* streamify(
  sizes: number[],
  data: Uint8Array
): AsyncGenerator<Uint8Array> {
  let offset = 0;
  for (const size of sizes) {
    yield Promise.resolve(data.subarray(offset, offset + size));
    offset += size;
  }
  if (offset < data.byteLength) {
    yield Promise.resolve(data.subarray(offset));
  }
}

describe("Packing utils", () => {
  it("handles empty input", async () => {
    const packed = new Uint8Array(pack([]));
    const unpacked = unpackStreamed(streamify([packed.byteLength], packed));

    expect(await readMetadata(unpacked)).toBe(0);
    expect((await unpacked.next()).done).toBe(true);
  });

  it("handles input with random packets", async () => {
    const packed = new Uint8Array(pack([BUF1, BUF2]));
    const stream = streamify([2, 3, 2, 6, 1, 5], packed);
    const unpacked = unpackStreamed(stream);

    expect(await readMetadata(unpacked)).toBe(2);
    expect((await unpacked.next()).value).toEqual(BUF1);
    expect((await unpacked.next()).value).toEqual(BUF2);
    expect((await unpacked.next()).done).toBe(true);
  });

  it("handles input with empty packets", async () => {
    const packed = new Uint8Array(pack([BUF1, BUF2]));
    const stream = streamify([2, 0, 5, 6, 0, 0, 6], packed);
    const unpacked = unpackStreamed(stream);

    expect(await readMetadata(unpacked)).toBe(2);
    expect((await unpacked.next()).value).toEqual(BUF1);
    expect((await unpacked.next()).value).toEqual(BUF2);
    expect((await unpacked.next()).done).toBe(true);
  });

  it("handles input with single packet", async () => {
    const packed = new Uint8Array(pack([BUF1, BUF2]));
    const stream = streamify([packed.byteLength], packed);
    const unpacked = unpackStreamed(stream);

    expect(await readMetadata(unpacked)).toBe(2);
    expect((await unpacked.next()).value).toEqual(BUF1);
    expect((await unpacked.next()).value).toEqual(BUF2);
    expect((await unpacked.next()).done).toBe(true);
  });

  it("handles input aligned on packing boundaries", async () => {
    const packed = new Uint8Array(pack([BUF1, BUF2]));
    const stream = streamify([4, 4, 3, 4, 5], packed);
    const unpacked = unpackStreamed(stream);

    expect(await readMetadata(unpacked)).toBe(2);
    expect((await unpacked.next()).value).toEqual(BUF1);
    expect((await unpacked.next()).value).toEqual(BUF2);
    expect((await unpacked.next()).done).toBe(true);
  });

  it("handles input with intermediate packet that fully contains a chunk", async () => {
    const packed = new Uint8Array(pack([BUF1, BUF2]));
    const stream = streamify([4, 3, 5, 3, 5], packed);
    const unpacked = unpackStreamed(stream);

    expect(await readMetadata(unpacked)).toBe(2);
    expect((await unpacked.next()).value).toEqual(BUF1);
    expect((await unpacked.next()).value).toEqual(BUF2);
    expect((await unpacked.next()).done).toBe(true);
  });
});

describe("pack and unpacking integer arrays", () => {
  describe("packIntegers and unpackIntegers", () => {
    it("packs and unpacks an array with padding equal to element size", () => {
      const upperBound = 8; // 3 bits
      // Note that we have 3 bits and 7 elements, so the packed content is 21 bits long.
      // Since 21 bits is not a multiple of 8, the packed buffer will have some padding equal
      // to exactly 1 element.
      const numbers = [1, 2, 3, 4, 5, 6, 7];
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual(numbers);
    });

    it("handles zero and max value", () => {
      const upperBound = 16; // 4 bits
      const numbers = [0, 15, 7, 8];
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual(numbers);
    });

    it("returns empty array for empty input", () => {
      const upperBound = 4;
      const numbers: number[] = [];
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual([]);
    });

    it("throws error for out-of-range values", () => {
      const upperBound = 6;
      expect(() => packIntegers(upperBound, [6])).toThrow();
      expect(() => packIntegers(upperBound, [-1])).toThrow();
    });

    it("works for large arrays", () => {
      const upperBound = 256; // 8 bits
      const numbers = Array.from({ length: 1000 }, (_, i) => i % 256);
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual(numbers);
    });

    it("should pack and unpack a simple array of integers", () => {
      const upperBound = 16; // 4 bits per number
      const numbers = [1, 2, 3, 4, 5, 15];
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual(numbers);
    });

    it("should handle an upperBound of 1", () => {
      const upperBound = 1;
      const numbers = [0, 0, 0];
      const packed = packIntegers(upperBound, numbers);
      const unpacked = unpackIntegers(packed);
      expect(unpacked).toEqual(numbers);
    });

    it("should handle various bitsPerNumber values", () => {
      const testCases = [
        { upperBound: 2, numbers: [0, 1, 0, 1] }, // 1 bit
        { upperBound: 7, numbers: [0, 1, 2, 3, 4, 5, 6] }, // 3 bits
        { upperBound: 255, numbers: [10, 20, 30, 254] }, // 8 bits
      ];

      for (const { upperBound, numbers } of testCases) {
        const packed = packIntegers(upperBound, numbers);
        const unpacked = unpackIntegers(packed);
        expect(unpacked).toEqual(numbers);
      }
    });
  });

  describe("PackedNumbers", () => {
    describe("bitsPerNumber", () => {
      it("should return correct bits for given upper bound", () => {
        expect(PackedNumbers.bitsPerNumber(1)).toBe(1);
        expect(PackedNumbers.bitsPerNumber(2)).toBe(1);
        expect(PackedNumbers.bitsPerNumber(3)).toBe(2);
        expect(PackedNumbers.bitsPerNumber(4)).toBe(2);
        expect(PackedNumbers.bitsPerNumber(8)).toBe(3);
        expect(PackedNumbers.bitsPerNumber(9)).toBe(4);
        expect(PackedNumbers.bitsPerNumber(1024)).toBe(10);
        expect(PackedNumbers.bitsPerNumber(1025)).toBe(11);
      });
    });

    describe("numElements", () => {
      it("should return the correct number of elements", () => {
        const numbers = [1, 2, 3, 4, 5];
        const packed = packIntegers(6, numbers);
        expect(PackedNumbers.numElements(packed)).toBe(numbers.length);
      });

      it("should return 0 for an empty packed array", () => {
        const packed = packIntegers(5, []);
        expect(PackedNumbers.numElements(packed)).toBe(0);
      });
    });

    describe("get", () => {
      const upperBound = 30; // 5 bits
      const numbers = [0, 5, 10, 15, 20, 25, 29];
      const packed = packIntegers(upperBound, numbers);

      it("should retrieve the correct element at a given index", () => {
        expect(PackedNumbers.get(packed, 0)).toBe(0);
        expect(PackedNumbers.get(packed, 1)).toBe(5);
        expect(PackedNumbers.get(packed, 3)).toBe(15);
        expect(PackedNumbers.get(packed, 6)).toBe(29);
      });
    });

    describe("hasValueInRange", () => {
      const upperBound = 100;
      const numbers = [10, 20, 30, 40, 50, 60, 70, 80, 90];
      const packed = packIntegers(upperBound, numbers);

      it("should find a value in a single-element range", () => {
        expect(PackedNumbers.hasValueInRange(packed, [30])).toBe(true);
      });

      it("should not find a value not in a single-element range", () => {
        expect(PackedNumbers.hasValueInRange(packed, [35])).toBe(false);
      });

      it("should find a value within a given range", () => {
        expect(PackedNumbers.hasValueInRange(packed, [45, 55])).toBe(true);
      });

      it("should not find a value if none exists in the range", () => {
        expect(PackedNumbers.hasValueInRange(packed, [31, 39])).toBe(false);
      });

      it("should handle ranges that include the first element", () => {
        expect(PackedNumbers.hasValueInRange(packed, [10, 15])).toBe(true);
      });

      it("should handle ranges that include the last element", () => {
        expect(PackedNumbers.hasValueInRange(packed, [85, 90])).toBe(true);
      });

      it("should handle ranges outside the data", () => {
        expect(PackedNumbers.hasValueInRange(packed, [1, 5])).toBe(false);
        expect(PackedNumbers.hasValueInRange(packed, [95, 105])).toBe(false);
      });

      it("should return false for an empty packed array", () => {
        const emptyPacked = packIntegers(upperBound, []);
        expect(PackedNumbers.hasValueInRange(emptyPacked, [10, 20])).toBe(
          false
        );
      });
    });
  });
});
