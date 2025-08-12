import { buildCorpus } from "@/common/library/corpus/build_corpus";
import type {
  CorpusQuery,
  CorpusQueryAtom,
  CorpusQueryMatch,
  CorpusQueryPart,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import { loadCorpus } from "@/common/library/corpus/corpus_serialization";
import { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";
import { parseQuery } from "@/common/library/corpus/query_utils";
import { exhaustiveGuard, getFormattedMemoryUsage } from "@/common/misc_utils";
import { LatinCase } from "@/morceus/types";

const QUERY: CorpusQuery = {
  parts: [
    { token: { word: "quam" } },
    { token: { lemma: "ob" } },
    { token: { category: "case", value: LatinCase.Accusative } },
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

function printQueryPart(part: CorpusQueryPart["token"]): string {
  if (!("atoms" in part)) {
    return `[${printAtom(part)}]`;
  }
  const joiner = ` ${part.composition} `;
  return `[${part.atoms.map(printAtom).join(joiner)}]`;
}

function printQuery(query: CorpusQuery): string {
  const resultParts: string[] = [];
  for (let i = 0; i < query.parts.length; i++) {
    resultParts.push(printQueryPart(query.parts[i].token));
    const gap = query.parts[i].gap;
    if (gap === undefined) {
      resultParts.push(" ");
      continue;
    }
    resultParts.push(` ${gap.maxDistance}~${gap.directed ? ">" : ""} `);
  }
  return resultParts.join("");
}

function formatQueryResult(result: CorpusQueryMatch): string {
  return `- ${result.workId} @ ${result.section} (offset: ${result.offset})\n  ${result.text}`;
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
  query: CorpusQuery,
  limit?: number
): CorpusQueryResult {
  const startTime = Date.now();
  const results = corpus.queryCorpus(query, 0, limit);
  const elapsedTime = Date.now() - startTime;
  console.log("Query: ", printQuery(query));
  results.matches.forEach((result) => {
    console.log(formatQueryResult(result));
  });
  console.log(`Found ${results.totalResults} results in ${elapsedTime} ms`);
  console.log(
    results.timing
      ?.map(([name, time]) => `- ${time.toFixed(2)} ms [${name}]`)
      .join("\n")
  );
  return results;
}

async function driver() {
  if (process.env.BUILD_CORPUS === "1") {
    buildCorpus(latinWorksFromLibrary());
  }
  const argQuery = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  const query = argQuery === undefined ? QUERY : parseQuery(argQuery);
  // console.log(getFormattedMemoryUsage());
  const corpus = getCorpus();
  // for (let i = 0; i < 10; i++) {
  //   await new Promise((resolve) => setTimeout(resolve, 5000));
  //   console.log(getFormattedMemoryUsage());
  // }
  runQuery(corpus, query, limit);
}

/* To profile memory, run:

./node_modules/.bin/esbuild src/common/library/corpus/corpus_driver.ts \
  --bundle --outfile=corpus_driver.js --platform=node --external:bun:sqlite --minify \
&& node --expose-gc corpus_driver.js "[case:3] [case:2] [case:1] [case:2]" \
&& rm corpus_driver.js

*/

driver();
