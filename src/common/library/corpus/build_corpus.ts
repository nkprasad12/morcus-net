import { assert, assertEqual } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  CORPUS_TOKEN_DB,
  createEmptyCorpusIndex,
  type CorpusInputWork,
  type InProgressLatinCorpus,
} from "@/common/library/corpus/corpus_common";
import { writeCorpus } from "@/common/library/corpus/corpus_serialization";
import { ARRAY_INDEX, ReadOnlyDb } from "@/common/sql_helper";
import { processTokens } from "@/common/text_cleaning";
import { cleanLemma, crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions, type CrunchResult } from "@/morceus/cruncher_types";
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

/** Absorbs the given work in the corpus. */
function absorbWork(
  work: CorpusInputWork,
  corpus: InProgressLatinCorpus,
  getInflections: (word: string) => CrunchResult[],
  tokens: string[],
  breaks: (string | null)[]
) {
  console.debug(`Processing work: ${work.id}`);
  const wordIndex = arrayMap(corpus.indices.word);
  const lemmaIndex = arrayMap(corpus.indices.lemma);
  const casesIndex = arrayMap(corpus.indices.case);
  const numberIndex = arrayMap(corpus.indices.number);
  const genderIndex = arrayMap(corpus.indices.gender);
  const tenseIndex = arrayMap(corpus.indices.tense);
  const personIndex = arrayMap(corpus.indices.person);
  const moodIndex = arrayMap(corpus.indices.mood);
  const voiceIndex = arrayMap(corpus.indices.voice);

  corpus.workRowRanges.push([corpus.workLookup.length, []]);
  corpus.workLookup.push([work.id, work.rowIds]);
  let wordsInWork = 0;

  assert(work.rows.length > 0, "Work must have at least one row.");

  function isHardBreak(rowIdx: number): boolean {
    if (rowIdx === 0 || tokens.length === 0) {
      return false;
    }
    const currentRowSectionId = work.rowIds[rowIdx];
    const prevRowSectionId = work.rowIds[rowIdx - 1];
    // Break between e.g. 1.2 and 1.2.1
    // This generates breaks between things like headers.
    if (currentRowSectionId.length !== prevRowSectionId.length) {
      return true;
    }
    // Only consider matches on leaf siblings, e.g 1.2.1 and 1.2.2
    for (let i = 0; i < currentRowSectionId.length - 1; i++) {
      if (currentRowSectionId[i] !== prevRowSectionId[i]) {
        return true;
      }
    }
    return false;
  }

  work.rows.forEach((rowText, rowIdx) => {
    if (isHardBreak(rowIdx)) {
      corpus.hardBreakAfter[tokens.length - 1] = true;
    }

    const rowStartId = tokens.length;
    for (const [token, isWord] of processTokens(rowText)) {
      if (!isWord) {
        assertEqual(tokens.length, breaks.length);
        breaks[tokens.length - 1] = token;
        // This should handle abbreviations.
        // We should either generate a list of abbreviations that we exclude,
        // or we can simply de-rank these matches.
        if (token.includes(".") && tokens.length > 0) {
          corpus.hardBreakAfter[tokens.length - 1] = true;
        }
        continue;
      }
      const stripped = token
        .normalize("NFD")
        .replaceAll("\u0304", "")
        .replaceAll("\u0306", "");
      wordIndex.add(stripped.toLowerCase(), tokens.length);

      // Calculate the unique dimensions for the word.
      const lemmata = new Set<string>();
      const cases = new Set<LatinCase>();
      const number = new Set<LatinNumber>();
      const gender = new Set<LatinGender>();
      const tense = new Set<LatinTense>();
      const person = new Set<LatinPerson>();
      const mood = new Set<LatinMood>();
      const voice = new Set<LatinVoice>();
      for (const result of getInflections(stripped)) {
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

      for (const lemma of lemmata) {
        lemmaIndex.add(lemma, tokens.length);
      }
      for (const c of cases) {
        casesIndex.add(c, tokens.length);
      }
      for (const n of number) {
        numberIndex.add(n, tokens.length);
      }
      for (const g of gender) {
        genderIndex.add(g, tokens.length);
      }
      for (const t of tense) {
        tenseIndex.add(t, tokens.length);
      }
      for (const p of person) {
        personIndex.add(p, tokens.length);
      }
      for (const m of mood) {
        moodIndex.add(m, tokens.length);
      }
      for (const v of voice) {
        voiceIndex.add(v, tokens.length);
      }

      wordsInWork += 1;
      tokens.push(stripped);
      breaks.push(null);
      corpus.hardBreakAfter.push(false);
    }
    corpus.workRowRanges[corpus.workRowRanges.length - 1][1].push([
      rowIdx,
      rowStartId,
      tokens.length,
    ]);
  });
  corpus.stats.totalWords += wordsInWork;
  corpus.stats.totalWorks += 1;
  corpus.hardBreakAfter[tokens.length - 1] = true;
}

function saveTokenDb(tokens: string[], breaks: (string | null)[]) {
  const zippedText = tokens.map((token, index) => ({
    token,
    break: breaks[index] ? breaks[index] : "",
  }));
  ReadOnlyDb.saveToSql({
    destination: CORPUS_TOKEN_DB,
    tables: [
      {
        records: zippedText,
        primaryKey: ARRAY_INDEX,
        tableName: "raw_text",
      },
    ],
  });
}

export function buildCorpus(iterableWorks: Iterable<CorpusInputWork>) {
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
  const breaks: (string | null)[] = [];
  const corpus = createEmptyCorpusIndex();
  for (const work of iterableWorks) {
    absorbWork(work, corpus, getInflections, tokens, breaks);
  }
  corpus.maxTokenId = tokens.length;
  corpus.stats.uniqueWords = corpus.indices.word.size;
  corpus.stats.uniqueLemmata = corpus.indices.lemma.size;

  saveTokenDb(tokens, breaks);
  writeCorpus(corpus);
  console.log(`Corpus stats:`, corpus.stats);
  console.log(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
