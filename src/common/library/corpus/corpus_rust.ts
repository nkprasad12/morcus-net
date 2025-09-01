import { CORPUS_DIR } from "@/common/library/corpus/corpus_common";
import { singletonOf } from "@/common/misc_utils";
import { timed } from "@/common/timing/timed_invocation";
import type { CorpusQueryRequest } from "@/web/api_routes";

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
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const query_engine = require(`${process.cwd()}/build/corpus-rust-bindings`);
      this.engine = new query_engine.QueryEngineWrapper(corpusDir);
    } catch (error) {
      throw "Missing Rust corpus bindings. Run `npm run setup-node-bindgen`.";
    }
  }

  queryCorpus(query: string, pageStart?: number, pageSize?: number): string {
    if (query.length > 100) {
      throw new Error("Query is too long");
    }
    return this.engine.query(query, pageStart ?? 0, pageSize ?? 50, 25);
  }
}

export interface CorpusQueryHandler {
  initialize: () => void;
  runQuery: (request: CorpusQueryRequest) => string;
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
