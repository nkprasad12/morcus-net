import { assert, assertEqual, checkPresent } from "@/common/assert";
import {
  CORPUS_DIR,
  CORPUS_INFLECTIONS_OFFSETS,
  CORPUS_INFLECTIONS_RAW_DATA,
  CORPUS_RAW_TEXT,
  createEmptyCorpusIndex,
  type CorpusInputWork,
  type CorpusStringKeyIndexTypes,
  type InProgressLatinCorpus,
} from "@/common/library/corpus/corpus_common";
import { writeCorpus } from "@/common/library/corpus/corpus_serialization";
import { bytesToMib } from "@/common/misc_utils";
import { processTokens } from "@/common/text_cleaning";
import { cleanLemma, crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions, type CrunchResult } from "@/morceus/cruncher_types";
import { packWordInflectionData } from "@/morceus/inflection_data_utils";
import {
  LatinCase,
  LatinNumber,
  type DataField,
  type LatinGender,
  type LatinMood,
  type LatinPerson,
  type LatinTense,
  type LatinVoice,
} from "@/morceus/types";

import fs from "fs";
import path from "path";

type LengthAndOffset = [offset: number, length: number];
interface StoredInflections {
  // The `i`th element is the offset in `rawData` for the `i`th token.
  tokenToRawDataOffset: LengthAndOffset[];
  // Map from word to (offset, len) in rawData.
  wordToRawDataOffset: Map<string, LengthAndOffset>;
  // Sequence of 32 bit integers; each represents one possible inflection
  // of a token.
  rawData: number[];
  // Dimensions to add to indices.
  dimensions: Map<string, WordIndexDimensions>;
}

namespace StoredInflections {
  export function makeNew(): StoredInflections {
    return {
      // This will represent word with no results.
      rawData: [0],
      tokenToRawDataOffset: [],
      wordToRawDataOffset: new Map(),
      dimensions: new Map(),
    };
  }

  export function save(
    dir: string,
    storage: StoredInflections
  ): [string, string] {
    const rawDataBuffer = Buffer.alloc(storage.rawData.length * 4);
    for (let i = 0; i < storage.rawData.length; i++) {
      rawDataBuffer.writeUInt32LE(storage.rawData[i], i * 4);
    }
    const rawDataPath = path.join(dir, CORPUS_INFLECTIONS_RAW_DATA);
    fs.writeFileSync(rawDataPath, rawDataBuffer);

    const offsetsBuffer = Buffer.alloc(storage.tokenToRawDataOffset.length * 4);
    for (let i = 0; i < storage.tokenToRawDataOffset.length; i++) {
      const [offset, length] = storage.tokenToRawDataOffset[i];
      assert(
        Number.isInteger(offset) && offset >= 0 && offset < 1 << 24,
        `Offset must be an integer in [0, 2^24) for token ${i}: ${offset}`
      );
      assert(
        Number.isInteger(length) && length >= 0 && length < 1 << 8,
        `Length must be an integer in [0, 2^8) for token ${i}: ${length}`
      );
      // Pack: first 3 bytes = offset, last byte = length.
      // Use >>> 0 to ensure an unsigned 32-bit value when writing.
      const packed = ((offset << 8) | (length & 0xff)) >>> 0;
      offsetsBuffer.writeUInt32LE(packed, i * 4);
    }
    const offsetsPath = path.join(dir, CORPUS_INFLECTIONS_OFFSETS);
    fs.writeFileSync(offsetsPath, offsetsBuffer);
    return [rawDataPath, offsetsPath];
  }

