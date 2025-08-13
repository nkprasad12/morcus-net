import { assertType } from "@/common/assert";
import {
  CorpusQueryResult,
  type CorpusQueryHandler,
} from "@/common/library/corpus/corpus_common";
import { singletonOf } from "@/common/misc_utils";
import { timed } from "@/common/timing/timed_invocation";

export function rustCorpusApiHandler(): CorpusQueryHandler {
  const engine = singletonOf(() =>
    timed(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const query_engine = require("../../../../dist");
      return new query_engine.QueryEngineWrapper();
    }, "Rust corpus init")
  );
  return {
    initialize: () => engine.get(),
    runQuery: async (request) => {
      const pageStart = request.pageStart ?? 0;
      const pageSize = request.pageSize ?? 50;
      const raw = engine.get().query(request.query, pageStart, pageSize);
      return assertType(JSON.parse(raw), CorpusQueryResult.isMatch);
    },
  };
}
