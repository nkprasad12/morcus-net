import { pack, unpack } from "@/common/bytedata/packing";

describe("Packing utils", () => {
  it("handles empty input", () => {
    const packed = pack([]);
    const unpacked = [...unpack(packed)];
    expect(unpacked).toHaveLength(0);
  });

  it("handles non-empty input", () => {
    const buf1 = new Uint8Array([0x17, 0x21, 0x62]);
    const buf2 = new Uint8Array([0x57, 0x42, 0x57, 0x42, 0x57]);

    const packed = pack([buf1, buf2]);
    const unpacked = unpack(packed);

    expect(new Uint8Array(unpacked.next().value)).toEqual(buf1);
    expect(new Uint8Array(unpacked.next().value)).toEqual(buf2);
    expect(unpacked.next().done).toBe(true);
  });
});
