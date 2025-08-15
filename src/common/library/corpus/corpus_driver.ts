/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import type {
  CorpusQueryHandler,
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import { rustCorpusApiHandler } from "@/common/library/corpus/corpus_rust";
import { jsCorpusApiHandler } from "@/common/library/corpus/query_utils";
import { getFormattedMemoryUsage } from "@/common/misc_utils";
import type { CorpusQueryRequest } from "@/web/api_routes";

function formatQueryResult(result: CorpusQueryMatch): string {
  return `- ${result.workId} @ ${result.section} (offset: ${result.offset})\n  ${result.text}`;
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
  const startTime = Date.now();
  const results = handler.runQuery(request);
  const elapsedTime = Date.now() - startTime;
  console.log("Query: ", request.query);
  results.matches.forEach((result) => {
    console.log(formatQueryResult(result));
  });
  console.log(`Found ${results.totalResults} results in ${elapsedTime} ms`);
  if ("timing" in results) {
    // @ts-expect-error
    const timing: [string, number][] = results.timing;
    console.log(
      timing
        ?.map(([name, time]) => `- ${time.toFixed(2)} ms [${name}]`)
        .join("\n")
    );
  }

  return results;
}

async function driver() {
  if (process.env.BUILD_CORPUS === "1") {
    buildCorpus(latinWorksFromLibrary());
  }
  const useJs = process.env.IMPL === "js";
  const engine = useJs ? jsCorpusApiHandler() : rustCorpusApiHandler();
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
&& node --expose-gc corpus_driver.js "[case:3] [case:2] [case:1] [case:2]" \
&& rm corpus_driver.js

*/

driver();
