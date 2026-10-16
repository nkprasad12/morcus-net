/**
 * A fake `CorpusEngine` for tests: returns canned `CorpusQueryResult` JSON
 * without the Rust bindings.
 */

import type {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import type { CorpusQueryRequest } from "@/common/library/corpus/corpus_common";
import type { CorpusEngine } from "@/web/v2/corpus/corpus_query.server";

/** In `MOCK_V2_SUMMARIES` as `caesar/de_bello_gallico`. */
export const CAESAR_ID = "phi0448.phi001.perseus-lat2";

export const CORPUS_TEST_AUTHORS: readonly string[] = [
  "Caesar",
  "Cicero",
  "Seneca Major",
];

export function fakeMatch(
  overrides: Partial<CorpusQueryMatch["metadata"]> = {},
  text: CorpusQueryMatch["text"] = [
    ["Gallia est ", false],
    ["omnis", true],
    [" divisa in partes tres", false],
  ]
): CorpusQueryMatch {
  return {
    metadata: {
      workId: CAESAR_ID,
      workName: "De Bello Gallico",
      author: "Caesar",
      leaders: [["1.1", 11, 5]],
      ...overrides,
    },
    text,
  };
}

export function fakeResult(
  overrides: Partial<CorpusQueryResult> = {}
): CorpusQueryResult {
  return {
    matches: [fakeMatch()],
    resultStats: { estimatedResults: 1 },
    timing: [["query", 1.25]],
    ...overrides,
  };
}

export interface FakeCorpusEngine extends CorpusEngine {
  readonly requests: CorpusQueryRequest[];
}

/** An engine that answers every query with `respond(request)`. */
export function fakeCorpusEngine(
  respond: (request: CorpusQueryRequest) => CorpusQueryResult | string = () =>
    fakeResult()
): FakeCorpusEngine {
  const requests: CorpusQueryRequest[] = [];
  return {
    requests,
    runQuery: (request) => {
      requests.push(request);
      const result = respond(request);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
  };
}

/** An engine whose every query throws `error`. */
export function throwingCorpusEngine(error: unknown): CorpusEngine {
  return {
    runQuery: () => {
      throw error;
    },
  };
}
