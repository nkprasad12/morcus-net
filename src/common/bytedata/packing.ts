import { assert } from "@/common/assert";

const DELIMITER_SIZE = 4;
const MESSAGE_LIMIT = 2 ** (DELIMITER_SIZE * 8);

/** Packs a sequence of buffers into a single length-delimited buffer. */
export function pack(buffers: ArrayBuffer[]): ArrayBuffer {
  let packedSize = 0;
  for (const buf of buffers) {
    assert(buf.byteLength < MESSAGE_LIMIT), "Buffer too large.";
    packedSize += DELIMITER_SIZE + buf.byteLength;
  }
  const packed = new ArrayBuffer(packedSize);
  const dataView = new DataView(packed);
  const arrayView = new Uint8Array(packed);
  let offset = 0;
  for (const buf of buffers) {
    dataView.setUint32(offset, buf.byteLength);
    arrayView.set(new Uint8Array(buf), offset + DELIMITER_SIZE);
    offset += DELIMITER_SIZE + buf.byteLength;
  }
  return packed;
}

/** Unpacks a length-delimited packed buffer into a sequence of buffers. */
export function* unpack(packed: ArrayBuffer): Generator<ArrayBuffer> {
  const dataView = new DataView(packed);
  let offset = 0;
  while (offset < packed.byteLength) {
    const messageSize = dataView.getUint32(offset);
    offset = offset + DELIMITER_SIZE;
    yield packed.slice(offset, offset + messageSize);
    offset = offset + messageSize;
  }
}
