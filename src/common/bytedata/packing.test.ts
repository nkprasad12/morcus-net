import {
  pack,
  readMetadata,
  unpackStreamed,
  packIntegers,
  unpackIntegers,
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

describe("packIntegers/unpackIntegers", () => {
  it("packs and unpacks an array with padding equal to element size", () => {
    const maxIntSize = 7; // 3 bits
    // Note that we have 3 bits and 7 elements, so the packed content is 21 bits long.
    // Since 21 bits is not a multiple of 8, the packed buffer will have some padding equal
    // to exactly 1 element.
    const numbers = [1, 2, 3, 4, 5, 6, 7];
    const packed = packIntegers(maxIntSize, numbers);
    const unpacked = unpackIntegers(maxIntSize, packed);
    expect(unpacked).toEqual(numbers);
  });

  it("handles zero and max value", () => {
    const maxIntSize = 15; // 4 bits
    const numbers = [0, 15, 7, 8];
    const packed = packIntegers(maxIntSize, numbers);
    const unpacked = unpackIntegers(maxIntSize, packed);
    expect(unpacked).toEqual(numbers);
  });

  it("returns empty array for empty input", () => {
    const maxIntSize = 3;
    const numbers: number[] = [];
    const packed = packIntegers(maxIntSize, numbers);
    const unpacked = unpackIntegers(maxIntSize, packed);
    expect(unpacked).toEqual([]);
  });

  it("throws error for out-of-range values", () => {
    const maxIntSize = 5;
    expect(() => packIntegers(maxIntSize, [6])).toThrow();
    expect(() => packIntegers(maxIntSize, [-1])).toThrow();
  });

  it("works for large arrays", () => {
    const maxIntSize = 255; // 8 bits
    const numbers = Array.from({ length: 1000 }, (_, i) => i % 256);
    const packed = packIntegers(maxIntSize, numbers);
    const unpacked = unpackIntegers(maxIntSize, packed);
    expect(unpacked).toEqual(numbers);
  });
});
