/**
 * Server-side renderers for the Open Texts catalog (`/opentexts`) and the
 * client-side reader host (`/opentexts?open=<id>`).
 *
 * Implements Contract 4 (`docs/library-release/INTERFACES.md` §2.4) and
 * Decisions #14, #15, #16, #17, and #19.
 */

import * as he from "he";
import type {
  OpenTextCatalogBundle,
  OpenTextCatalogEntry,
  OpenTextPeriod,
  OpenTextSourceId,
} from "@/common/open_texts/catalog_types";
import {
  getOpenTextsCatalogBundle,
  groupOpenTextEntriesByAuthor,
  type OpenTextAuthorGroup,
} from "@/common/open_texts/catalog_loader";
import { ssr } from "@/web/ui/core/server/ssr_template.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import {
  OPEN_TEXTS_CATALOG_ROLES,
  OPEN_TEXTS_PATH,
  buildOpenTextsUrl,
  countLabel,
  renderOpenTextReaderHostHtml,
  type OpenTextReaderPayload,
} from "@/web/ui/open_texts/open_texts_contract.common";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { renderTextsTabBar } from "@/web/ui/shell/texts_tabs.server";

interface SourceFilterOption {
  readonly id: OpenTextSourceId | "all";
  readonly label: string;
}

interface PeriodFilterOption {
  readonly id: OpenTextPeriod | "all";
  readonly label: string;
}

const SOURCE_FILTER_OPTIONS: readonly SourceFilterOption[] = [
  { id: "all", label: "All sources" },
  { id: "patrologia_latina", label: "Patrologia Latina" },
  { id: "thelatinlibrary", label: "The Latin Library" },
];

const PERIOD_FILTER_OPTIONS: readonly PeriodFilterOption[] = [
  { id: "all", label: "All periods" },
  { id: "classical", label: "Classical" },
  { id: "late_antique", label: "Late Antique" },
  { id: "patristic", label: "Patristic" },
  { id: "medieval", label: "Medieval" },
  { id: "neolatin", label: "Neo-Latin" },
];

const PERIOD_LABELS: Readonly<Record<OpenTextPeriod, string>> = {
  classical: "Classical",
  late_antique: "Late Antique",
  patristic: "Patristic",
  medieval: "Medieval",
  neolatin: "Neo-Latin",
};

const SOURCE_LABELS: Readonly<Record<OpenTextSourceId, string>> = {
  patrologia_latina: "Patrologia Latina",
  thelatinlibrary: "The Latin Library",
};

function renderWorkItemHtml(entry: OpenTextCatalogEntry): string {
  const readerHref = buildOpenTextsUrl({ open: entry.id });
  const sourceLabel = SOURCE_LABELS[entry.source];
  const sourceBadgeClass =
    entry.source === "patrologia_latina"
      ? "open-texts-source-badge open-texts-source-pl"
      : "open-texts-source-badge open-texts-source-ll";

  const periodChipHtml = entry.period
    ? ssr`<span class="open-texts-meta-chip">${he.escape(
        PERIOD_LABELS[entry.period]
      )}</span>`
    : "";

  const partialHtml = entry.partialCoverage
    ? ssr`
      <div class="open-texts-partial-note">
        <span class="open-texts-partial-text">${he.escape(
          entry.partialCoverage.message
        )}</span>
        <a class="open-texts-partial-link" href="${he.escape(
          entry.partialCoverage.libraryUrl
        )}">Curated edition in Library &rarr;</a>
      </div>
    `
    : "";

  // `data-source`, `data-period` and `data-volume` are what
  // `<morcus-open-texts-view>` filters on, besides the visible author and
  // title; the volume label (`pl 16`) is searchable but not shown.
  return ssr`
    <li class="open-texts-work-item" data-source="${
      entry.source
    }" data-period="${entry.period}" data-volume="${he.escape(
    (entry.volumeLabel ?? "").toLowerCase()
  )}">
      <div class="open-texts-work-main">
        <a class="open-texts-work-link" href="${he.escape(
          readerHref
        )}">${he.escape(entry.title)}</a>
        ${partialHtml}
      </div>
      <div class="open-texts-work-badges">
        ${periodChipHtml}
        <span class="${sourceBadgeClass}">${he.escape(sourceLabel)}</span>
      </div>
    </li>
  `;
}

