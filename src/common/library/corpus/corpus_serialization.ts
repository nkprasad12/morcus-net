import {
  LatinCorpusIndex,
  CORPUS_FILE,
  CORPUS_DIR,
} from "@/common/library/corpus/corpus_common";
import fs from "fs";

const SPECIAL_SERIALIZATION_TOKEN = "___SERIALIZED_TOKEN_v1___";

export function writeCorpus(
  corpus: LatinCorpusIndex<number[]>,
  corpusFile: string = CORPUS_FILE
) {
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }
  fs.writeFileSync(corpusFile, serializeCorpus(corpus));
  console.debug(`Corpus written to ${corpusFile}`);
}

export function loadCorpus(
  corpusFile: string = CORPUS_FILE
): LatinCorpusIndex<number[]> {
  const raw = fs.readFileSync(corpusFile, "utf8");
  return deserializeCorpus(raw);
}

/**
 * Deserializes a JSON string into an object, correctly handling Map objects
 * that were serialized with `serializeCorpus`.
 */
function deserializeCorpus(jsonString: string): LatinCorpusIndex<number[]> {
  const reviver = (_key: string, value: any) => {
    if (
      value &&
      typeof value === "object" &&
      value.dataType === "Map" &&
      value.serializationKey === SPECIAL_SERIALIZATION_TOKEN
    ) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const mapData = value.data as [unknown, string][];
      const maxNumber = value.maxNumber;
      const map = new Map<unknown, number[]>();
      for (const [k, v] of mapData) {
        const buffer = Buffer.from(v, "base64");
        map.set(k, unpackIntegers(maxNumber, new Uint8Array(buffer)));
      }
      return map;
    }
    return value;
  };
  return JSON.parse(jsonString, reviver);
}

/**
 * Serializes an object to a JSON string, correctly handling Map objects.
 */
function serializeCorpus(obj: LatinCorpusIndex<number[]>): string {
  const replacer = (_key: string, value: any) => {
    if (value instanceof Map) {
      return {
        dataType: "Map",
        serializationKey: SPECIAL_SERIALIZATION_TOKEN,
        maxNumber: obj.indices.maxTokenId,
        data: prepareIndexMap(value, obj.indices.maxTokenId),
      };
    }
    return value;
  };
  return JSON.stringify(obj, replacer);
}

function prepareIndexMap(
  indexMap: Map<unknown, number[]>,
  maxNumber: number
): [unknown, string][] {
  return Array.from(indexMap.entries()).map(([key, value]) => [
    key,
    Buffer.from(packIntegers(maxNumber, value)).toString("base64"),
  ]);
}

/**
 * Packs an array of positive integers into a compact bit array (Uint8Array).
 *
 * This function is useful for serializing lists of numbers where each number
 * is smaller than a known maximum, allowing for storage that is more efficient
 * than using standard integer types.
 *
 * @param maxIntSize The maximum possible value for any integer in the array.
 *   This is used to determine the number of bits required for each integer.
 *   The number of bits will be `ceil(log2(maxIntSize + 1))`.
 * @param numbers The array of positive integers to pack. Each number must be
 *   `<= maxIntSize`.
 * @returns A `Uint8Array` containing the packed bit representation of the numbers.
 */
function packIntegers(maxIntSize: number, numbers: number[]): Buffer {
  if (maxIntSize < 0) {
    throw new Error("maxIntSize must be non-negative.");
  }

  // Determine the number of bits required to store any number up to maxIntSize.
  // +1 because we need to represent maxIntSize itself (e.g., 0-7 needs 3 bits for 8 values).
  const bitsPerNumber =
    maxIntSize === 0 ? 1 : Math.ceil(Math.log2(maxIntSize + 1));

  // Calculate the total number of bits and the required buffer size in bytes.
  const totalBits = numbers.length * bitsPerNumber;
  const bufferSize = Math.ceil(totalBits / 8);
  const buffer = Buffer.alloc(bufferSize);

  let bitOffset = 0;

  for (const num of numbers) {
    if (num < 0 || num > maxIntSize) {
      throw new Error(
        `Number ${num} is out of the allowed range [0, ${maxIntSize}].`
      );
    }

    // Write the bits for the current number, from most significant to least.
    for (let i = bitsPerNumber - 1; i >= 0; i--) {
      const bit = (num >> i) & 1;

      if (bit === 1) {
        const byteIndex = Math.floor(bitOffset / 8);
        const bitInByte = bitOffset % 8;
        // Set the bit in the buffer. We write bits from left to right (MSB to LSB) in each byte.
        buffer[byteIndex] |= 1 << (7 - bitInByte);
      }
      bitOffset++;
    }
  }

  return buffer;
}

/**
 * Unpacks an array of positive integers from a compact bit array (Uint8Array).
 *
 * This is the companion function to `packIntegers`. It reads the bit-packed
 * data and reconstructs the original array of numbers.
 *
 * @param maxIntSize The maximum possible value for any integer in the array.
 *   This must be the same value used during packing.
 * @param buffer The `Uint8Array` containing the packed data.
 * @returns An array of the unpacked positive integers.
 */
function unpackIntegers(maxIntSize: number, buffer: Uint8Array): number[] {
  if (maxIntSize < 0) {
    throw new Error("maxIntSize must be non-negative.");
  }

  const bitsPerNumber =
    maxIntSize === 0 ? 1 : Math.ceil(Math.log2(maxIntSize + 1));
  if (bitsPerNumber === 0) {
    return [];
  }

  const numbers: number[] = [];
  let bitOffset = 0;
  const totalBits = buffer.length * 8;

  while (bitOffset + bitsPerNumber <= totalBits) {
    let currentNum = 0;
    for (let j = bitsPerNumber - 1; j >= 0; j--) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitInByte = bitOffset % 8;

      const bit = (buffer[byteIndex] >> (7 - bitInByte)) & 1;
      if (bit === 1) {
        currentNum |= 1 << j;
      }
      bitOffset++;
    }
    numbers.push(currentNum);
  }

  return numbers;
}
