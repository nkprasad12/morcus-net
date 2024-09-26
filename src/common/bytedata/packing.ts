import { assert } from "@/common/assert";

const DELIMITER_SIZE = 4;
const METADATA_SIZE = 4;
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
  // Uint32 is 4 bytes === `METADATA_SIZE`
  dataView.setUint32(0, buffers.length);
  let offset = DELIMITER_SIZE;
  for (const buf of buffers) {
    dataView.setUint32(offset, buf.byteLength);
    arrayView.set(new Uint8Array(buf), offset + DELIMITER_SIZE);
    offset += DELIMITER_SIZE + buf.byteLength;
  }
  return packed;
}

/**
 * Unpacks a data stream representing `pack`ed data.
 *
 * There are no assumptions about the boundaries of the
 * streamed data (in particular, it doesn't need to be aligned
 * with the delimiters or packed chunks).
 *
 * @yields the metadata first, and then the unpacked chunks, in order.
 */
export async function* unpackStreamed(
  stream: AsyncGenerator<Uint8Array>
): AsyncGenerator<Uint8Array> {
  // Next always contains data that has not yet been consumed.
  let next: Uint8Array | undefined = (await stream.next()).value;
  // The number of bytes in the next "chunk" (metadata, data, or delimiter).
  let expectedBytes = METADATA_SIZE;
  // What we are expecting in the next "chunk". `data` is yielded to the caller,
  // while `delimiter` is consumed internally only.
  let expecting: "data" | "delimiter" = "data";
  let buffer = new Uint8Array(expectedBytes);
  // The offset in the buffer.
  let offset = 0;

  // When the iterator is out of items, it will return value=undefined.
  while (next !== undefined) {
    // Add the required number of bytes to the (eventual) return buffer.
    const needed = expectedBytes - offset;
    const allUsed: boolean = next.byteLength <= needed;
    const end: number = allUsed ? next.byteLength : needed;
    buffer.set(allUsed ? next : next.subarray(0, end), offset);
    offset += end;
    // Only ask for the next item if we consumed the whole existing one.
    next = allUsed ? (await stream.next()).value : next.subarray(end);

    if (offset < expectedBytes) continue;
    const isData: boolean = expecting === "data";
    if (isData) yield buffer;
    expecting = isData ? "delimiter" : "data";
    expectedBytes = isData
      ? DELIMITER_SIZE
      : new DataView(buffer.buffer).getUint32(0);
    offset = 0;
    buffer = new Uint8Array(expectedBytes);
  }
  // Check that we're in a fully reset state.
  assert(offset === 0 && expecting === "delimiter");
}

/**
 * Returns the metadata in an unpacking stream.
 *
 * This MUST be called before any other reads from the stream.
 *
 * @param stream the result of an `unpackStreamed` call.
 * @returns the number of chunks in the packed buffer.
 */
export async function readMetadata(
  stream: AsyncGenerator<Uint8Array>
): Promise<number> {
  const metadata = await stream.next();
  return metadata.done
    ? Promise.reject("No data!")
    : new DataView(metadata.value.buffer).getUint32(0);
}
