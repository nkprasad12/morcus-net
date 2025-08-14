import { assertEqual } from "@/common/assert";
import { packSortedNats } from "@/common/bytedata/packing";
import { toBitMask } from "@/common/library/corpus/corpus_byte_utils";
import {
  LatinCorpusIndex,
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
  type PackedIndexData,
} from "@/common/library/corpus/corpus_common";
import fs from "fs";
import path from "path";

const SERIALIZATION_TOKEN = "___SERIALIZED_KEY_v1___";
const MAP_TOKEN = `${SERIALIZATION_TOKEN}_MAP`;
const BIT_MASK = `${SERIALIZATION_TOKEN}_BIT_MASK`;

type StoredMapValue =
  | string
  | { serializationKey: string; data: string; size: number };

export function writeCorpus(
  corpus: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
) {
  if (!fs.existsSync(corpusDir)) {
    fs.mkdirSync(corpusDir, { recursive: true });
  }
  const destFile = path.join(corpusDir, CORPUS_FILE);
  fs.writeFileSync(destFile, serializeCorpus(corpus));
  console.debug(`Corpus written to ${destFile}`);
}

export function loadCorpus(corpusDir: string = CORPUS_DIR): LatinCorpusIndex {
  const corpusFile = path.join(corpusDir, CORPUS_FILE);
  const raw = fs.readFileSync(corpusFile, "utf8");
  return deserializeCorpus(raw);
}

/**
 * Deserializes a JSON string into an object, correctly handling Map objects
 * that were serialized with `serializeCorpus`.
 */
function deserializeCorpus(jsonString: string): LatinCorpusIndex {
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
        if (typeof v === "string") {
          const buffer = Buffer.from(v, "base64");
          map.set(k, new Uint8Array(buffer));
          continue;
        }
        // We have a bitmask.
        assertEqual(v.serializationKey, BIT_MASK);
        const buffer = Buffer.from(v.data, "base64");
        map.set(k, {
          format: "bitmask",
          data: new Uint32Array(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength / Uint32Array.BYTES_PER_ELEMENT
          ),
          numSet: v.size,
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
function serializeCorpus(obj: InProgressLatinCorpus): string {
  const packedNumberSize = Math.ceil(Math.log2(obj.numTokens));
  const replacer = (_key: string, value: any) => {
    if (value instanceof Map) {
      return {
        serializationKey: MAP_TOKEN,
        numTokens: obj.numTokens,
        data: prepareIndexMap(value, obj.numTokens, packedNumberSize),
      };
    }
    return value;
  };
  return JSON.stringify(obj, replacer);
}

function prepareIndexMap(
  indexMap: Map<unknown, number[]>,
  numTokens: number,
  packedNumberSize: number
): [unknown, StoredMapValue][] {
  return Array.from(indexMap.entries()).map(([key, value]) => {
    const useBitMask = value.length * packedNumberSize > numTokens;
    const indexBits = useBitMask
      ? Buffer.from(toBitMask(value, numTokens).buffer).toString("base64")
      : Buffer.from(packSortedNats(value)).toString("base64");
    const storedValue = useBitMask
      ? { serializationKey: BIT_MASK, data: indexBits, size: value.length }
      : indexBits;
    return [key, storedValue];
  });
}
