import { assertEqual } from "@/common/assert";
import { packIntegers } from "@/common/bytedata/packing";
import {
  LatinCorpusIndex,
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
  type PackedIndexData,
} from "@/common/library/corpus/corpus_common";
import { PackedReverseIndex } from "@/common/library/corpus/packed_reverse_index";
import fs from "fs";

const SERIALIZATION_TOKEN = "___SERIALIZED_KEY_v1___";
const MAP_TOKEN = `${SERIALIZATION_TOKEN}_MAP`;
const BIT_MASK = `${SERIALIZATION_TOKEN}_BIT_MASK`;

type StoredMapValue = string | { serializationKey: string; data: string };

export function writeCorpus(
  corpus: InProgressLatinCorpus,
  corpusFile: string = CORPUS_FILE
) {
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }
  fs.writeFileSync(corpusFile, serializeCorpus(corpus));
  console.debug(`Corpus written to ${corpusFile}`);
}

export function loadCorpus(corpusFile: string = CORPUS_FILE): LatinCorpusIndex {
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
      const numTokens = value.numTokens;
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
        map.set(k, { format: "bitmask", data: new Uint8Array(buffer) });
      }
      return new PackedReverseIndex(map, numTokens);
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
    const arrToSave = useBitMask
      ? toBitMask(value, numTokens)
      : packIntegers(numTokens, value);
    const indexBits = Buffer.from(arrToSave).toString("base64");
    const storedValue = useBitMask
      ? { serializationKey: BIT_MASK, data: indexBits }
      : indexBits;
    return [key, storedValue];
  });
}

function toBitMask(values: number[], numTokens: number): Uint8Array {
  const bitMask = new Uint8Array(Math.ceil(numTokens / 8));
  for (const value of values) {
    if (value < 0 || value >= numTokens) {
      throw new Error(`Value ${value} out of bounds (numTokens: ${numTokens})`);
    }
    const byteIndex = Math.floor(value / 8);
    const bitIndex = value % 8;
    bitMask[byteIndex] |= 1 << bitIndex;
  }
  return bitMask;
}
