/**
 * SSR for `/corpus`: the full page, and each slot on its own for the
 * partial response. Both come from the same slot renderers, which a parity
 * test pins (`testing/slot_parity.ts`).
 */

import {
  html,
  joinHtml,
  raw,
  type RawHtml,
  type SafeHtml,
} from "@/web/v2/core/dom/html.common";
import { ICON_PATHS } from "@/web/v2/core/widgets/icons.common";
import {
  liveSlot,
  renderSlotTemplates,
  slotAttr,
} from "@/web/v2/core/nav/slots.common";
import {
  renderCorpusHelp,
  renderInlineHelpDisclosure,
} from "@/web/v2/corpus/corpus_help.server";
import {
  CONTEXT_LEN,
  CORPUS_PATH,
  PAGE_SIZE,
  corpusUrl,
} from "@/web/v2/corpus/corpus_params.common";
import {
  type CorpusResultView,
  type CorpusSearchView,
} from "@/web/v2/corpus/corpus_query.server";
import {
  CORPUS_SLOTS,
  corpusPageTitle,
  type CorpusSlot,
} from "@/web/v2/corpus/corpus_slots.common";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";

const SEARCH_PLACEHOLDER = "Enter corpus query";
/** The query input; `<morcus-corpus-suggestions data-input>` points at it. */
const QUERY_INPUT_ID = "corpus-q";

// // // // // // //
// Slots          //
// // // // // // //

function renderSettingsSummary(view: CorpusSearchView): SafeHtml {
  const { contextLen, pageSize, strictMode } = view.params;
  return html`<div
    class="search-tray-left"
    ${raw(slotAttr("settings-summary"))}>
    <span class="tray-label">Context</span>
    <span class="inflect-chip is-off">${contextLen}</span>
    <span class="tray-dot" aria-hidden="true">•</span>
    <span class="tray-label">Page size</span>
    <span class="inflect-chip is-off">${pageSize}</span>
    <span class="tray-dot" aria-hidden="true">•</span>
    <span class="tray-label">Inflections</span>
    <span class="inflect-chip ${strictMode ? "is-on" : "is-off"}"
      >${strictMode ? "Strict" : "Relaxed"}</span
    >
  </div>`;
}

function renderSummary(view: CorpusSearchView): SafeHtml {
  const outcome = view.outcome;
  if (outcome.kind !== "results") {
    return html`<div class="corpus-summary" ${raw(slotAttr("summary"))}></div>`;
  }
  const { estimatedTotal, isExact, pageStart, results, timingMs } = outcome;
  const headline =
    estimatedTotal === 0
      ? html`No results found for`
      : html`Found
        ${isExact ? "" : "about "}${estimatedTotal.toLocaleString("en-US")}
        results matching`;

  const items: SafeHtml[] = [];
  if (estimatedTotal === 0) {
    items.push(html`<span>Showing 0 results</span>`);
  } else {
    items.push(
      html`<span
        >Showing results ${pageStart + 1} to ${pageStart + results.length}</span
      >`
    );
  }
  items.push(
    html`<span class="corpus-scope-text"
      >~3M words / ½ classical corpus indexed (<a href="/library">view works</a
      >)</span
    >`
  );
  if (timingMs !== undefined) {
    items.push(
      html`<span class="corpus-timing" data-volatile
        >[${timingMs.toFixed(3)} ms]</span
      >`
    );
  }
  if (results.length > 0) {
    items.push(renderInlineHelpDisclosure());
  }

  const detailHtml = joinHtml(
    items,
    ' <span class="corpus-summary-dot" aria-hidden="true">•</span> '
  );

  return html`<div class="corpus-summary" ${raw(slotAttr("summary"))}>
    <div class="corpus-summary-headline">
      ${raw(headline)}
      <span class="corpus-query-echo">${view.params.q}</span>
      <span class="corpus-beta-chip">Beta</span>
    </div>
    <div class="corpus-summary-detail">${detailHtml}</div>
  </div>`;
}

function renderSnippet(snippet: CorpusResultView["snippet"]): RawHtml {
  return joinHtml(
    snippet.map(([text, isMatch]) =>
      isMatch ? html`<mark class="corpus-match">${text}</mark>` : html`${text}`
    )
  );
}

