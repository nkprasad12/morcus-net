/**
 * Server-side renderers for the Experimental Texts catalog (`/experimentalTexts`),
 * the client-side reader's host (`/experimentalTexts?open=<id>`), and the 404 for
 * an unknown work.
 */

import * as he from "he";
import type {
  ExperimentalTextCatalogBundle,
  ExperimentalTextCatalogEntry,
  ExperimentalTextPeriod,
  ExperimentalTextSourceId,
} from "@/common/experimental_texts/catalog_types";
import {
  getExperimentalTextsCatalogBundle,
  groupExperimentalTextEntriesByAuthor,
  type ExperimentalTextAuthorGroup,
} from "@/common/experimental_texts/catalog_loader";
import { ssr } from "@/web/ui/core/server/ssr_template.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import {
  EXPERIMENTAL_TEXTS_CATALOG_ROLES,
  EXPERIMENTAL_TEXTS_PATH,
  buildExperimentalTextsUrl,
  countLabel,
  renderExperimentalTextReaderHostHtml,
  type ExperimentalTextReaderPayload,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { renderTextsTabBar } from "@/web/ui/shell/texts_tabs.server";

interface SourceFilterOption {
  readonly id: ExperimentalTextSourceId | "all";
  readonly label: string;
}

interface PeriodFilterOption {
  readonly id: ExperimentalTextPeriod | "all";
  readonly label: string;
}

const SOURCE_FILTER_OPTIONS: readonly SourceFilterOption[] = [
  { id: "all", label: "All sources" },
  { id: "patrologia_latina", label: "Patrologia Latina" },
  { id: "thelatinlibrary", label: "The Latin Library" },
];

const PERIOD_FILTER_OPTIONS: readonly PeriodFilterOption[] = [
  { id: "all", label: "All periods" },
  { id: "ancient", label: "Ancient" },
  { id: "medieval", label: "Medieval" },
  { id: "neolatin", label: "Neo-Latin" },
];

const PERIOD_LABELS: Readonly<Record<ExperimentalTextPeriod, string>> = {
  ancient: "Ancient",
  medieval: "Medieval",
  neolatin: "Neo-Latin",
};

const SOURCE_LABELS: Readonly<Record<ExperimentalTextSourceId, string>> = {
  patrologia_latina: "Patrologia Latina",
  thelatinlibrary: "The Latin Library",
};

/** Lowercased aliases of `entry`, without its (shown) author name. */
function lowerAliases(entry: ExperimentalTextCatalogEntry): string[] {
  const author = entry.author.toLowerCase();
  return (entry.authorAliases ?? [])
    .map((a) => a.toLowerCase())
    .filter((a) => a !== author);
}

/** Aliases every work of the group shares, which go on the card once. */
function sharedAliases(group: ExperimentalTextAuthorGroup): string[] {
  const [first, ...rest] = group.entries.map(lowerAliases);
  return (first ?? []).filter((a) => rest.every((r) => r.includes(a)));
}

function dataAuthorAttr(aliases: readonly string[]): string {
  return aliases.length > 0
    ? ` data-author="${he.escape(aliases.join(" · "))}"`
    : "";
}

function renderWorkItemHtml(
  entry: ExperimentalTextCatalogEntry,
  groupAliases: readonly string[]
): string {
  const readerHref = buildExperimentalTextsUrl({ open: entry.id });
  const sourceLabel = SOURCE_LABELS[entry.source];

  const periodChipHtml = entry.period
    ? ssr`<span class="experimental-texts-meta-chip">${he.escape(
        PERIOD_LABELS[entry.period]
      )}</span>`
    : "";

  const partialHtml = entry.partialCoverage
    ? ssr`
      <div class="experimental-texts-partial-note">
        <span class="experimental-texts-partial-text">${he.escape(
          entry.partialCoverage.message
        )}</span>
        <a class="experimental-texts-partial-link" href="${he.escape(
          entry.partialCoverage.libraryUrl
        )}">Curated edition in Library &rarr;</a>
      </div>
    `
    : "";

  // `data-source`, `data-period` and `data-volume` are what
  // `<morcus-experimental-texts-view>` filters on, besides the visible author and
  // title; the volume label (`pl 16`) is searchable but not shown, and is
  // omitted when there is none. So are an author's other names
  // (`data-author`: the upstream spelling and Latin / English aliases, so
  // `hieronymus` finds Jerome). Those every work of the author shares sit on
  // the author card once; a row carries only its own extras.
  const ownAliases = lowerAliases(entry).filter(
    (a) => !groupAliases.includes(a)
  );
  const volume = (entry.volumeLabel ?? "").toLowerCase();
  const volumeAttr =
    volume.length > 0 ? ` data-volume="${he.escape(volume)}"` : "";
  const linkHtml = `<a class="experimental-texts-work-link" href="${he.escape(
    readerHref
  )}">${he.escape(entry.title)}</a>`;
  // Only a row with a partial-coverage note needs a column for link + note.
  const mainHtml = entry.partialCoverage
    ? ssr`
      <div class="experimental-texts-work-main">
        ${linkHtml}
        ${partialHtml}
      </div>`
    : linkHtml;
  return ssr`
    <li class="experimental-texts-work-item" data-source="${
      entry.source
    }" data-period="${entry.period}"${volumeAttr}${dataAuthorAttr(
    ownAliases
  )}>
      ${mainHtml}
      <div class="experimental-texts-work-badges">
        ${periodChipHtml}
        <span class="experimental-texts-meta-chip">${he.escape(
          sourceLabel
        )}</span>
      </div>
    </li>
  `;
}

