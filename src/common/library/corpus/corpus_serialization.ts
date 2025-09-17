import { packSortedNats } from "@/common/bytedata/packing";
import { toBitMask } from "@/common/library/corpus/corpus_byte_utils";
import {
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
  CORPUS_BUFFERS,
} from "@/common/library/corpus/corpus_common";
import fs from "fs";
import path from "path";

interface StoredArray {
  offset: number;
  len: number;
}

interface StoredBitmask {
  offset: number;
  numSet: number;
}

type StoredMapValue = StoredArray | StoredBitmask;

export async function writeCorpus(
  corpus: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
) {
  if (!fs.existsSync(corpusDir)) {
    fs.mkdirSync(corpusDir, { recursive: true });
  }
  const destFile = path.join(corpusDir, CORPUS_FILE);
  fs.writeFileSync(destFile, await serializeCorpus(corpus, corpusDir));
  console.debug(`Corpus written to ${destFile}`);
}

/**
 * Serializes an object to a JSON string, correctly handling Map objects.
 */
async function serializeCorpus(
  obj: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
): Promise<string> {
  const rawDestFile = path.join(corpusDir, CORPUS_BUFFERS);
  obj.rawBufferPath = rawDestFile;
  if (fs.existsSync(rawDestFile)) {
    fs.unlinkSync(rawDestFile);
  }
  fs.closeSync(fs.openSync(rawDestFile, "w"));
  const rawWriteStream = fs.createWriteStream(rawDestFile, { flags: "w+" });
  const numTokens = obj.numTokens;
  if (!Number.isInteger(numTokens) || numTokens < 0 || numTokens > 0xffffffff) {
    throw new Error(
      `obj.numTokens must fit in an unsigned 32-bit integer: ${numTokens}`
    );
  }
  rawWriteStream.write(new Uint32Array([numTokens]));
  let offset = 4;
  const packedNumberSize = Math.ceil(Math.log2(obj.numTokens));
  const replacer = (key: string, value: any) => {
    if (value instanceof Map) {
      const [mapData, newOffset] = prepareIndexMap(
        value,
        obj.numTokens,
        packedNumberSize,
        key,
        rawWriteStream,
        offset
      );
      offset = newOffset;
      return mapData;
    }
    return value;
  };
  const jsonData = JSON.stringify(obj, replacer);
  return new Promise<string>((resolve, reject) => {
    rawWriteStream.on("finish", () => resolve(jsonData));
    rawWriteStream.on("error", (err) => reject(err));
    rawWriteStream.end();
  });
}

function prepareIndexMap(
  indexMap: Map<unknown, number[]>,
  numTokens: number,
  packedNumberSize: number,
  outerKey: string,
  writer: fs.WriteStream,
  offset: number
): [Record<string, StoredMapValue>, number] {
  let newOffset = offset;
  const entries: Record<string, StoredMapValue> = {};
  for (const [key, value] of indexMap.entries()) {
    const useBitMask =
      value.length * packedNumberSize > numTokens ||
      (outerKey === "breaks" && key === "hard");
    // Bitmasks are interpreted on the Rust side as a vector of 64 bit integers.
    // To avoid having to handle misaligned data, make sure it's 64-bit aligned.
    if (useBitMask) {
      const alignment = 8;
      const padding = (alignment - (newOffset % alignment)) % alignment;
      if (padding > 0) {
        writer.write(Buffer.alloc(padding));
        newOffset += padding;
      }
    }

    const indexBytes = useBitMask
      ? Buffer.from(toBitMask(value, numTokens).buffer)
      : Buffer.from(packSortedNats(value));
    const indexLen = indexBytes.byteLength;
    const storedValue: StoredMapValue = useBitMask
      ? { offset: newOffset, numSet: value.length }
      : { offset: newOffset, len: indexLen };
    writer.write(indexBytes);
    newOffset += indexLen;
    entries[String(key)] = storedValue;
  }
  return [entries, newOffset];
}
