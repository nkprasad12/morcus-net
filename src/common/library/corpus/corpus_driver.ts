import { buildCorpus } from "@/common/library/corpus/build_corpus";
import type {
  CorpusQuery,
  CorpusQueryAtom,
  CorpusQueryPart,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import { loadCorpus } from "@/common/library/corpus/corpus_serialization";
import { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";
import { exhaustiveGuard, getFormattedMemoryUsage } from "@/common/misc_utils";
import { LatinCase, LatinNumber } from "@/morceus/types";

const QUERY: CorpusQuery = {
  parts: [
    {
      composition: "and",
      atoms: [
        { category: "case", value: LatinCase.Ablative },
        { category: "number", value: LatinNumber.Plural },
      ],
    },
    { lemma: "cum#1" },
    {
      composition: "and",
      atoms: [
        { category: "case", value: LatinCase.Ablative },
        { category: "number", value: LatinNumber.Plural },
      ],
    },
  ],
};

function printAtom(atom: CorpusQueryAtom): string {
  if ("word" in atom) {
    return `word:${atom.word}`;
  } else if ("lemma" in atom) {
    return `lemma:${atom.lemma}`;
  } else if ("category" in atom) {
    return `${atom.category}:${atom.value}`;
  }
  exhaustiveGuard(atom);
}

function printQueryPart(part: CorpusQueryPart): string {
  if (!("atoms" in part)) {
    return `[${printAtom(part)}]`;
  }
  const joiner = ` ${part.composition} `;
  return `[${part.atoms.map(printAtom).join(joiner)}]`;
}

function printQuery(query: CorpusQuery): string {
  return query.parts.map(printQueryPart).join(" ");
}

function formatQueryResult(result: CorpusQueryResult): string {
  return `- ${result.workId} @ ${result.section} (offset: ${result.offset})`;
}

function getCorpus(): CorpusQueryEngine {
  const startTime = Date.now();
  const corpus = measureMemoryUsage(loadCorpus);
  console.log(`Corpus loaded in ${Date.now() - startTime} ms`);
  return new CorpusQueryEngine(corpus);
}

function currentMemoryUsage(): number {
  const usage = getFormattedMemoryUsage();
  return usage.heapUsed + usage.external + usage.arrayBuffers;
}

function measureMemoryUsage<T>(runnable: () => T): T {
  if (typeof global.gc !== "function") {
    return runnable();
  }
  global.gc();
  const memoryBefore = currentMemoryUsage();
  const result = runnable();
  // Keep the result in memory for the measurement.
  void result;
  global.gc();
  const memoryAfter = currentMemoryUsage();

  const memoryUsed = memoryAfter - memoryBefore;
  console.log(`Memory usage is approximately ${memoryUsed.toFixed(2)} MB`);
  return result;
}

function runQuery(
  corpus: CorpusQueryEngine,
  query: CorpusQuery
): CorpusQueryResult[] {
  const startTime = Date.now();
  const results = corpus.queryCorpus(query);
  console.log(
    `Found ${results.length} results in ${Date.now() - startTime} ms`
  );
  console.log("Query: ", printQuery(query));
  results.forEach((result) => {
    console.log(formatQueryResult(result));
  });
  return results;
}

async function driver() {
  if (process.env.BUILD_CORPUS === "1") {
    buildCorpus(latinWorksFromLibrary());
  }
  // console.log(getFormattedMemoryUsage());
  const corpus = getCorpus();
  // for (let i = 0; i < 10; i++) {
  //   await new Promise((resolve) => setTimeout(resolve, 5000));
  //   console.log(getFormattedMemoryUsage());
  // }
  runQuery(corpus, QUERY);
}

/* To profile memory, run:

./node_modules/.bin/esbuild src/common/library/corpus/corpus_driver.ts --bundle --outfile=corpus_driver.js --platform=node --minify

to build the driver bundle.

Then, use:

node --expose-gc corpus_driver.js
*/

driver();
