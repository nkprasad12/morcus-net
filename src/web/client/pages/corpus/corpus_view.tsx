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

const SEARCH_PLACEHOLDER = "Enter corpus query";

type Results = "N/A" | "Error" | "Loading" | CorpusQueryResult;

function toKey(o: CorpusAutocompleteOption) {
  return o.option;
}

function transformQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    // We use a different syntax for proximity operators for a more
    // fluent autocomplete experience.
    .map((t) =>
      t.replace(/^~(\d+)(.*)$/, (_match, num, rest) => `${num}~${rest}`)
    )
    .map((t) => t.replace(/^#(.+)$/, (_m, name) => `[${name}]`));

  // Wrap consecutive operator-connected spans (e.g. "a and b or c") in parentheses.
  const ops = new Set(["and", "or"]);
  // Build ranges [left, right] for every operator (covers its surrounding operands).
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (ops.has(tokens[i].toLowerCase())) {
      const left = i - 1;
      const right = i + 1;
      if (left >= 0 && right < tokens.length) {
        ranges.push([left, right]);
      }
    }
  }

  if (ranges.length === 0) {
    return tokens.join(" ");
  }

  // Merge overlapping/adjacent ranges into maximal groups.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length === 0) {
      merged.push([r[0], r[1]]);
    } else {
      const last = merged[merged.length - 1];
      if (r[0] <= last[1] + 1) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        merged.push([r[0], r[1]]);
      }
    }
  }

  // Insert parentheses around each merged range.
  const out: string[] = [];
  let mi = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (mi < merged.length && i === merged[mi][0]) {
      out.push("(");
    }
    out.push(tokens[i]);
    if (mi < merged.length && i === merged[mi][1]) {
      out.push(")");
      mi++;
    }
  }

  return out.join(" ");
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
  const { query, currentPage, pageSize, contextLen } = route;

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
    };
  }, [query, currentPageParsed, contextLen, pageSize]);

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
    (input: string) => optionsForInput(input, authors, lemmata),
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
        onOptionSelected={(o, current) =>
          o.replacement ?? `${current}${o.option}`
        }
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
    <details className="corpusDisclaimer text sm">
      <summary>Please note when reviewing results</summary>
      <li>This search tool is still in beta and may have errors.</li>
      <li>
        The database currently contains about 1.2 million words (about 20% of
        the classical corpus).
      </li>
      {hasInflectionFilters && (
        <li>
          <i>
            Your query includes lemma or inflection filters; these operates at
            the word level and may include false positives.
          </i>{" "}
          For example, <code>corpus</code> would always match both the
          nominative and accusative filters, regardless of context.
        </li>
      )}
    </details>
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
      {totalResults > 0 && !hasAllResults && (
        <div className="text sm light">
          Showing results {pageStart + 1} to{" "}
          {pageStart + props.results.matches.length}.
        </div>
      )}
      <Disclaimer query={query} />
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
