import { assertType } from "@/common/assert";
import {
  CORPUS_DIR,
  CorpusQueryResult,
  type CorpusQueryHandler,
} from "@/common/library/corpus/corpus_common";
import { singletonOf } from "@/common/misc_utils";
import { timed } from "@/common/timing/timed_invocation";

/**
 * A query engine that uses Rust for querying the corpus.
 * This is a wrapper around the Rust implementation that allows it to be used in JavaScript.
 *
 * Build the Rust bindings with:
 * `npm run setup-node-bindgen`.
 *
 * The rust code is located in `src/corpus-rust/`.
 */
export class RustCorpusQueryEngine {
  private readonly engine: any;

  constructor(corpusDir: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const query_engine = require(`${process.cwd()}/build/corpus-rust`);
    this.engine = new query_engine.QueryEngineWrapper(corpusDir);
  }

  queryCorpus(
    query: string,
    pageStart?: number,
    pageSize?: number
  ): CorpusQueryResult {
    if (query.length > 100) {
      throw new Error("Query is too long");
    }
    const raw = this.engine.query(query, pageStart ?? 0, pageSize ?? 50);
    return assertType(JSON.parse(raw), CorpusQueryResult.isMatch);
  }
}

export function rustCorpusApiHandler(): CorpusQueryHandler {
  const engine = singletonOf(() =>
    timed(() => new RustCorpusQueryEngine(CORPUS_DIR), "Rust corpus init")
  );
  return {
    initialize: () => engine.get(),
    runQuery: (request) =>
      engine
        .get()
        .queryCorpus(request.query, request.pageStart, request.pageSize),
  };
}