/**
 * One author's card: a native `<details>`, open by default, so the reader can
 * fold away authors they're not interested in without any JS.
 */
function renderAuthorGroupHtml(group: OpenTextAuthorGroup): string {
  const worksHtml = group.entries.map((e) => renderWorkItemHtml(e)).join("\n");
  return ssr`
    <details class="author-card open-texts-author-group" id="author-${he.escape(
      group.slug
    )}" open>
      <summary class="author-card-header open-texts-author-header">
        <h2 class="author-card-name open-texts-author-name">${he.escape(
          group.author
        )}</h2>
        <span class="author-card-meta">
          <span class="author-card-count open-texts-author-count">${he.escape(
            countLabel(group.entries.length, "work")
          )}</span>
          ${renderIconSvg("strokeChevronDown", {
            className: "author-card-chevron",
            width: 16,
            height: 16,
          })}
        </span>
      </summary>
      <ul class="author-card-list open-texts-work-list">
        ${worksHtml}
      </ul>
    </details>
  `;
}

function renderFilterPillsHtml(
  kind: "source" | "period",
  options: readonly (SourceFilterOption | PeriodFilterOption)[]
): string {
  return options
    .map((option) => {
      const isActive = option.id === "all";
      const pillClass = isActive ? "filter-pill active" : "filter-pill";
      return `<button type="button" class="${pillClass}" data-${kind}-filter="${
        option.id
      }" aria-pressed="${isActive}">${he.escape(option.label)}</button>`;
    })
    .join("\n");
}

/**
 * Renders the inner HTML content for the `/opentexts` catalog listing view.
 *
 * The server always renders the full catalog. `<morcus-open-texts-view>`
 * filters it in place as the user types or picks a source or period, without
 * a round trip or a URL change (like `<morcus-library-view>` on `/library`).
 * Open Texts are fetched and parsed in the browser (the M4 JS-only
 * exception, see `src/web/ui/README.md`), so without JS the page only says
 * so: the controls and the list are `data-js-only`.
 */