/**
 * One author's card: a native `<details>`, open by default, so the reader can
 * fold away authors they're not interested in without any JS.
 */
function renderAuthorGroupHtml(group: ExperimentalTextAuthorGroup): string {
  const groupAliases = sharedAliases(group);
  const worksHtml = group.entries
    .map((e) => renderWorkItemHtml(e, groupAliases))
    .join("\n");
  return ssr`
    <details class="author-card experimental-texts-author-group" id="author-${he.escape(
      group.slug
    )}"${dataAuthorAttr(groupAliases)} open>
      <summary class="author-card-header experimental-texts-author-header">
        <h2 class="author-card-name experimental-texts-author-name">${he.escape(
          group.author
        )}</h2>
      </summary>
      <ul class="author-card-list experimental-texts-work-list">
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
 * Renders the inner HTML content for the `/experimentalTexts` catalog listing view.
 *
 * The server always renders the full catalog. `<morcus-experimental-texts-view>`
 * filters it in place as the user types or picks a source or period, without
 * a round trip or a URL change (like `<morcus-library-view>` on `/library`).
 * Experimental Texts are fetched and parsed in the browser (see
 * "JS-only exception: Experimental Texts" in `src/web/ui/README.md`), so
 * without JS the page only says so: every work in the list opens in a reader
 * that needs JS, so the controls and the list are `data-js-only`.
 */
export function renderExperimentalTextsCatalogContentHtml(
  bundle: ExperimentalTextCatalogBundle = getExperimentalTextsCatalogBundle()
): string {
  const authorGroups = groupExperimentalTextEntriesByAuthor(bundle.entries);
  const workCount = bundle.entries.length;
  const roles = EXPERIMENTAL_TEXTS_CATALOG_ROLES;
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
  const resetHtml = `<button type="button" class="experimental-texts-reset-link" data-role="${roles.reset}" hidden>Clear filters</button>`;

  return ssr`
    <morcus-experimental-texts-view class="experimental-texts-view">
      <header class="experimental-texts-header">
        ${String(renderTextsTabBar("experimental"))}
        <aside class="experimental-texts-notice" aria-label="Experimental texts notice">
          <p class="experimental-texts-notice-body">
            These texts are experimental, and are more likely to have typos or formatting quirks than works in the <a href="/library">Library</a>.
          </p>
        </aside>
        <p class="experimental-texts-nojs-note" data-nojs-only>Experimental Texts are fetched and parsed in your browser, so browsing and reading them requires JavaScript.</p>
        <div class="experimental-texts-search-form search-form" data-js-only>
          <div class="input-wrapper">
            <input type="search"
                   id="experimental-texts-search-input"
                   class="input experimental-texts-search-input"
                   placeholder="Search by author or work (e.g. Ambrosius, Augustine, Epistulae)..."
                   aria-label="Search Experimental Texts"
                   autocomplete="off"
                   enterkeyhint="search">
            <button type="button" class="search-btn" aria-label="Search" tabindex="-1">
              ${renderIconSvg("search")}
            </button>
          </div>
          <div class="search-tray experimental-texts-filter-tray">
            <div class="experimental-texts-filter-group" role="group" aria-label="Filter by source collection">
              <span class="experimental-texts-filter-label">Source</span>
              ${renderFilterPillsHtml("source", SOURCE_FILTER_OPTIONS)}
            </div>
            <div class="experimental-texts-filter-group" role="group" aria-label="Filter by historical period">
              <span class="experimental-texts-filter-label">Period</span>
              ${renderFilterPillsHtml("period", PERIOD_FILTER_OPTIONS)}
            </div>
          </div>
        </div>
        <div class="experimental-texts-summary-bar" data-js-only>
          <p class="experimental-texts-count" data-role="${roles.count}">
            Showing ${shownWorksHtml} across ${shownAuthorsHtml}${filteredNoteHtml}
          </p>
          ${resetHtml}
        </div>
      </header>
      <div id="experimental-texts-empty-state" class="empty-state experimental-texts-empty-state" hidden>
        <p class="empty-state-title">No Experimental Texts match your filter</p>
        <p class="empty-state-desc">Try clearing your search query or choosing a different source or period filter.</p>
        <button type="button" class="btn btn-secondary" data-role="${
          roles.emptyReset
        }">Show All Experimental Texts</button>
      </div>
      <main class="experimental-texts-main" id="experimental-texts-main" data-js-only>
        <div class="experimental-texts-groups">
          ${authorGroups.map((g) => renderAuthorGroupHtml(g)).join("\n")}
        </div>
      </main>
    </morcus-experimental-texts-view>
  `;
}

/**
 * Renders the full SSR HTML page for `/experimentalTexts` (catalog listing view).
 *
 * Sets `route: "external"` so `renderPageShell` loads
 * `["common.js", "reader.js", "external.js"]`: `external.js` registers
 * `<morcus-experimental-texts-view>`, and the reader a listed work opens needs the
 * same chunks.
 */
export function renderExperimentalTextsCatalogPageHtml(
  bundle: ExperimentalTextCatalogBundle = getExperimentalTextsCatalogBundle()
): string {
  const contentHtml = renderExperimentalTextsCatalogContentHtml(bundle);
  return renderPageShell({
    title: "Experimental Texts",
    description: "Browse experimental Latin texts from various corpora.",
    canonicalPath: EXPERIMENTAL_TEXTS_PATH,
    activePage: "library",
    route: "external",
    widthSurface: "library",
    contentHtml,
  });
}

/**
 * Renders the inner SSR host markup for `/experimentalTexts?open=<id>`.
 */
export function renderExperimentalTextReaderContentHtml(
  payload: ExperimentalTextReaderPayload
): string {
  return String(renderExperimentalTextReaderHostHtml(payload));
}

/**
 * Renders the full SSR HTML page for `/experimentalTexts?open=<id>`.
 *
 * Sets `route: "external"` and `isReader: true` so `renderPageShell` loads
 * `["common.js", "reader.js", "external.js"]` and prefetches `dict.js`.
 */
export function renderExperimentalTextReaderPageHtml(
  payload: ExperimentalTextReaderPayload
): string {
  const { entry, sourceMeta } = payload;
  const contentHtml = renderExperimentalTextReaderContentHtml(payload);
  return renderPageShell({
    title: `${entry.title} (${entry.author})`,
    description: `Read ${entry.title} by ${entry.author} from ${sourceMeta.label} with instant Latin dictionary lookup.`,
    canonicalPath: buildExperimentalTextsUrl({ open: entry.id }),
    activePage: "library",
    route: "external",
    isReader: true,
    widthSurface: "library",
    contentHtml,
  });
}

/**
 * The 404 for `/experimentalTexts?open=<id>` with an id the catalog doesn't have
 * (e.g. a work removed from it), linking back to the catalog.
 */
export function renderExperimentalTextNotFoundPageHtml(openId: string): string {
  // The library's not-found empty state, worded for this catalog.
  const contentHtml = ssr`
    <div class="empty-state empty-state-standalone library-empty-state not-found-state">
      <h2 class="empty-state-title library-empty-title">Text Not Found</h2>
      <p class="empty-state-desc library-empty-desc">Could not find <em>${he.escape(
        openId
      )}</em> among the Experimental Texts. It may have been removed from the catalog.</p>
      <a href="${EXPERIMENTAL_TEXTS_PATH}" class="btn btn-primary">Browse Experimental Texts</a>
    </div>
  `.trim();
  return renderPageShell({
    title: "Text Not Found",
    activePage: "library",
    contentHtml,
  });
}
