import { packSortedNats } from "@/common/bytedata/packing";
import { toBitMask } from "@/common/library/corpus/corpus_byte_utils";
import {
  LatinCorpusIndex,
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
  type PackedIndexData,
  CORPUS_BUFFERS,
} from "@/common/library/corpus/corpus_common";
import fs from "fs";
import path from "path";

const SERIALIZATION_TOKEN = "___SERIALIZED_KEY_v1___";
const MAP_TOKEN = `${SERIALIZATION_TOKEN}_MAP`;

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

export function loadCorpus(corpusDir: string = CORPUS_DIR): LatinCorpusIndex {
  const corpusFile = path.join(corpusDir, CORPUS_FILE);
  const raw = fs.readFileSync(corpusFile, "utf8");
  return deserializeCorpus(raw, corpusDir);
}

/**
 * Deserializes a JSON string into an object, correctly handling Map objects
 * that were serialized with `serializeCorpus`.
 */
function deserializeCorpus(
  jsonString: string,
  corpusDir: string = CORPUS_DIR
): LatinCorpusIndex {
  const rawBufferFile = path.join(corpusDir, CORPUS_BUFFERS);
  const rawBuffer = fs.readFileSync(rawBufferFile);
  if (rawBuffer.length < 4) {
    throw new Error(`Corpus buffers file too small: ${rawBufferFile}`);
  }
  // Read the first 4 bytes as an unsigned 32-bit integer (little-endian)
  const numTokens = rawBuffer.readUInt32LE(0);
  const bitmaskBytes = Math.floor((numTokens + 63) / 64) * 8;
  const reviver = (_key: string, value: any) => {
    if (
      value &&
      typeof value === "object" &&
      value.serializationKey === MAP_TOKEN
    ) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const mapData = value.data as [unknown, StoredMapValue][];
      const map = new Map<unknown, PackedIndexData>();
      for (const [k, v] of mapData) {
        // We have a packed array.
        if ("len" in v) {
          const buffer = rawBuffer.subarray(v.offset, v.offset + v.len);
          map.set(k, new Uint8Array(buffer));
          continue;
        }
        // We have a bitmask.
        const buffer = rawBuffer.subarray(v.offset, v.offset + bitmaskBytes);
        map.set(k, {
          format: "bitmask",
          data: new Uint32Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength / Uint32Array.BYTES_PER_ELEMENT
          ),
          numSet: v.numSet,
        });
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
      return {
        serializationKey: MAP_TOKEN,
        numTokens: obj.numTokens,
        data: mapData,
      };
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
): [[unknown, StoredMapValue][], number] {
  let newOffset = offset;
  const entries: [unknown, StoredMapValue][] = Array.from(
    indexMap.entries()
  ).map(([key, value]) => {
    const useBitMask =
      value.length * packedNumberSize > numTokens ||
      (outerKey === "breaks" && key === "hard");
    const indexBytes = useBitMask
      ? Buffer.from(toBitMask(value, numTokens).buffer)
      : Buffer.from(packSortedNats(value));
    const indexLen = indexBytes.byteLength;
    const storedValue: StoredMapValue = useBitMask
      ? { offset: newOffset, numSet: value.length }
      : { offset: newOffset, len: indexLen };
    writer.write(indexBytes);
    newOffset += indexLen;
    return [key, storedValue];
  });
  return [entries, newOffset];
}