  export function ingest(
    word: string,
    getInflections: (word: string) => CrunchResult[],
    storage: StoredInflections
  ) {
    const cachedOffset = storage.wordToRawDataOffset.get(word);
    if (cachedOffset !== undefined) {
      // If the word has been seen before, just point to the existing data.
      storage.tokenToRawDataOffset.push(cachedOffset);
      return;
    }
    const inflections = getInflections(word);
    storage.dimensions.set(word, getWordIndexDimensions(inflections));
    const encoded = Array.from(
      new Set(
        inflections.map((inflection) =>
          packWordInflectionData(inflection.grammaticalData)
        )
      )
    );
    if (encoded.length === 0 || (encoded.length === 1 && encoded[0] === 0)) {
      // No inflections or only uninflected results.
      // Point to the zero entry at the start of rawData.
      storage.tokenToRawDataOffset.push([0, 1]);
      return;
    }
    // Point to the start of the raw buffer, and write the data there.
    storage.tokenToRawDataOffset.push([storage.rawData.length, encoded.length]);
    storage.rawData.push(...encoded);
    storage.wordToRawDataOffset.set(word, [
      storage.rawData.length,
      encoded.length,
    ]);
  }
}

interface WordIndexDimensions {
  lemmata: Set<string>;
  cases: Set<LatinCase>;
  number: Set<LatinNumber>;
  gender: Set<LatinGender>;
  tense: Set<LatinTense>;
  person: Set<LatinPerson>;
  mood: Set<LatinMood>;
  voice: Set<LatinVoice>;
}

function getWordIndexDimensions(
  inflections: CrunchResult[]
): WordIndexDimensions {
  const lemmata = new Set<string>();
  const cases = new Set<LatinCase>();
  const number = new Set<LatinNumber>();
  const gender = new Set<LatinGender>();
  const tense = new Set<LatinTense>();
  const person = new Set<LatinPerson>();
  const mood = new Set<LatinMood>();
  const voice = new Set<LatinVoice>();
  for (const result of inflections) {
    lemmata.add(cleanLemma(result.lemma));
    const inflection = result.grammaticalData;
    absorbDataField(cases, inflection.case);
    absorbDataField(number, inflection.number);
    absorbDataField(gender, inflection.gender);
    absorbDataField(tense, inflection.tense);
    absorbDataField(person, inflection.person);
    absorbDataField(mood, inflection.mood);
    absorbDataField(voice, inflection.voice);
  }
  return {
    lemmata,
    cases,
    number,
    gender,
    tense,
    person,
    mood,
    voice,
  };
}

function absorbDataField<T>(set: Set<T>, value: DataField<T>) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    set.add(value);
    return;
  }
  for (const item of value) {
    set.add(item);
  }
  return;
}

function makeLookup<T>(array: number[][], mapper: (item: T) => number) {
  return {
    add: (key: T, tokenIndex: number) => {
      const i = mapper(key);
      while (array.length <= i) {
        array.push([]);
      }
      array[i].push(tokenIndex);
    },
  };
}

function stringIndexMapper(
  key: keyof CorpusStringKeyIndexTypes,
  corpus: InProgressLatinCorpus
) {
  return (item: string) => {
    if (!corpus.idTable[key].has(item)) {
      corpus.idTable[key].set(item, corpus.idTable[key].size);
    }
    return checkPresent(corpus.idTable[key].get(item));
  };
}