function renderResult(result: CorpusResultView): SafeHtml {
  const heading =
    result.href === undefined
      ? html`<span class="corpus-result-heading">${result.heading}</span>`
      : html`<a class="corpus-result-heading" href="${result.href}"
          >${result.heading}</a
        >`;
  return html`<li class="corpus-result">
    ${raw(heading)}
    <p class="corpus-snippet">${renderSnippet(result.snippet)}</p>
  </li>`;
}

function renderDisclaimers(view: CorpusSearchView): SafeHtml {
  if (!view.showInflectionDisclaimer) {
    return html``;
  }
  return html`<details class="corpus-inflection-notice">
    <summary class="corpus-inflection-summary">
      Inflected match may include false positives
    </summary>
    <div class="corpus-inflection-body">
      <p class="corpus-inflection-lead">
        <i
          >Inflections and lemmas are not hand-tagged and may frequently include
          false positives.</i
        >
      </p>
      <p>
        For example, <code>puellae</code> matches <code>dative</code>,
        <code>genitive</code>, and <code>plural</code> filters simultaneously.
      </p>
    </div>
  </details>`;
}

function renderResultsBody(view: CorpusSearchView): SafeHtml {
  const outcome = view.outcome;
  switch (outcome.kind) {
    case "landing":
      return html`<div class="corpus-welcome-card">
          <div class="corpus-welcome-title">
            About the classical corpus search engine
          </div>
          <p class="corpus-welcome-detail">
            This tool allows you to search over 3 million words indexed across
            classical Latin literature. You can search for exact words (e.g.
            <code>amoris</code>), inflected grammatical forms
            (<code>@case:genitive</code>), proximity constraints
            (<code>~3</code>), or author scopes (<code>#Caesar</code>). Explore
            the interactive syntax guide below or tap any sample query to start.
          </p>
        </div>
        ${raw(renderCorpusHelp())}`;
    case "error":
      return html`<div class="corpus-error" role="alert">
        <p>
          Couldn't run
          <span class="corpus-query-echo">${view.params.q}</span>:
          ${outcome.message}
        </p>
      </div>`;
    case "results":
      if (outcome.results.length === 0) {
        return html`${raw(renderDisclaimers(view))} ${raw(renderCorpusHelp())}`;
      }
      return html`${raw(renderDisclaimers(view))}
        <ol class="corpus-result-list" start="${outcome.pageStart + 1}">
          ${joinHtml(outcome.results.map(renderResult))}
        </ol>`;
  }
}

function renderResults(view: CorpusSearchView): SafeHtml {
  return html`<section
    class="corpus-results"
    ${raw(slotAttr("results"))}
    tabindex="-1"
    aria-label="Results">
    ${raw(renderResultsBody(view))}
  </section>`;
}

function renderPager(view: CorpusSearchView): SafeHtml {
  const outcome = view.outcome;
  const next =
    outcome.kind === "results" &&
    outcome.next !== undefined &&
    outcome.results.length > 0
      ? html`<a
          class="btn btn-secondary corpus-next"
          href="${corpusUrl({ ...view.params, cursor: outcome.next })}"
          rel="next"
          data-corpus-nav
          data-focus-key="corpus-next"
          aria-label="Next page"
          title="Next page">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="${ICON_PATHS.arrowForward}"></path>
          </svg>
        </a>`
      : html``;
  return html`<nav
    class="corpus-pager"
    ${raw(slotAttr("pager"))}
    aria-label="Result pages">
    ${raw(next)}
  </nav>`;
}

export function renderCorpusSlot(
  view: CorpusSearchView,
  slot: CorpusSlot
): SafeHtml {
  switch (slot) {
    case "summary":
      return renderSummary(view);
    case "results":
      return renderResults(view);
    case "pager":
      return renderPager(view);
    case "settings-summary":
      return renderSettingsSummary(view);
  }
}

// // // // // // //
// Page           //
// // // // // // //

