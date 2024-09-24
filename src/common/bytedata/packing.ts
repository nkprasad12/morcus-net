import { assert } from "@/common/assert";

const DELIMITER_SIZE = 4;
const MAX_INT = 2 ** (DELIMITER_SIZE * 8);

/** Packs a sequence of buffers into a single length-delimited buffer. */
export function pack(buffers: ArrayBuffer[]): ArrayBuffer {
  // The initial bytes stores the number of chunks.
  let packedSize = DELIMITER_SIZE;
  assert(buffers.length < MAX_INT), "Too many buffers.";
  for (const buf of buffers) {
    assert(buf.byteLength < MAX_INT), "Buffer too large.";
    packedSize += DELIMITER_SIZE + buf.byteLength;
  }
  const packed = new ArrayBuffer(packedSize);
  const arrayView = new Uint8Array(packed);
  const dataView = new DataView(packed);
  dataView.setUint32(0, buffers.length);
  let offset = DELIMITER_SIZE;
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
  // Skip the 4 initial bytes for the number of items.
  let offset = 4;
  while (offset < packed.byteLength) {
    const messageSize = dataView.getUint32(offset);
    offset = offset + DELIMITER_SIZE;
    yield packed.slice(offset, offset + messageSize);
    offset = offset + messageSize;
  }
}

/** Returns the number of chunks in a length-delimited packed buffer. */
export function chunksInPacked(packed: ArrayBuffer): number {
  const dataView = new DataView(packed);
  return dataView.getUint32(0);
}
