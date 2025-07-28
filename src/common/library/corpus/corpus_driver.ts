import { buildCorpus } from "@/common/library/corpus/build_corpus";
import {
  loadCorpus,
  type CorpusQuery,
  type CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
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
  const corpus = loadCorpus();
  return new CorpusQueryEngine(corpus);
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

function driver() {
  if (process.env.BUILD_CORPUS === "1") {
    buildCorpus(latinWorksFromLibrary());
  }
  const corpus = getCorpus();
  runQuery(corpus, QUERY);
}

driver();
