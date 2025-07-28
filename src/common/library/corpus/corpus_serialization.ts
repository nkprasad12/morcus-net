import { packIntegers } from "@/common/bytedata/packing";
import {
  LatinCorpusIndex,
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
} from "@/common/library/corpus/corpus_common";
import { PackedReverseIndex } from "@/common/library/corpus/packed_reverse_index";
import fs from "fs";

const SPECIAL_SERIALIZATION_TOKEN = "___SERIALIZED_TOKEN_v1___";

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
      value.dataType === "Map" &&
      value.serializationKey === SPECIAL_SERIALIZATION_TOKEN
    ) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const mapData = value.data as [unknown, string][];
      const maxNumber = value.maxNumber;
      const map = new Map<unknown, Uint8Array>();
      for (const [k, v] of mapData) {
        const buffer = Buffer.from(v, "base64");
        map.set(k, new Uint8Array(buffer));
      }
      return new PackedReverseIndex(map, maxNumber);
    }
    return value;
  };
  return JSON.parse(jsonString, reviver);
}

/**
 * Serializes an object to a JSON string, correctly handling Map objects.
 */
function serializeCorpus(obj: InProgressLatinCorpus): string {
  const replacer = (_key: string, value: any) => {
    if (value instanceof Map) {
      return {
        dataType: "Map",
        serializationKey: SPECIAL_SERIALIZATION_TOKEN,
        maxNumber: obj.maxTokenId,
        data: prepareIndexMap(value, obj.maxTokenId),
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