/** Absorbs the given work in the corpus. */
function absorbWork(
  work: CorpusInputWork,
  corpus: InProgressLatinCorpus,
  getInflections: (word: string) => CrunchResult[],
  tokens: string[],
  breaks: string[],
  storedInflections: StoredInflections
) {
  console.debug(
    `Ingesting into corpus: ${work.workName} (${work.author}) - ${work.id}`
  );
  const wordIndex = makeLookup(
    corpus.indices.word,
    stringIndexMapper("word", corpus)
  );
  const lemmaIndex = makeLookup(
    corpus.indices.lemma,
    stringIndexMapper("lemma", corpus)
  );
  const breaksIndex = makeLookup(
    corpus.indices.breaks,
    stringIndexMapper("breaks", corpus)
  );

  const casesIndex = makeLookup<LatinCase>(corpus.indices.case, (x) => x);
  const numberIndex = makeLookup<LatinNumber>(corpus.indices.number, (x) => x);
  const genderIndex = makeLookup<LatinGender>(corpus.indices.gender, (x) => x);
  const tenseIndex = makeLookup<LatinTense>(corpus.indices.tense, (x) => x);
  const personIndex = makeLookup<LatinPerson>(corpus.indices.person, (x) => x);
  const moodIndex = makeLookup<LatinMood>(corpus.indices.mood, (x) => x);
  const voiceIndex = makeLookup<LatinVoice>(corpus.indices.voice, (x) => x);
  corpus.workLookup.push([
    work.id,
    work.rowIds.map((id) => [id.join("."), 0, 0] as const),
    { name: work.workName, author: work.author },
  ]);
  let wordsInWork = 0;

  assert(work.rows.length > 0, "Work must have at least one row.");

  type HardBreak = 2;
  type SoftBreak = 1;
  type NoBreak = 0;
  type BreakType = HardBreak | SoftBreak | NoBreak;
  function isBreak(rowIdx: number): BreakType {
    if (rowIdx === 0 || tokens.length === 0) {
      return 0;
    }
    const currentRowSectionId = work.rowIds[rowIdx];
    const prevRowSectionId = work.rowIds[rowIdx - 1];
    // Break between e.g. 1.2 and 1.2.1
    // This generates breaks between things like headers.
    if (currentRowSectionId.length !== prevRowSectionId.length) {
      return 2;
    }
    // Only consider matches on leaf siblings, e.g 1.2.1 and 1.2.2
    for (let i = 0; i < currentRowSectionId.length - 1; i++) {
      if (currentRowSectionId[i] !== prevRowSectionId[i]) {
        return 2;
      }
    }
    return 1;
  }

  work.rows.forEach((rowText, rowIdx) => {
    const breakType = isBreak(rowIdx);
    if (breakType === 2) {
      breaksIndex.add("hard", tokens.length - 1);
    }
    if (breakType === 1) {
      breaks[tokens.length - 1] += "\n";
    }

    const rowStartId = tokens.length;
    for (const [token, isWord] of processTokens(rowText)) {
      if (!isWord) {
        assertEqual(tokens.length, breaks.length);
        breaks[tokens.length - 1] += token;
        // This should handle abbreviations.
        // We should either generate a list of abbreviations that we exclude,
        // or we can simply de-rank these matches.
        if (token.includes(".") && tokens.length > 0) {
          breaksIndex.add("hard", tokens.length - 1);
        }
        continue;
      }
      const stripped = token
        .normalize("NFD")
        .replaceAll("\u0304", "")
        .replaceAll("\u0306", "");
      const normalizedWord = stripped.toLowerCase();
      wordIndex.add(normalizedWord, tokens.length);

      StoredInflections.ingest(
        normalizedWord,
        getInflections,
        storedInflections
      );

      const dimensions = checkPresent(
        storedInflections.dimensions.get(normalizedWord)
      );
      for (const lemma of dimensions.lemmata) {
        lemmaIndex.add(lemma, tokens.length);
      }
      for (const c of dimensions.cases) {
        casesIndex.add(c, tokens.length);
      }
      for (const n of dimensions.number) {
        numberIndex.add(n, tokens.length);
      }
      for (const g of dimensions.gender) {
        genderIndex.add(g, tokens.length);
      }
      for (const t of dimensions.tense) {
        tenseIndex.add(t, tokens.length);
      }
      for (const p of dimensions.person) {
        personIndex.add(p, tokens.length);
      }
      for (const m of dimensions.mood) {
        moodIndex.add(m, tokens.length);
      }
      for (const v of dimensions.voice) {
        voiceIndex.add(v, tokens.length);
      }

      wordsInWork += 1;
      tokens.push(stripped);
      // Add a space as a placeholder.
      breaks.push("");
    }
    const lookupEntry =
      corpus.workLookup[corpus.workLookup.length - 1][1][rowIdx];
    lookupEntry[1] = rowStartId;
    lookupEntry[2] = tokens.length;
  });
  corpus.stats.totalWords += wordsInWork;
  corpus.stats.totalWorks += 1;
  breaksIndex.add("hard", tokens.length - 1);
}

