import { buildCorpus } from "@/common/library/corpus/build_corpus";
import type {
  CorpusQuery,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import { loadCorpus } from "@/common/library/corpus/corpus_serialization";
import { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";

const QUERY: CorpusQuery = {
  parts: [{ word: "oscula" }, { lemma: "natus" }],
};

function printQuery(query: CorpusQuery): string {
  return query.parts
    .map((part) => {
      if ("word" in part) {
        return `[word:${part.word}]`;
      } else if ("lemma" in part) {
        return `[lemma:${part.lemma}]`;
      }
      throw new Error(`Unknown query part: ${JSON.stringify(part)}`);
    })
    .join(" ");
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

function measureMemoryUsage<T>(runnable: () => T): T {
  if (typeof global.gc !== "function") {
    return runnable();
  }
  global.gc();
  const memoryBefore = process.memoryUsage().heapUsed;
  const result = runnable();
  // Keep the result in memory for the measurement.
  void result;
  global.gc();
  const memoryAfter = process.memoryUsage().heapUsed;

  const memoryUsed = (memoryAfter - memoryBefore) / 1024 / 1024;
  console.log(`Memory usage is approximately ${memoryUsed.toFixed(2)} MB`);
  return result;
}

function runQuery(
  corpus: CorpusQueryEngine,
  query: CorpusQuery
): CorpusQueryResult[] {
  const startTime = Date.now();
  const results = corpus.queryCorpus(query);
  console.log(`Found results in ${Date.now() - startTime} ms`);
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

// To profile memory, run:
// ./node_modules/.bin/esbuild src/common/library/corpus/corpus_driver.ts --bundle --outfile=corpus_driver.js --platform=node --minify
// to build the driver bundle.
// Then, run via `node --expose-gc corpus_driver.js` to run.

driver();
