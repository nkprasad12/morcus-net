import type {
  ComposedQuery,
  CorpusQuery,
  CorpusQueryAtom,
  CorpusQueryPart,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import type { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";

export async function runQuery(
  corpus: CorpusQueryEngine,
  query: string
): Promise<CorpusQueryResult[]> {
  const parsedQuery = parseQuery(query);
  return corpus.queryCorpus(parsedQuery);
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
        parts.push(parseQueryAtom(partContent));
        continue;
      }
      parts.push({
        atoms: partContent.split(splitter).map(parseQueryAtom),
        composition,
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
  // This is a simplification. The value might need to be converted to a number
  // if it's a numeric category from an enum like LatinCase.
  // For this driver, we'll treat it as a string.
  // @ts-expect-error
  return { category: key, value: safeParseInt(value) };
}
