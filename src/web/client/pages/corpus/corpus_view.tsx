import { checkPresent } from "@/common/assert";
import type {
  CorpusQueryMatch,
  CorpusQueryResult,
} from "@/common/library/corpus/corpus_common";
import {
  QueryCorpusApi,
  type CorpusQueryRequest,
  type GetCorpusSuggestionsRequest,
} from "@/web/api_routes";
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
import { Fragment, useCallback, useMemo, useState } from "react";
import {
  parsePageData,
  serializePageData,
  setNewQuery,
  useCorpusRouter,
} from "@/web/client/pages/corpus/corpus_router";
import { GetCorpusSuggestionsApi } from "@/web/api_routes";
import {
  SettingsPreview,
  CorpusSettingsDialog,
} from "@/web/client/pages/corpus/corpus_settings";
import { useMediaQuery } from "@/web/client/utils/media_query";
import { textHighlightParams } from "@/web/client/pages/library/reader_url";
import { tokenizeInput } from "@/web/client/pages/corpus/autocomplete/input_tokenizer";
import { termGroups } from "@/web/client/pages/corpus/autocomplete/state_transitions";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { usePersistedState } from "@/web/client/utils/hooks/persisted_state";

const SEARCH_PLACEHOLDER = "Enter corpus query";

type Results = "N/A" | "Error" | "Loading" | CorpusQueryResult;

const DISCLAIMER_HEADER = "Your query includes inflection filters";
const DISCLAIMER_CONTENT = (
  <>
    <div>
      <i>
        Inflections and lemmas are not hand-tagged and may frequently include
        false positives.
      </i>
    </div>
    <div style={{ marginTop: "8px" }}>
      For example, <code>puellae</code> would always match the{" "}
      <code>dative</code>, <code>genitive</code>, and <code>plural</code>{" "}
      filters, regardless of whether it was dative singular, genitive singular,
      or nominative plural in a given instance.
    </div>
  </>
);

function toKey(o: CorpusAutocompleteOption) {
  return o.option;
}

