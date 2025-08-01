import type { CorpusQueryResult } from "@/common/library/corpus/corpus_common";
import { QueryCorpusApi } from "@/web/api_routes";
import { SearchBoxNoAutocomplete } from "@/web/client/components/generic/search";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { useState } from "react";

const SEARCH_PLACEHOLDER = "Enter corpus query";

interface QueryAndResults {
  query: string;
  results: CorpusQueryResult[] | null;
}

export function CorpusQueryPage() {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<QueryAndResults | null>(null);

  return (
    <div style={{ maxWidth: "400px", margin: "auto" }}>
      <SearchBoxNoAutocomplete
        onInput={setQuery}
        placeholderText={SEARCH_PLACEHOLDER}
        // Left and right are not equal to account for the border.
        style={{ padding: "8px 12px 4px 8px" }}
        ariaLabel={SEARCH_PLACEHOLDER}
        onRawEnter={async () => {
          const result = await callApi(QueryCorpusApi, query);
          setResults({ query, results: result });
        }}
        autoFocused
      />
      {results && (
        <div>
          <h2>Results for: {results.query}</h2>
          <ul>
            {results.results ? (
              results.results.map((item, i) => (
                <li key={i}>{JSON.stringify(item)}</li>
              ))
            ) : (
              <li>No results found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
