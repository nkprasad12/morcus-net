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
  fs.writeFileSync(corpusFile, serializeWithMaps(corpus));
  console.debug(`Corpus written to ${corpusFile}`);
}

export function loadCorpus(
  corpusFile: string = CORPUS_FILE
): LatinCorpusIndex<number[]> {
  const raw = fs.readFileSync(corpusFile, "utf8");
  return deserializeWithMaps(raw);
}

/**
 * Serializes an object to a JSON string, correctly handling Map objects.
 *
 * Exported for unit testing only.
 */
export function serializeWithMaps(obj: any): string {
  const replacer = (_key: string, value: any) => {
    if (value instanceof Map) {
      return {
        dataType: "Map",
        serializationKey: SPECIAL_SERIALIZATION_TOKEN,
        data: Array.from(value.entries()),
      };
    }
    return value;
  };
  return JSON.stringify(obj, replacer);
}

/**
 * Deserializes a JSON string created by `serializeWithMaps`,
 * correctly reconstructing Map objects.
 *
 * Exported for unit testing only.
 */
export function deserializeWithMaps<T>(json: string): T {
  const reviver = (_key: string, value: any) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.dataType === "Map" &&
      value.serializationKey === SPECIAL_SERIALIZATION_TOKEN
    ) {
      return new Map(value.data);
    }
    return value;
  };
  return JSON.parse(json, reviver);
}
