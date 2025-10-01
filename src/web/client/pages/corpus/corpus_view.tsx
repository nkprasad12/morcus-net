import { checkPresent } from "@/common/assert";
import type {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import { QueryCorpusApi, type CorpusQueryRequest } from "@/web/api_routes";
import { Divider, SpanLink } from "@/web/client/components/generic/basics";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";
import { SearchBox } from "@/web/client/components/generic/search";
import { getCommitHash } from "@/web/client/define_vars";
import {
  CorpusAutocompleteOption,
  optionsForInput,
  CorpusAutocompleteItem,
} from "@/web/client/pages/corpus/corpus_autocomplete";
import { Router } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { Fragment, useMemo, useState } from "react";
import { useCorpusRouter } from "@/web/client/pages/corpus/corpus_router";
import {
  SettingsPreview,
  CorpusSettingsDialog,
} from "@/web/client/pages/corpus/corpus_settings";

const SEARCH_PLACEHOLDER = "Enter corpus query";

type Results = "N/A" | "Error" | "Loading" | CorpusQueryResult;

function toKey(o: CorpusAutocompleteOption) {
  return o.option;
}

export function CorpusQueryPage() {
  const [requestQuery, setRequestQuery] = useState<string>("");
  const [results, setResults] = useState<Results>("N/A");
  const [showSettings, setShowSettings] = useState(false);

  const { nav, route } = useCorpusRouter();
  const { query, startIdx, pageSize, contextLen } = route;

  const apiRequest: CorpusQueryRequest | null = useMemo(() => {
    if (query.length === 0) {
      return null;
    }
    return {
      query,
      pageSize,
      pageStart: startIdx,
      commitHash: getCommitHash(),
      contextLen,
    };
  }, [query, startIdx, contextLen, pageSize]);

  useApiCall(QueryCorpusApi, apiRequest, {
    onResult: setResults,
    onLoading: () => setResults("Loading"),
    onError: () => setResults("Error"),
  });

  const showResults = results !== "N/A" && query.length > 0;

  return (
    <div style={{ maxWidth: "800px", margin: "auto", marginTop: "16px" }}>
      <SearchBox
        onInput={setRequestQuery}
        placeholderText={SEARCH_PLACEHOLDER}
        // Left and right are not equal to account for the border.
        style={{ padding: "8px 12px 4px 8px", margin: "4px 8px" }}
        ariaLabel={SEARCH_PLACEHOLDER}
        onRawEnter={() => nav.to((c) => ({ ...c, query: requestQuery }))}
        onOptionSelected={(o, current) => `${current}${o.option}`}
        RenderOption={CorpusAutocompleteItem}
        optionsForInput={optionsForInput}
        toKey={toKey}
        autoFocused
        showOptionsInitially
        onOpenSettings={() => setShowSettings(true)}
        settingsPreview={
          <SettingsPreview pageSize={pageSize} contextLen={contextLen} />
        }
      />
      <QueryHelpSection />
      <CorpusSettingsDialog open={showSettings} setOpen={setShowSettings} />
      {showResults && <ResultsSection results={results} />}
    </div>
  );
}

function ResultsSection(props: { results: Exclude<Results, "N/A"> }) {
  const { nav, route } = useCorpusRouter();
  const { query, pageSize } = route;

  if (props.results === "Error") {
    return <div>Error occurred on query: {query}</div>;
  }
  if (props.results === "Loading") {
    return <div>Loading results for: {query}</div>;
  }

  const firstPage = props.results.pageStart === 0;
  const lastPage =
    props.results.pageStart + props.results.matches.length >=
    props.results.totalResults;

  const changePage = (increment: boolean) => {
    nav.to((current) => {
      const newStart = increment
        ? current.startIdx + pageSize
        : current.startIdx - pageSize;
      return { ...current, startIdx: newStart };
    });
  };

  return (
    <div style={{ margin: "0px 16px" }}>
      <div className="text md">
        Found {props.results.totalResults} results matching:
        <div className="corpusResult">{query}</div>
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
  const metadata = props.result.metadata;
  const id = `${metadata.workId}-${metadata.section}-${metadata.offset}`;

  return (
    <div>
      <SpanLink
        className="dLink"
        id={id}
        onClick={() =>
          nav.to({
            path: checkPresent(
              ClientPaths.WORK_PAGE.toUrlPath({
                workId: metadata.workId,
              })
            ),
            params: { id: metadata.section, ref: "corpus" },
          })
        }>
        {metadata.workName} {metadata.section} [{metadata.author}]
      </SpanLink>
      <div
        className="text sm light"
        style={{ textAlign: "justify", whiteSpace: "pre-line" }}>
        {props.result.text.map(([content, isMatch], i) =>
          isMatch ? (
            <b key={i} className="corpusResult">
              {content}
            </b>
          ) : (
            <span key={i}>{content}</span>
          )
        )}
      </div>
    </div>
  );
}

function QueryHelpSection() {
  return (
    <details className="queryHelp text sm">
      <summary>How to Write Queries</summary>
      <div className="queryHelpContent">
        <details>
          <summary>Narrowing words</summary>
          <ul>
            <li>
              <code>{`<word>`}</code> - A specific word to match; for example,{" "}
              <code>amoris</code>.
            </li>
            <li>
              <code>@lemma:{`<lemma>`}</code> - The lemma form of a word, which
              will match any inflection of the lemma. For example,{" "}
              <code>@lemma:corpus</code> would match both <code>corpus</code>{" "}
              and <code>corporis</code>.
              <ul>
                <li>
                  For verbs, this is usually the first-person singular present
                  indicative; for example, <code>@lemma:amo</code> (not{" "}
                  <code>amare</code>).
                </li>
                <li>
                  You can also use <code>@l</code> as a shorthand for{" "}
                  <code>@lemma</code>; for example, <code>@l:corpus</code>.
                </li>
              </ul>
            </li>
            <li>
              <code>
                @{"<category>"}:{`<value>`}
              </code>
              : A specific grammatical category to match. For example,{" "}
              <code>@case:genitive</code> would match any word in the genitive
              case.
              <ul>
                <li>
                  You can also use <code>@c:genitive</code> as a shorthand for{" "}
                  <code>@case:genitive</code>.
                </li>
                <li>
                  {" "}
                  The available categories are: <code>@case</code>,{" "}
                  <code>@tense</code>, <code>@voice</code>, <code>@person</code>
                  , <code>@number</code>, <code>@gender</code>,{" "}
                  <code>@degree</code>, and <code>@mood</code>.
                </li>
                <li>
                  You can use the first letter of a category as a shorthand; for
                  example, <code>@c:genitive</code> for{" "}
                  <code>@case:genitive</code>.
                </li>
              </ul>
            </li>
            <li>
              Combine any of the above with the keywords <code>and</code> and{" "}
              <code>or</code>. For example,{" "}
              <code>@lemma:amo and @case:genitive</code> will match any word
              that is both an inflection of <code>amo</code> and in the genitive
              case.
            </li>
          </ul>
        </details>
        <details>
          <summary>Combining words</summary>
          <ul>
            <li>
              <code>(space)</code> - Implies that the previous and next items
              are adjacent. For example, <code>amor @case:genitive</code> would
              match <code>amor</code> followed by any genitive word.
            </li>
            <li>
              <code>~</code> - Implies that the previous and next items are
              within a few words of each other. For example,{" "}
              <code>@lemma:amo ~ @case:genitive</code> would match any
              inflection of <code>amo</code> within a few words of any genitive
              word.
              <ul>
                <li>
                  You can specify the exact proximity by adding a number; for
                  example, <code>@lemma:amo 3~ @case:genitive</code> would match{" "}
                  <code>amo</code> within 3 words of any genitive word. The
                  number must be 15 or lower.
                </li>
              </ul>
            </li>
          </ul>
        </details>
        <details>
          <summary>Examples</summary>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Query</th>
                <th>Description</th>
                <th>Sample</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>amoris</code>
                </td>
                <td>
                  Exact occurrences of <code>amoris</code>.
                </td>
                <td>
                  <code>amoris</code> or <code>Amoris</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>@lemma:do @case:dat</code>
                </td>
                <td>
                  Any inflection of <code>do</code> followed by a dative word.
                </td>
                <td>
                  <code>dedit nato</code> or <code>dant patri</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>(@lemma:do or @lemma:habeo) ~ @case:acc</code>
                </td>
                <td>
                  Any inflection of <code>do</code> or <code>habeo</code> near
                  an accusative word.
                </td>
                <td>
                  <code>dedi saepe panem</code> or{" "}
                  <code>habet in manu ensem</code>
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </details>
  );
}
