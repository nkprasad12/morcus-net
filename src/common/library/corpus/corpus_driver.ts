/* istanbul ignore file */

import { assertType, checkPresent } from "@/common/assert";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import {
  rustCorpusApiHandler,
  type CorpusQueryHandler,
} from "@/common/library/corpus/corpus_rust";
import { getFormattedMemoryUsage } from "@/common/misc_utils";
import type { CorpusQueryRequest } from "@/web/api_routes";

function formatQueryResult(result: CorpusQueryMatch): string {
  const data = result.metadata;
  const { author, workName, section } = data;

  // header: author (blue) - workName section (green)
  const out = `  \x1b[34m${author}\x1b[0m - \x1b[32m${workName} ${section}\x1b[0m\n`;

  // prepare chunks to match Rust output
  const chunks: string[] = ["    "];
  const txt: [string, boolean][] = result.text;

  for (const [text, isCore] of txt) {
    const color = isCore ? "\x1b[31m" : "\x1b[90m";
    // indent lines after any newline so subsequent lines align correctly
    const processed = text.replace(/\n/g, "\n    ");
    chunks.push(`${color}${processed}\x1b[0m`);
  }
  chunks.push("\n");

  return out + chunks.join("");
}

function currentMemoryUsage(): number {
  const usage = getFormattedMemoryUsage();
  return usage.rss;
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

function runQuery(handler: CorpusQueryHandler): CorpusQueryResult {
  const pageSize = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  const request: CorpusQueryRequest = {
    query: checkPresent(process.argv[2]),
    pageStart: 0,
    pageSize,
  };
  const startTime = performance.now();
  const resultsRaw = handler.runQuery(request);
  const elapsedTime = performance.now() - startTime;
  const results = assertType(JSON.parse(resultsRaw), CorpusQueryResult.isMatch);

  console.log("Query: ", request.query);
  results.matches.forEach((result) => {
    console.log(formatQueryResult(result));
  });
  console.log(
    `Found ${results.totalResults} results in ${elapsedTime.toFixed(3)} ms`
  );
  if ("timing" in results) {
    // @ts-expect-error
    const timing: [string, number][] = results.timing;
    console.log(
      timing
        ?.map(([name, time]) => `- ${time.toFixed(3)} ms [${name}]`)
        .join("\n")
    );
    const overhead =
      elapsedTime - timing.reduce((sum, [, time]) => sum + time, 0);
    console.log(`Unaccounted: ${overhead.toFixed(3)} ms`);
  }

  return results;
}

async function driver() {
  if (process.env.BUILD_CORPUS === "1") {
    await buildCorpus(latinWorksFromLibrary());
  }
  const engine = rustCorpusApiHandler();
  // console.log(getFormattedMemoryUsage());
  measureMemoryUsage(() => engine.initialize());
  // for (let i = 0; i < 10; i++) {
  //   await new Promise((resolve) => setTimeout(resolve, 5000));
  //   console.log(getFormattedMemoryUsage());
  // }
  runQuery(engine);
}

/* To profile memory, run:

./node_modules/.bin/esbuild src/common/library/corpus/corpus_driver.ts \
  --bundle --outfile=corpus_driver.js --platform=node --external:bun:sqlite --minify \
&& node --expose-gc corpus_driver.js "@case:3 @case:2 @case:1 @case:2" \
&& rm corpus_driver.js

*/

driver();