export function renderOpenTextsCatalogContentHtml(
  bundle: OpenTextCatalogBundle = getOpenTextsCatalogBundle()
): string {
  const authorGroups = groupOpenTextEntriesByAuthor(bundle.entries);
  const workCount = bundle.entries.length;
  const roles = OPEN_TEXTS_CATALOG_ROLES;
  // The summary's parts the client rewrites (counts) or toggles (the rest).
  const shownWorksHtml = `<strong data-role="${roles.shownWorks}">${countLabel(
    workCount,
    "work"
  )}</strong>`;
  const shownAuthorsHtml = `<strong data-role="${
    roles.shownAuthors
  }">${countLabel(authorGroups.length, "author")}</strong>`;
  const filteredNoteHtml = `<span data-role="${
    roles.filteredNote
  }" hidden> (filtered from ${workCount.toLocaleString("en-US")} total)</span>`;
  const resetHtml = `<button type="button" class="open-texts-reset-link" data-role="${roles.reset}" hidden>Clear filters</button>`;

  return ssr`
    <morcus-open-texts-view class="open-texts-view">
      <header class="open-texts-header">
        ${String(renderTextsTabBar("opentexts"))}
        <aside class="open-texts-notice" aria-label="Uncurated texts notice">
          <p class="open-texts-notice-body">
            <strong>Uncurated.</strong> These texts come from open collections (<a href="https://github.com/nkprasad12/patrologia_latina-dev" target="_blank" rel="noopener noreferrer">Patrologia Latina</a>, <a href="https://www.thelatinlibrary.com/" target="_blank" rel="noopener noreferrer">The Latin Library</a>) and are shown as their source has them. We haven’t checked them, so expect occasional errors.
          </p>
        </aside>
        <p class="open-texts-nojs-note" data-nojs-only>Open Texts are fetched and parsed in your browser, so browsing and reading them requires JavaScript.</p>
        <div class="open-texts-search-form search-form" data-js-only>
          <div class="input-wrapper">
            <input type="search"
                   id="open-texts-search-input"
                   class="input open-texts-search-input"
                   placeholder="Search by author or work (e.g. Ambrosius, Augustine, Epistulae)..."
                   aria-label="Search Open Texts"
                   autocomplete="off"
                   enterkeyhint="search">
            <button type="button" class="search-btn" aria-label="Search" tabindex="-1">
              ${renderIconSvg("search")}
            </button>
          </div>
          <div class="search-tray open-texts-filter-tray">
            <div class="open-texts-filter-group" role="group" aria-label="Filter by source collection">
              <span class="open-texts-filter-label">Source</span>
              ${renderFilterPillsHtml("source", SOURCE_FILTER_OPTIONS)}
            </div>
            <div class="open-texts-filter-group" role="group" aria-label="Filter by historical period">
              <span class="open-texts-filter-label">Period</span>
              ${renderFilterPillsHtml("period", PERIOD_FILTER_OPTIONS)}
            </div>
          </div>
        </div>
        <div class="open-texts-summary-bar" data-js-only>
          <p class="open-texts-count" data-role="${roles.count}">
            Showing ${shownWorksHtml} across ${shownAuthorsHtml}${filteredNoteHtml}
          </p>
          ${resetHtml}
        </div>
      </header>
      <div id="open-texts-empty-state" class="empty-state open-texts-empty-state" hidden>
        <p class="empty-state-title">No Open Texts match your filter</p>
        <p class="empty-state-desc">Try clearing your search query or choosing a different source or period filter.</p>
        <button type="button" class="btn btn-secondary" data-role="${
          roles.emptyReset
        }">Show All Open Texts</button>
      </div>
      <main class="open-texts-main" id="open-texts-main" data-js-only>
        <div class="open-texts-groups">
          ${authorGroups.map((g) => renderAuthorGroupHtml(g)).join("\n")}
        </div>
      </main>
    </morcus-open-texts-view>
  `;
}

/**
 * Renders the full SSR HTML page for `/opentexts` (catalog listing view).
 *
 * Sets `route: "external"` so `renderPageShell` loads
 * `["common.js", "reader.js", "external.js"]`: `external.js` registers
 * `<morcus-open-texts-view>`, and the reader a listed work opens needs the
 * same chunks.
 */
export function renderOpenTextsCatalogPageHtml(
  bundle: OpenTextCatalogBundle = getOpenTextsCatalogBundle()
): string {
  const contentHtml = renderOpenTextsCatalogContentHtml(bundle);
  return renderPageShell({
    title: "Open Texts",
    description: "Browse uncurated Latin texts from various corpora.",
    canonicalPath: OPEN_TEXTS_PATH,
    activePage: "library",
    route: "external",
    widthSurface: "library",
    contentHtml,
  });
}

/**
 * Renders the inner SSR host markup for `/opentexts?open=<id>`.
 */
export function renderOpenTextReaderContentHtml(
  payload: OpenTextReaderPayload
): string {
  return String(renderOpenTextReaderHostHtml(payload));
}

/**
 * Renders the full SSR HTML page for `/opentexts?open=<id>`.
 *
 * Sets `route: "external"` and `isReader: true` so `renderPageShell` loads
 * `["common.js", "reader.js", "external.js"]` and prefetches `dict.js`.
 */
export function renderOpenTextReaderPageHtml(
  payload: OpenTextReaderPayload
): string {
  const { entry, sourceMeta } = payload;
  const contentHtml = renderOpenTextReaderContentHtml(payload);
  return renderPageShell({
    title: `${entry.title} (${entry.author})`,
    description: `Read ${entry.title} by ${entry.author} from ${sourceMeta.label} with instant Latin dictionary lookup.`,
    canonicalPath: buildOpenTextsUrl({ open: entry.id }),
    activePage: "library",
    route: "external",
    isReader: true,
    widthSurface: "library",
    contentHtml,
  });
}
