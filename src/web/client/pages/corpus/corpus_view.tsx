import { checkPresent } from "@/common/assert";
import type {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { QueryCorpusApi, type CorpusQueryRequest } from "@/web/api_routes";
import { SpanLink } from "@/web/client/components/generic/basics";
import { SearchBoxNoAutocomplete } from "@/web/client/components/generic/search";
import { getCommitHash } from "@/web/client/define_vars";
import { Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { useMemo, useState } from "react";

const SEARCH_PLACEHOLDER = "Enter corpus query";

type Results = "N/A" | "Error" | "Loading" | CorpusQueryResult;

export function CorpusQueryPage() {
  const [inputText, setInputText] = useState<string>("");
  const [results, setResults] = useState<Results>("N/A");

  const { nav, route } = Router.useRouter();

  const urlQuery = route.params?.q;
  const apiRequest: CorpusQueryRequest | null = useMemo(() => {
    if (!urlQuery) {
      return null;
    }
    return { query: urlQuery, commitHash: getCommitHash() };
  }, [urlQuery]);

  useApiCall(QueryCorpusApi, apiRequest, {
    onResult: setResults,
    onLoading: () => setResults("Loading"),
    onError: () => setResults("Error"),
  });

  const showResults = results !== "N/A" && urlQuery;

  return (
    <div style={{ maxWidth: "600px", margin: "auto", marginTop: "16px" }}>
      <SearchBoxNoAutocomplete
        onInput={setInputText}
        placeholderText={SEARCH_PLACEHOLDER}
        // Left and right are not equal to account for the border.
        style={{ padding: "8px 12px 4px 8px" }}
        ariaLabel={SEARCH_PLACEHOLDER}
        onRawEnter={() => {
          nav.to({
            path: ClientPaths.CORPUS_QUERY_PATH.path,
            params: { q: inputText },
          });
        }}
        autoFocused
      />
      {showResults && <ResultsSection results={results} query={urlQuery} />}
    </div>
  );
}

function ResultsSection(props: {
  results: Exclude<Results, "N/A">;
  query: string;
}) {
  if (props.results === "Error") {
    return <div>Error occurred on query: {props.query}</div>;
  }
  if (props.results === "Loading") {
    return <div>Loading results for: {props.query}</div>;
  }

  return (
    <div>
      <div className="text md">
        Found {props.results.totalResults} results for: {props.query}
      </div>
      <div className="text sm light">
        Showing results {props.results.pageStart + 1} to{" "}
        {props.results.pageStart + props.results.matches.length}.
      </div>
      <ul>
        {props.results.matches.map((item, i) => (
          <li key={i}>
            <SingleResult result={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SingleResult(props: { result: CorpusQueryMatch }) {
  const { nav } = Router.useRouter();
  const id = `${props.result.workId}-${props.result.section}-${props.result.offset}`;

  return (
    <div>
      <SpanLink
        className="dLink"
        id={id}
        onClick={() =>
          nav.to({
            path: checkPresent(
              ClientPaths.WORK_PAGE.toUrlPath({
                workId: props.result.workId,
              })
            ),
            params: { id: props.result.section, ref: "corpus" },
          })
        }>
        {props.result.workId}, {props.result.section}
      </SpanLink>
      <div className="text sm light">{props.result.text}</div>
    </div>
  );
}
