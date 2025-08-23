import { checkPresent } from "@/common/assert";
import type {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { safeParseInt } from "@/common/misc_utils";
import { QueryCorpusApi, type CorpusQueryRequest } from "@/web/api_routes";
import { Divider, SpanLink } from "@/web/client/components/generic/basics";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";
import { SearchBoxNoAutocomplete } from "@/web/client/components/generic/search";
import { getCommitHash } from "@/web/client/define_vars";
import { Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { Fragment, useMemo, useState } from "react";

const SEARCH_PLACEHOLDER = "Enter corpus query";
const PAGE_SIZE = 50;

type Results = "N/A" | "Error" | "Loading" | CorpusQueryResult;

export function CorpusQueryPage() {
  const [inputText, setInputText] = useState<string>("");
  const [results, setResults] = useState<Results>("N/A");

  const { nav, route } = Router.useRouter();

  const urlQuery = route.params?.q;
  const urlStartIdx = safeParseInt(route.params?.n) ?? 0;
  const apiRequest: CorpusQueryRequest | null = useMemo(() => {
    if (!urlQuery) {
      return null;
    }
    return {
      query: urlQuery,
      pageSize: PAGE_SIZE,
      pageStart: urlStartIdx,
      commitHash: getCommitHash(),
    };
  }, [urlQuery, urlStartIdx]);

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
  const { nav } = Router.useRouter();

  if (props.results === "Error") {
    return <div>Error occurred on query: {props.query}</div>;
  }
  if (props.results === "Loading") {
    return <div>Loading results for: {props.query}</div>;
  }

  const firstPage = props.results.pageStart === 0;
  const lastPage =
    props.results.pageStart + props.results.matches.length >=
    props.results.totalResults;

  const changePage = (increment: boolean) => {
    nav.to((current) => {
      const n = safeParseInt(current.params?.n) ?? 0;
      const newN = increment ? n + PAGE_SIZE : n - PAGE_SIZE;
      const newParams = {
        ...current.params,
        n: newN.toString(),
      };
      return { ...current, params: newParams };
    });
  };

  return (
    <div>
      <div className="text md">
        Found {props.results.totalResults} results matching:
        <div>{props.query}</div>
      </div>
      <div className="text sm light">
        Showing results {props.results.pageStart + 1} to{" "}
        {props.results.pageStart + props.results.matches.length}.
      </div>
      {props.results.matches.length > 0 && (
        <Divider style={{ margin: "12px 0" }} />
      )}
      {props.results.matches.map((item, i) => (
        <Fragment key={i}>
          <SingleResult result={item} />
          <Divider style={{ margin: "12px 0" }} />
        </Fragment>
      ))}
      <div style={{ paddingBottom: "16px", textAlign: "center" }}>
        <IconButton disabled={firstPage} onClick={() => changePage(false)}>
          <SvgIcon pathD={SvgIcon.ArrowBack} />
        </IconButton>
        <IconButton disabled={lastPage} onClick={() => changePage(true)}>
          <SvgIcon pathD={SvgIcon.ArrowForward} />
        </IconButton>
      </div>
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
        {props.result.workName} {props.result.section} [{props.result.author}]
      </SpanLink>
      <div className="text sm light" style={{ textAlign: "justify" }}>
        <span>{props.result.leftContext ?? ""}</span>
        <b className="corpusResult">{props.result.text}</b>
        <span>{props.result.rightContext ?? ""}</span>
      </div>
    </div>
  );
}
