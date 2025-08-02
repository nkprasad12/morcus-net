import { applyAndWithBitmasks } from "@/common/library/corpus/corpus_byte_utils";

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
