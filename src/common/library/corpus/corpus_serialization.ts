import { toBitMask } from "@/common/library/corpus/corpus_byte_utils";
import {
  CORPUS_FILE,
  CORPUS_DIR,
  type InProgressLatinCorpus,
  CORPUS_BUFFERS,
  CORPUS_TOKEN_STARTS,
  CORPUS_AUTHORS_LIST,
  CORPUS_LEMMATA_LIST,
  type CorpusIndexKeyTypes,
} from "@/common/library/corpus/corpus_common";
import { encodeMessage } from "@/web/utils/rpc/parsing";
import { serverMessage } from "@/web/utils/rpc/server_rpc";
import fs from "fs";
import path from "path";
import zlib from "zlib";

interface StoredArray {
  offset: number;
  len: number;
}

interface StoredBitmask {
  offset: number;
  numSet: number;
}

type StoredMapValue = StoredArray | StoredBitmask;

function writeAuthorsFile(corpus: InProgressLatinCorpus, corpusDir: string) {
  const authorsDest = path.join(corpusDir, CORPUS_AUTHORS_LIST);
  const encoded = encodeMessage(
    serverMessage(Object.keys(corpus.authorLookup))
  );
  const compressed = zlib.gzipSync(Buffer.from(encoded, "utf8"), {
    level: 9,
  });
  fs.writeFileSync(authorsDest, compressed);
}

function writeLemmataFile(corpus: InProgressLatinCorpus, corpusDir: string) {
  const lemmataDest = path.join(corpusDir, CORPUS_LEMMATA_LIST);
  const lemmata = Array.from(new Set(corpus.indices.lemma.keys())).sort();
  const encoded = encodeMessage(serverMessage(lemmata));
  const compressed = zlib.gzipSync(Buffer.from(encoded, "utf8"), {
    level: 9,
  });
  fs.writeFileSync(lemmataDest, compressed);
}

export async function writeCorpus(
  corpus: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
) {
  if (!fs.existsSync(corpusDir)) {
    fs.mkdirSync(corpusDir, { recursive: true });
  }
  writeAuthorsFile(corpus, corpusDir);
  writeLemmataFile(corpus, corpusDir);
  const destFile = path.join(corpusDir, CORPUS_FILE);
  fs.writeFileSync(destFile, await serializeCorpus(corpus, corpusDir));
  console.debug(`Corpus written to ${destFile}`);
}

function writeTokenStarts(
  corpus: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
) {
  const destFile = path.join(corpusDir, CORPUS_TOKEN_STARTS);
  const numTokens = corpus.numTokens;
  const tokenStarts = corpus.tokenStarts;
  const breakStarts = corpus.breakStarts;

  const buffer = new Uint32Array(numTokens * 2);
  for (let i = 0; i < numTokens; i++) {
    buffer[i * 2] = tokenStarts[i];
    buffer[i * 2 + 1] = breakStarts[i];
  }
  fs.writeFileSync(destFile, Buffer.from(buffer.buffer));
  // @ts-expect-error
  delete corpus.tokenStarts;
  // @ts-expect-error
  delete corpus.breakStarts;
  // @ts-expect-error
  corpus.tokenStartsPath = destFile;
}

/**
 * Serializes an object to a JSON string, correctly handling Map objects.
 */
async function serializeCorpus(
  obj: InProgressLatinCorpus,
  corpusDir: string = CORPUS_DIR
): Promise<string> {
  writeTokenStarts(obj, corpusDir);
  const rawDestFile = path.join(corpusDir, CORPUS_BUFFERS);
  obj.rawBufferPath = rawDestFile;
  if (fs.existsSync(rawDestFile)) {
    fs.unlinkSync(rawDestFile);
  }
  fs.closeSync(fs.openSync(rawDestFile, "w"));

  // Prepare the write stream for the raw binary data. Offset
  // is the current position in the raw data.
  const rawWriteStream = fs.createWriteStream(rawDestFile, { flags: "w+" });
  const numTokens = obj.numTokens;
  if (!Number.isInteger(numTokens) || numTokens < 0 || numTokens > 0xffffffff) {
    throw new Error(
      `obj.numTokens must fit in an unsigned 32-bit integer: ${numTokens}`
    );
  }
  rawWriteStream.write(new Uint32Array([numTokens]));
  // @ts-expect-error
  obj.indices = prepareAllIndices(
    obj.indices,
    obj.idTable,
    numTokens,
    rawWriteStream,
    4 // 4 bytes because we wrote a u32 for `numTokens` above
  );
  const replacer = (_key: string, value: any) => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
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

function prepareAllIndices(
  indices: InProgressLatinCorpus["indices"],
  idTable: InProgressLatinCorpus["idTable"],
  numTokens: number,
  writer: fs.WriteStream,
  startOffset: number
) {
  const converted: Record<string, StoredMapValue[]> = {};
  let offset = startOffset;
  for (const [key, indexData] of Object.entries(indices)) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const indexType = key as keyof CorpusIndexKeyTypes;
    const [convertedEntries, newOffset] = prepareIndices(
      indexType,
      indexData,
      numTokens,
      idTable,
      writer,
      offset
    );
    offset = newOffset;
    converted[indexType] = convertedEntries;
  }
  return converted;
}

function shouldForceBitmask(
  indexType: keyof CorpusIndexKeyTypes,
  i: number,
  idTable: InProgressLatinCorpus["idTable"]
): boolean {
  if (indexType !== "breaks") {
    return false;
  }
  // Just iterate over all the breaks, since there are only a few.
  for (const [breakType, id] of idTable.breaks.entries()) {
    if (id === i && breakType === "hard") {
      return true;
    }
  }
  return false;
}

function prepareIndices(
  indexType: keyof CorpusIndexKeyTypes,
  indices: number[][],
  numTokens: number,
  idTable: InProgressLatinCorpus["idTable"],
  writer: fs.WriteStream,
  startOffset: number
): [StoredMapValue[], number] {
  const convertedEntries: StoredMapValue[] = [];
  let offset = startOffset;
  indices.forEach((index, i) => {
    const forceBitmask = shouldForceBitmask(indexType, i, idTable);
    const useBitMask = forceBitmask || index.length * 32 > numTokens;
    const [storedValue, newOffset] = prepareSingleIndex(
      useBitMask,
      numTokens,
      index,
      writer,
      offset
    );
    offset = newOffset;
    convertedEntries.push(storedValue);
  });
  return [convertedEntries, offset];
}

function prepareSingleIndex(
  useBitMask: boolean,
  numTokens: number,
  index: number[],
  writer: fs.WriteStream,
  startOffset: number
): [StoredMapValue, number] {
  let offset = startOffset;
  // Bitmasks are interpreted on the Rust side as a vector of 64 bit integers.
  // To avoid having to handle misaligned data, make sure it's 64-bit aligned.
  if (useBitMask) {
    const alignment = 8;
    const padding = (alignment - (offset % alignment)) % alignment;
    if (padding > 0) {
      writer.write(Buffer.alloc(padding));
      offset += padding;
    }
  }

  const indexBytes = useBitMask
    ? Buffer.from(toBitMask(index, numTokens).buffer)
    : Buffer.from(new Uint32Array(index).buffer);
  const indexLen = indexBytes.byteLength;
  const storedValue: StoredMapValue = useBitMask
    ? { offset, numSet: index.length }
    : { offset, len: index.length };
  writer.write(indexBytes);
  offset += indexLen;
  return [storedValue, offset];
}
