import { assert } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  createEmptyCorpusIndex,
  type CorpusInputWork,
  type InProgressLatinCorpus,
} from "@/common/library/corpus/corpus_common";
import { writeCorpus } from "@/common/library/corpus/corpus_serialization";
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

/**
 * Absorbs the given work in the corpus.
 *
 * @param work The processed work to absorb.
 * @param corpus The corpus to absorb the work into.
 * @param startId The last ID used in the corpus (not used here, but kept
 */
function absorbWork(
  work: CorpusInputWork,
  corpus: InProgressLatinCorpus,
  getInflections: (word: string) => CrunchResult[],
  startId: number
): number {
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
  let currentId = startId;

  assert(work.rows.length > 0, "Work must have at least one row.");

  function isHardBreak(rowIdx: number): boolean {
    if (rowIdx === 0 || currentId === 0) {
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
      corpus.hardBreakAfter[currentId - 1] = true;
    }

    const rowStartId = currentId;
    for (const [token, isWord] of processTokens(rowText)) {
      if (!isWord) {
        // This should handle abbreviations.
        // We should either generate a list of abbreviations that we exclude,
        // or we can simply de-rank these matches.
        if (token.includes(".") && currentId > 0) {
          corpus.hardBreakAfter[currentId - 1] = true;
        }
        continue;
      }
      const stripped = token
        .normalize("NFD")
        .replaceAll("\u0304", "")
        .replaceAll("\u0306", "");
      wordIndex.add(stripped.toLowerCase(), currentId);

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
        lemmaIndex.add(lemma, currentId);
      }
      for (const c of cases) {
        casesIndex.add(c, currentId);
      }
      for (const n of number) {
        numberIndex.add(n, currentId);
      }
      for (const g of gender) {
        genderIndex.add(g, currentId);
      }
      for (const t of tense) {
        tenseIndex.add(t, currentId);
      }
      for (const p of person) {
        personIndex.add(p, currentId);
      }
      for (const m of mood) {
        moodIndex.add(m, currentId);
      }
      for (const v of voice) {
        voiceIndex.add(v, currentId);
      }

      wordsInWork += 1;
      currentId += 1;
      corpus.hardBreakAfter.push(false);
    }
    corpus.workRowRanges[corpus.workRowRanges.length - 1][1].push([
      rowIdx,
      rowStartId,
      currentId,
    ]);
  });
  corpus.stats.totalWords += wordsInWork;
  corpus.stats.totalWorks += 1;
  corpus.hardBreakAfter[currentId - 1] = true;
  return currentId;
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
  let tokenId = 0;
  const corpus = createEmptyCorpusIndex();
  for (const work of iterableWorks) {
    tokenId = absorbWork(work, corpus, getInflections, tokenId);
  }
  corpus.maxTokenId = tokenId;
  corpus.stats.uniqueWords = corpus.indices.word.size;
  corpus.stats.uniqueLemmata = corpus.indices.lemma.size;

  writeCorpus(corpus);
  console.log(`Corpus stats:`, corpus.stats);
  console.log(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