export function transformQuery(query: string): string {
  const grouped = termGroups(tokenizeInput(query));
  if (typeof grouped === "string") {
    // There was an error parsing the query; just return it as-is.
    // Ideally we would show an error to the user.
    return query;
  }
  return grouped
    .map((group) => {
      const hasLogicalOp =
        group.length > 0 && group.some((t) => t[2].startsWith("logic:"));
      if (!hasLogicalOp) {
        return group;
      }
      let transformed = group;
      if (group[0][2] !== "(") {
        transformed = [["(", group[0][1], "("], ...group];
      }
      if (group[group.length - 1][2] !== ")") {
        transformed = [...transformed, [")", group[group.length - 1][1], ")"]];
      }
      return transformed;
    })
    .flat()
    .map(([token, ,]) => token) // We use a different syntax for proximity operators
    .map((t) =>
      t.replace(/^~(\d+)(.*)$/, (_match, num, rest) => `${num}~${rest}`)
    )
    .map((t) => t.replace(/^#(.+)$/, (_m, name) => `[${name}]`))
    .join(" ");
}

export type SuggestionsList = string[] | undefined | "error";

function useCorpusSuggestions(
  resource: GetCorpusSuggestionsRequest["resource"]
) {
  const [suggestions, setSuggestions] = useState<SuggestionsList>();

  const getResourceRequest = useMemo(
    () => ({ resource, commitHash: getCommitHash() }),
    [resource]
  );

  const onLoading = useCallback(
    // Keep old suggestions if they exist.
    () => setSuggestions((old) => (Array.isArray(old) ? old : undefined)),
    []
  );
  const onError = useCallback(
    // Keep old suggestions if they exist.
    () => setSuggestions((old) => (Array.isArray(old) ? old : "error")),
    []
  );

  useApiCall(GetCorpusSuggestionsApi, getResourceRequest, {
    onResult: setSuggestions,
    onLoading,
    onError,
  });

  return suggestions;
}

export function CorpusQueryPage() {
  const [requestQuery, setRequestQuery] = useState<string>("");
  const [results, setResults] = useState<Results>("N/A");
  const [showSettings, setShowSettings] = useState(false);

  const isScreenTiny = useMediaQuery("(max-width: 600px)");
  const authors = useCorpusSuggestions("authors");
  const lemmata = useCorpusSuggestions("lemmata");

  const { nav, route } = useCorpusRouter();
  const { query, currentPage, pageSize, contextLen, strictMode } = route;

  const currentPageParsed = useMemo(
    () => parsePageData(currentPage),
    [currentPage]
  );

  const apiRequest: CorpusQueryRequest | null = useMemo(() => {
    if (query.length === 0 || currentPageParsed === null) {
      return null;
    }
    return {
      query: transformQuery(query),
      pageSize,
      pageData: currentPageParsed,
      commitHash: getCommitHash(),
      contextLen,
      strictMode,
    };
  }, [query, currentPageParsed, contextLen, pageSize, strictMode]);

  useApiCall(QueryCorpusApi, apiRequest, {
    onResult: (result) => {
      setResults(result);
      nav.to((c) => ({
        ...c,
        nextPage: serializePageData(result.nextPage),
      }));
    },
    onLoading: () => setResults("Loading"),
    onError: () => setResults("Error"),
  });

  const showResults = results !== "N/A" && query.length > 0;

  const optionsForInputMemo = useCallback(
    (input: string, position?: number) =>
      optionsForInput(input, authors, lemmata, position),
    [authors, lemmata]
  );

  return (
    <div style={{ maxWidth: "900px", margin: "auto", marginTop: "12px" }}>
      <SearchBox
        onInput={setRequestQuery}
        placeholderText={SEARCH_PLACEHOLDER}
        // Left and right are not equal to account for the border.
        style={{ padding: "8px 12px 4px 8px", margin: "4px 8px" }}
        ariaLabel={SEARCH_PLACEHOLDER}
        // Make sure we don't copy over the page tokens for the old query.
        onRawEnter={() => setNewQuery(nav, requestQuery)}
        onOptionSelected={(o, current) => {
          if (o.optionIsPlaceholder) {
            return [current, current.length];
          }
          const newInput = o.replacement ?? `${current}${o.option}`;
          return [newInput, o.cursor ?? newInput.length];
        }}
        RenderOption={CorpusAutocompleteItem}
        optionsForInput={optionsForInputMemo}
        toKey={toKey}
        hasOptionsForEmptyInput
        saveSpace={isScreenTiny}
        onOpenSettings={() => setShowSettings(true)}
        settingsPreview={
          <SettingsPreview
            pageSize={pageSize}
            contextLen={contextLen}
            strictMode={strictMode ? "Strict" : "Relaxed"}
            openSettings={() => setShowSettings(true)}
          />
        }
      />
      {!showResults && (
        <div style={{ margin: "8px 20px" }}>
          <div className="text sm">Welcome to the corpus query tool!</div>
          <div className="text xs light" style={{ marginTop: "4px" }}>
            This tool allows you to search any text currently available in the
            library. Tap below to see some examples of the query syntax, or
            starting typing in the search bar.
          </div>
        </div>
      )}
      <QueryHelpSection />
      <CorpusSettingsDialog open={showSettings} setOpen={setShowSettings} />
      {showResults && <ResultsSection results={results} />}
    </div>
  );
}

function Disclaimer(props: { query: string }) {
  const hasInflectionFilters = /@\w+:/.test(props.query);

  return (
    <>
      {hasInflectionFilters && (
        <details className="corpusDisclaimer text sm">
          <summary>{DISCLAIMER_HEADER}</summary>
          {DISCLAIMER_CONTENT}
        </details>
      )}
      <details className="corpusDisclaimer text sm">
        <summary>This tool is a work in progress</summary>
        <li>The query engine is still in beta and may have errors.</li>
        <li>
          The database currently only contains about 1.2 million words (roughly
          20% of the classical corpus). See the library for a full list of
          indexed works.
        </li>
      </details>
    </>
  );
}

function DisclaimerDialog(props: { query: string }) {
  const [showDialog, setShowDialog] = useState(true);
  const [neverShowChecked, setNeverShowChecked] = useState(false);
  const [neverShowAgain, setNeverShowAgain] = usePersistedState<boolean>(
    false,
    "corpus_disclaimer"
  );

  const hasInflectionFilters = /@\w+:/.test(props.query);
  const open = !neverShowAgain && showDialog && hasInflectionFilters;

  const onClose = () => {
    setShowDialog(false);
    setNeverShowAgain(neverShowChecked);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      contentProps={{ className: "bgColor text sm" }}>
      <div style={{ margin: 0, padding: "16px 24px" }}>
        <b>{DISCLAIMER_HEADER}</b>
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        {DISCLAIMER_CONTENT}
        <label style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
          <input
            type="checkbox"
            checked={neverShowChecked}
            onChange={(e) => setNeverShowChecked(e.currentTarget.checked)}
            style={{ marginRight: 8 }}
          />
          Don{"'"}t show this dialog again
        </label>
        <div
          className="dialogActions text md light"
          style={{ padding: "0px 16px 8px" }}>
          <button type="button" className="button simple" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

function ResultsSection(props: { results: Exclude<Results, "N/A"> }) {
  const { nav, route } = useCorpusRouter();
  const { query } = route;

  const currentPage = useMemo(
    () => parsePageData(route.currentPage),
    [route.currentPage]
  );

  const nextPage = useMemo(
    () => parsePageData(route.nextPage),
    [route.nextPage]
  );

  if (props.results === "Error" || currentPage === null) {
    return (
      <div style={{ margin: "0px 16px" }}>
        <div className="text md">Error occurred on query: {query}</div>
      </div>
    );
  }
  if (props.results === "Loading") {
    return (
      <div style={{ margin: "0px 16px" }}>
        <div className="text md">Loading results for: {query}</div>
      </div>
    );
  }

  const toNextPage = () =>
    nav.to((c) => ({
      ...c,
      lastPage: c.currentPage,
      currentPage: c.nextPage,
      nextPage: undefined,
    }));

  const execTime = props.results.timing
    ?.map(([, time]) => time)
    .reduce((a, b) => a + b, 0);
  const pageStart = currentPage?.resultIndex ?? 0;
  const totalResults = props.results.resultStats.estimatedResults;
  const hasAllResults = totalResults === props.results.matches.length;

  const qualifier = hasAllResults ? "" : "about ";
  const headline =
    totalResults === 0
      ? "No results found for"
      : `Found ${qualifier}${totalResults} results matching`;

  return (
    <div style={{ margin: "0px 16px" }}>
      <div className="text md">
        {headline} <span className="corpusResult">{query}</span>
      </div>
      <div className="text sm light">
        {totalResults > 0 && !hasAllResults && (
          <span>
            Showing results {pageStart + 1} to{" "}
            {pageStart + props.results.matches.length}
          </span>
        )}
        {execTime !== undefined && <span> [{execTime.toFixed(3)} ms]</span>}
      </div>

      <Disclaimer query={query} />
      <DisclaimerDialog query={query} />
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
        <IconButton
          // Back doesn't work yet.
          disabled>
          <SvgIcon pathD={SvgIcon.ArrowBack} />
        </IconButton>
        <IconButton
          disabled={nextPage === null || nextPage === undefined}
          onClick={toNextPage}>
          <SvgIcon pathD={SvgIcon.ArrowForward} />
        </IconButton>
      </div>
    </div>
  );
}

function SingleResult(props: { result: CorpusQueryMatch }) {
  const { nav } = Router.useRouter();
  const metadata = props.result.metadata;
  const idEnd = metadata.leaders.map((l) => `${l[1]}-${l[2]}`).join(";");
  const id = `${metadata.workId}${idEnd}`;

  const section = metadata.leaders[0][0] ?? "";

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
            params: {
              id: section,
              ref: "corpus",
              ...textHighlightParams(
                metadata.leaders.map((l) => ({
                  id: l[0],
                  start: l[1],
                  end: l[1] + l[2],
                }))
              ),
            },
          })
        }>
        {metadata.workName} {section} [{metadata.author}]
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
              <code>amoris</code>. This is not case sensitive.
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
                  All of the usual morphological categories are supported, with
                  the exception of <code>@degree</code>. Please note that
                  special verbal forms are grouped into <code>@mood</code>. The
                  options for each category are:
                  <ul>
                    <li>
                      <code>@mood</code> - <code>indicative</code>,{" "}
                      <code>subjunctive</code>, <code>imperative</code>,{" "}
                      <code>infinitive</code>, <code>participle</code>,{" "}
                      <code>gerundive</code>, <code>supine</code>.
                    </li>
                    <li>
                      <code>@tense</code> - <code>present</code>,{" "}
                      <code>imperfect</code>, <code>future</code>,{" "}
                      <code>perfect</code>, <code>pluperfect</code>,{" "}
                      <code>future-perfect</code>.
                    </li>
                    <li>
                      <code>@voice</code> - <code>active</code>,{" "}
                      <code>passive</code>.
                    </li>
                    <li>
                      <code>@person</code> - <code>1st</code>, <code>2nd</code>,{" "}
                      <code>3rd</code>.
                    </li>
                    <li>
                      <code>@number</code> - <code>singular</code>,{" "}
                      <code>plural</code>.
                    </li>
                    <li>
                      <code>@gender</code> - <code>masculine</code>,{" "}
                      <code>feminine</code>, <code>neuter</code>.
                    </li>
                    <li>
                      <code>@case</code> - <code>nominative</code>,{" "}
                      <code>genitive</code>, <code>dative</code>,{" "}
                      <code>accusative</code>, <code>ablative</code>,{" "}
                      <code>vocative</code> (all usual cases except locative).
                    </li>
                  </ul>
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
                  example, <code>@lemma:amo ~3 @case:genitive</code> would match{" "}
                  <code>amo</code> within 3 words of any genitive word. The
                  number must be 15 or lower.
                </li>
                <li>
                  You can specify a direction by adding <code>{">"}</code>; for
                  example, <code>@lemma:amo ~3{">"} @case:genitive</code> would
                  match <code>amo</code> 3 or fewer words before any genitive
                  word. The number must be 15 or lower.
                </li>
              </ul>
            </li>
          </ul>
        </details>
        <details>
          <summary>Filtering by author</summary>
          <ul>
            <li>
              <code>#author</code> - Restricts the search to the specified
              author. For example, <code>#Caesar amoris</code> will find
              instances of <code>amoris</code> but only in works by Caesar.
              Currently you may only specify one author.
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
              <tr>
                <td>
                  <code>#Caesar @lemma:bellum</code>
                </td>
                <td>
                  Any inflection of <code>bellum</code> in works by Caesar.
                </td>
                <td>
                  <code>bellum</code>, <code>belli</code>, etc.
                </td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </details>
  );
}