function saveTokenDb(tokens: string[], breaks: string[], corpusDir: string) {
  assertEqual(tokens.length, breaks.length);

  const all: string[] = [];
  const tokenStarts: number[] = new Array(tokens.length);
  const breakStarts: number[] = new Array(tokens.length);
  let bytesRead = 0;

  for (let i = 0; i < tokens.length; i++) {
    tokenStarts[i] = bytesRead;
    all.push(tokens[i]);
    bytesRead += Buffer.from(tokens[i], "utf-8").byteLength;
    breakStarts[i] = bytesRead;
    all.push(breaks[i]);
    bytesRead += Buffer.from(breaks[i], "utf-8").byteLength;
  }

  const destination = path.join(corpusDir, CORPUS_RAW_TEXT);
  if (!fs.existsSync(corpusDir)) {
    fs.mkdirSync(corpusDir, { recursive: true });
  }
  fs.writeFileSync(destination, all.join(""), "utf-8");
  return [tokenStarts, breakStarts, destination] as const;
}

function printArtifactSummary(corpusDir: string) {
  try {
    const files = fs.readdirSync(corpusDir);
    console.debug("Corpus directory contents:");
    for (const file of files) {
      if (file.endsWith("-wal") || file.endsWith("-shm")) {
        continue; // Skip SQLite WAL and SHM files.
      }
      const filePath = `${corpusDir}/${file}`;
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const content = fs.readFileSync(filePath);
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          hash = (hash << 5) - hash + char;
          hash |= 0; // Convert to 32bit integer
        }
        console.debug(
          `  - ${file}: ${bytesToMib(stat.size)} MB, hash: ${hash.toString(16)}`
        );
      }
    }
  } catch (e) {
    console.error("Could not read corpus directory", e);
  }
}

export async function buildCorpus(
  iterableWorks: Iterable<CorpusInputWork>,
  corpusDir: string = CORPUS_DIR
) {
  const tables = MorceusTables.CACHED.get();
  const startTime = Date.now();
  const crunchOptions: CruncherOptions = {
    ...CruncherOptions.DEFAULT,
    // We don't mind duplicate results because we only mark whether each
    // token COULD BE intepreted as a particular lemma, case, etc...
    // This experimentally reduces the total time for all crunch calls
    // by about 1/3 (or ~5 seconds on my machine).
    skipConsolidation: true,
  };
  const getInflections = (word: string) =>
    crunchWord(word, tables, crunchOptions);
  const tokens: string[] = [];
  const breaks: string[] = [];
  const corpus = createEmptyCorpusIndex();
  const storedInflections = StoredInflections.makeNew();

  let i = 0;
  for (const work of iterableWorks) {
    absorbWork(work, corpus, getInflections, tokens, breaks, storedInflections);
    const author = work.authorCode;
    const authorData = corpus.authorLookup[author];
    if (authorData === undefined) {
      corpus.authorLookup[author] = [i, i];
    } else {
      assertEqual(
        authorData[1],
        i - 1,
        `Author works are not contiguous: ${author}`
      );
      authorData[1] = i;
    }
    i += 1;
  }
  console.debug(`Corpus processing runtime: ${Date.now() - startTime}ms`);

  corpus.numTokens = tokens.length;
  corpus.stats.uniqueWords = corpus.indices.word.length;
  corpus.stats.uniqueLemmata = corpus.indices.lemma.length;

  const tokenDb = saveTokenDb(tokens, breaks, corpusDir);
  corpus.tokenStarts = tokenDb[0];
  corpus.breakStarts = tokenDb[1];
  corpus.rawTextPath = tokenDb[2];

  const inflectionData = StoredInflections.save(corpusDir, storedInflections);
  corpus.inflectionsRawBufferPath = inflectionData[0];
  corpus.inflectionsOffsetsPath = inflectionData[1];

  await writeCorpus(corpus, corpusDir);
  printArtifactSummary(corpusDir);
  console.debug(`Corpus stats:`, corpus.stats);
  console.debug(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
