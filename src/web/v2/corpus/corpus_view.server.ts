/**
 * SSR for `/v2/corpus`: the full page, and each slot on its own for the
 * partial response. Both come from the same slot renderers, which a parity
 * test pins (`testing/slot_parity.ts`).
 */

import {
  html,
  joinHtml,
  raw,
  type RawHtml,
  type SafeHtml,
} from "@/web/v2/core/html.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import { renderSlotTemplates, slotAttr } from "@/web/v2/core/slots.common";
import { renderCorpusHelp } from "@/web/v2/corpus/corpus_help.server";
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
    return html`<p class="corpus-summary" ${raw(slotAttr("summary"))}></p>`;
  }
  const { estimatedTotal, isExact, pageStart, results, timingMs } = outcome;
  const headline =
    estimatedTotal === 0
      ? html`No results found for`
      : html`Found ${isExact ? "" : "about "}${estimatedTotal} results matching`;
  const range =
    estimatedTotal > 0 && !isExact
      ? html`Showing results ${pageStart + 1} to ${pageStart + results.length}`
      : html``;
  const timing =
    timingMs === undefined
      ? html``
      : html`<span data-volatile>[${timingMs.toFixed(3)} ms]</span>`;
  return html`<p class="corpus-summary" ${raw(slotAttr("summary"))}>
    <span class="corpus-summary-headline"
      >${raw(headline)}
      <span class="corpus-query-echo">${view.params.q}</span></span
    >
    <span class="corpus-summary-detail">${raw(range)} ${raw(timing)}</span>
  </p>`;
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
  const inflection = view.showInflectionDisclaimer
    ? html`<details class="corpus-disclaimer">
        <summary>Your query includes inflection filters</summary>
        <p>
          <i
            >Inflections and lemmas are not hand-tagged and may frequently
            include false positives.</i
          >
        </p>
        <p>
          For example, <code>puellae</code> would always match the
          <code>dative</code>, <code>genitive</code>, and
          <code>plural</code> filters, regardless of whether it was dative
          singular, genitive singular, or nominative plural in a given instance.
        </p>
      </details>`
    : html``;
  return html`${raw(inflection)}
    <details class="corpus-disclaimer">
      <summary>This tool is a work in progress</summary>
      <ul>
        <li>The query engine is still in beta and may have errors.</li>
        <li>
          The database currently contains about 3 million words (roughly ½ of
          the classical corpus). See the <a href="/v2/library">library</a> for a
          full list of indexed works.
        </li>
      </ul>
    </details>`;
}

function renderResultsBody(view: CorpusSearchView): SafeHtml {
  const outcome = view.outcome;
  switch (outcome.kind) {
    case "landing":
      return html`<div class="corpus-message">
        <p class="corpus-welcome">Welcome to the corpus query tool!</p>
        <p class="corpus-welcome-detail">
          This tool allows you to search any text currently available in the
          library. See below for examples of the query syntax, or start typing
          in the search bar.
        </p>
      </div>`;
    case "error":
      return html`<div class="corpus-message corpus-error" role="alert">
        <p>
          Couldn't run
          <span class="corpus-query-echo">${view.params.q}</span>:
          ${outcome.message}
        </p>
      </div>`;
    case "results":
      if (outcome.results.length === 0) {
        return renderDisclaimers(view);
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
          >Next page</a
        >`
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
        id="corpus-q"
        class="input"
        value="${view.params.q}"
        placeholder="${SEARCH_PLACEHOLDER}"
        aria-label="${SEARCH_PLACEHOLDER}"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="search" />
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
    ${raw(renderCorpusHelp(view.outcome.kind === "landing"))}
    <div class="corpus-summary-live" aria-live="polite">
      ${raw(renderCorpusSlot(view, "summary"))}
    </div>
    ${raw(renderCorpusSlot(view, "results"))}
    ${raw(renderCorpusSlot(view, "pager"))}
  </morcus-corpus-view>`;
}

export function renderCorpusPageHtml(view: CorpusSearchView): string {
  return renderPageShell({
    title: corpusPageTitle(view.params.q),
    activePage: "corpus",
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