function renderSettings(view: CorpusSearchView): SafeHtml {
  const { contextLen, pageSize, strictMode } = view.params;
  return html`<details class="settings-details corpus-settings">
    <summary
      class="settings-btn"
      aria-label="Corpus query settings"
      title="Corpus query settings">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="${ICON_PATHS.tune}"></path>
      </svg>
    </summary>
    <div class="settings-popover">
      <div class="settings-section-title">Query settings</div>
      <label class="corpus-setting">
        <span>Context words (${CONTEXT_LEN.min}–${CONTEXT_LEN.max})</span>
        <input
          type="number"
          name="contextLen"
          class="corpus-number"
          min="${CONTEXT_LEN.min}"
          max="${CONTEXT_LEN.max}"
          value="${contextLen}" />
      </label>
      <label class="corpus-setting">
        <span>Page size (${PAGE_SIZE.min}–${PAGE_SIZE.max})</span>
        <input
          type="number"
          name="pageSize"
          class="corpus-number"
          min="${PAGE_SIZE.min}"
          max="${PAGE_SIZE.max}"
          value="${pageSize}" />
      </label>
      <label class="corpus-setting">
        <span>Strict mode</span>
        <input
          type="checkbox"
          name="strictMode"
          value="1"
          ${strictMode ? "checked" : ""} />
      </label>
      <p class="settings-caption">
        For queries filtering lemmata or inflection categories, return only
        results that unambiguously match the query.
      </p>
      <div class="settings-noscript-actions">
        <button type="submit" class="btn btn-secondary settings-apply-btn">
          Apply
        </button>
      </div>
    </div>
  </details>`;
}

/**
 * The autocomplete host (DESIGN §7.2). The listbox is server-rendered and
 * empty; `<morcus-corpus-suggestions>` fills in only its options. The host
 * finds the input through `data-input`, so it doesn't depend on where it
 * sits in the form.
 */
function renderSuggestions(view: CorpusSearchView): SafeHtml {
  // Omitted rather than empty: the element reads absence as "unknown".
  const authors =
    view.authors === undefined
      ? html``
      : html`data-authors="${JSON.stringify(view.authors)}"`;
  return html`<morcus-corpus-suggestions
    data-js-only
    data-input="${QUERY_INPUT_ID}"
    ${raw(authors)}
    ><ul
      id="corpus-suggestions"
      class="suggestions corpus-suggestions"
      role="listbox"
      aria-label="Query suggestions"
      hidden></ul
  ></morcus-corpus-suggestions>`;
}

function renderForm(view: CorpusSearchView): SafeHtml {
  return html`<form
    class="search-form corpus-form"
    role="search"
    action="${CORPUS_PATH}"
    method="GET">
    <div class="input-wrapper">
      <input
        type="text"
        name="q"
        id="${QUERY_INPUT_ID}"
        class="input"
        value="${view.params.q}"
        placeholder="${SEARCH_PLACEHOLDER}"
        aria-label="${SEARCH_PLACEHOLDER}"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="search" />
      ${raw(renderSuggestions(view))}
      <button
        type="submit"
        class="search-btn"
        aria-label="Search"
        title="Search">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="${ICON_PATHS.search}"></path>
        </svg>
      </button>
    </div>
    <div class="search-tray">
      ${raw(renderCorpusSlot(view, "settings-summary"))}
      <div class="search-tray-right">${raw(renderSettings(view))}</div>
    </div>
  </form>`;
}

/** The page content inside the shell (exported for conformance fixtures). */
export function renderCorpusContentHtml(view: CorpusSearchView): SafeHtml {
  return html`<morcus-corpus-view class="corpus-page">
    ${raw(renderForm(view))}
    ${raw(
      liveSlot(renderCorpusSlot(view, "summary"), {
        className: "corpus-summary-live",
      })
    )}
    ${raw(renderCorpusSlot(view, "results"))}
    ${raw(renderCorpusSlot(view, "pager"))}
  </morcus-corpus-view>`;
}

export function renderCorpusPageHtml(view: CorpusSearchView): string {
  const canonicalPath = view.params.q
    ? `${CORPUS_PATH}?${new URLSearchParams({ q: view.params.q }).toString()}`
    : CORPUS_PATH;
  return renderPageShell({
    title: corpusPageTitle(view.params.q),
    canonicalPath,
    activePage: "corpus",
    widthSurface: "corpus",
    contentHtml: renderCorpusContentHtml(view),
  });
}

/** The partial response: every slot, as `<template data-slot>`s. */
export function renderCorpusPartialHtml(view: CorpusSearchView): SafeHtml {
  return renderSlotTemplates(
    CORPUS_SLOTS.map((slot) => [slot, renderCorpusSlot(view, slot)])
  );
}

/** A full page for when the corpus engine can't run at all (503). */
export function renderCorpusUnavailableHtml(query: string): string {
  return renderPageShell({
    title: corpusPageTitle(query),
    activePage: "corpus",
    contentHtml: html`<div class="not-found-state">
      <h1>Corpus unavailable</h1>
      <p>
        The corpus search engine isn't available right now. Please try again
        later.
      </p>
    </div>`,
  });
}
