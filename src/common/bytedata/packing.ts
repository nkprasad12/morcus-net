import { assert } from "@/common/assert";

const DELIMITER_SIZE = 4;
const METADATA_SIZE = 4;
const MAX_INT = 2 ** (DELIMITER_SIZE * 8);

const PACKED_NUMBER_HEADER_SIZE = 1; // 1 byte: 3 bits unused, 5 bits bitsPerNumber
const PACKED_NUMBER_HEADER_UNUSED_BITS_MASK = 0b11100000; // bits 7-5
const PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK = 0b00011111; // bits 4-0

/** Packs a sequence of buffers into a single length-delimited buffer. */
export function pack(buffers: ArrayBuffer[]): ArrayBuffer {
  // The initial bytes stores the number of chunks.
  let packedSize = DELIMITER_SIZE;
  assert(buffers.length < MAX_INT, "Too many buffers.");
  for (const buf of buffers) {
    assert(buf.byteLength < MAX_INT, "Buffer too large.");
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

/**
 * Packs an array of sorted natural numbers into a compact bit array (Uint8Array).
 *
 * This function is useful for serializing lists of numbers where each number
 * is smaller than a known maximum, allowing for storage that is more efficient
 * than using standard integer types.
 *
 * @param numbers The array of sorted natural numbers to pack.
 * @returns A `Uint8Array` containing the packed bit representation of the numbers.
 */
export function packSortedNats(numbers: number[]): Uint8Array {
  if (numbers.length === 0) {
    // Header: unused bits = 0, bitsPerNumber = 0
    const header = ((0 << 5) | 0) & 0xff;
    return Uint8Array.of(header);
  }

  const upperBound = numbers[numbers.length - 1] + 1;
  assert(upperBound > 0, "upperBound must be positive.");
  const bitsPerNumber = PackedNumbers.bitsPerNumber(upperBound);
  assert(
    bitsPerNumber <= 31,
    "upperBound too large for packed encoding (max bitsPerNumber = 31)."
  );

  // Calculate the total number of bits and the required buffer size in bytes.
  const totalBits = numbers.length * bitsPerNumber;
  const dataBufferSize = Math.ceil(totalBits / 8);
  const unusedBits = dataBufferSize * 8 - totalBits;
  assert(unusedBits < 8);

  // Header: 3 bits unused, 5 bits bitsPerNumber
  const header = ((unusedBits << 5) | bitsPerNumber) & 0xff;
  const buffer = new Uint8Array(PACKED_NUMBER_HEADER_SIZE + dataBufferSize);
  buffer[0] = header;

  let bitOffset = 0;
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    if (i > 0 && num < numbers[i - 1]) {
      throw new Error("Numbers must be sorted.");
    }
    if (num < 0 || num >= upperBound) {
      throw new Error(
        `Number ${num} is out of the allowed range [0, ${upperBound}).`
      );
    }
    for (let i = bitsPerNumber - 1; i >= 0; i--) {
      const bit = (num >> i) & 1;
      if (bit === 1) {
        const byteIndex = Math.floor(bitOffset / 8);
        const bitInByte = bitOffset % 8;
        buffer[PACKED_NUMBER_HEADER_SIZE + byteIndex] |= 1 << (7 - bitInByte);
      }
      bitOffset++;
    }
  }
  return buffer;
}

/**
 * Unpacks an array of positive integers from a compact bit array (Uint8Array).
 * The header byte encodes both the number of unused bits (3 bits) and the bit width (5 bits).
 *
 * @param buffer The `Uint8Array` containing the packed data.
 * @returns An array of the unpacked positive integers.
 */
export function unpackIntegers(buffer: Uint8Array): number[] {
  if (buffer.length < PACKED_NUMBER_HEADER_SIZE) {
    throw new Error("Invalid buffer: too small to contain header.");
  }
  const header = buffer[0];
  const unusedBits = (header & PACKED_NUMBER_HEADER_UNUSED_BITS_MASK) >> 5;
  const bitsPerNumber = header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK;
  assert(
    bitsPerNumber > 0 || buffer.length === PACKED_NUMBER_HEADER_SIZE,
    "0 bits per number, but buffer contains data."
  );
  if (bitsPerNumber === 0) {
    return [];
  }

  const dataBuffer = buffer.subarray(PACKED_NUMBER_HEADER_SIZE);
  if (dataBuffer.length === 0) {
    return [];
  }

  const totalDataBits = dataBuffer.length * 8;
  const totalValidBits = totalDataBits - unusedBits;

  const numbers: number[] = [];
  let bitOffset = 0;

  while (bitOffset + bitsPerNumber <= totalValidBits) {
    let currentNum = 0;
    for (let j = bitsPerNumber - 1; j >= 0; j--) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;
      const bit = (dataBuffer[byteIndex] >> (7 - bitInByte)) & 1;
      if (bit === 1) {
        currentNum |= 1 << j;
      }
      bitOffset++;
    }
    numbers.push(currentNum);
  }

  return numbers;
}

export namespace PackedNumbers {
  export function bitsPerNumber(upperBound: number): number {
    return upperBound === 1 ? 1 : Math.ceil(Math.log2(upperBound));
  }

  export function numElements(packedData: Uint8Array): number {
    const header = packedData[0];
    const unusedBits = (header & PACKED_NUMBER_HEADER_UNUSED_BITS_MASK) >> 5;
    const bitsPerNumber = header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK;
    const totalBits =
      (packedData.length - PACKED_NUMBER_HEADER_SIZE) * 8 - unusedBits;
    return bitsPerNumber === 0 ? 0 : Math.floor(totalBits / bitsPerNumber);
  }

  export function get(packedData: Uint8Array, index: number): number {
    const header = packedData[0];
    const bitsPerNumber = header & PACKED_NUMBER_HEADER_BITS_PER_NUMBER_MASK;
    const dataBuffer = packedData.subarray(PACKED_NUMBER_HEADER_SIZE);
    let value = 0;
    const startBit = index * bitsPerNumber;
    for (let i = 0; i < bitsPerNumber; i++) {
      const bitOffset = startBit + i;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;
      const bit = (dataBuffer[byteIndex] >> (7 - bitInByte)) & 1;
      if (bit) {
        value |= 1 << (bitsPerNumber - 1 - i);
      }
    }
    return value;
  }

  export function hasValueInRange(
    packedData: Uint8Array,
    valueRange: [number] | [number, number]
  ): boolean {
    const lowTarget = valueRange[0];
    const highTarget = valueRange[valueRange.length - 1];
    assert(lowTarget <= highTarget);
    const numElements = PackedNumbers.numElements(packedData);
    let low = 0;
    let high = numElements - 1;
    while (low <= high) {
      const midIndex = (low + high) >> 1;
      const midVal = PackedNumbers.get(packedData, midIndex);
      if (midVal < lowTarget) {
        low = midIndex + 1;
      } else if (midVal > highTarget) {
        high = midIndex - 1;
      } else {
        return true;
      }
    }
    return false;
  }
}
