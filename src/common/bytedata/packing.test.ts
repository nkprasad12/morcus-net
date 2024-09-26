import { pack, readMetadata, unpackStreamed } from "@/common/bytedata/packing";

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
