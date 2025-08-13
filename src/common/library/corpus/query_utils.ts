import type {
  ComposedQuery,
  CorpusQuery,
  CorpusQueryAtom,
  CorpusQueryHandler,
  CorpusQueryPart,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { loadCorpus } from "@/common/library/corpus/corpus_serialization";
import { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";
import { safeParseInt, singletonOf } from "@/common/misc_utils";
import { timed } from "@/common/timing/timed_invocation";

export function jsCorpusApiHandler(): CorpusQueryHandler {
  const engine = singletonOf(() =>
    timed(() => new CorpusQueryEngine(loadCorpus()), "JavaScript corpus init")
  );
  return {
    initialize: () => engine.get(),
    runQuery: (request) =>
      runQuery(
        engine.get(),
        request.query,
        request.pageStart ?? 0,
        request.pageSize ?? 50
      ),
  };
}

export async function runQuery(
  corpus: CorpusQueryEngine,
  query: string,
  pageStart: number,
  pageSize: number
): Promise<CorpusQueryResult> {
  const parsedQuery = parseQuery(query);
  return corpus.queryCorpus(parsedQuery, pageStart, pageSize);
}

export function parseQuery(queryStr: string): CorpusQuery {
  const partRegex = /\[([^\]]+)\]/g;
  const parts: CorpusQueryPart[] = [];
  let match;
  while ((match = partRegex.exec(queryStr)) !== null) {
    const partContent = match[1].trim();
    const compositions: ComposedQuery["composition"][] = ["and"];
    for (const composition of compositions) {
      const splitter = ` ${composition} `;
      if (!partContent.includes(splitter)) {
        parts.push({ token: parseQueryAtom(partContent) });
        continue;
      }
      parts.push({
        token: {
          atoms: partContent.split(splitter).map(parseQueryAtom),
          composition,
        },
      });
    }
  }
  return { parts };
}

function parseQueryAtom(atomStr: string): CorpusQueryAtom {
  const parts = atomStr.split(":");
  const key = parts[0];
  const value = parts.slice(1).join(":");
  if (key === "word") {
    return { word: value };
  }
  if (key === "lemma") {
    return { lemma: value };
  }
  const parsedValue = safeParseInt(value);
  // @ts-expect-error
  return { category: key, value: parsedValue };
}
