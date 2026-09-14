import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { getV2LibrarySummaries } from "@/web/v2/reader/reader_loader.server";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import * as he from "he";

const SEARCH_PATH = ICON_PATHS.search;

export async function renderLibraryPageHtml(): Promise<string> {
  const summaries = (await getV2LibrarySummaries()) || [];

  // Sort works alphabetically by author, then by title
  const sortedWorks = [...summaries].sort((a, b) => {
    const authorCmp = (a.author || "").localeCompare(b.author || "");
    if (authorCmp !== 0) return authorCmp;
    return (a.title || "").localeCompare(b.title || "");
  });

  const cardsHtml = sortedWorks
    .map((w) => {
      const tags: string[] = ["all"];
      const badges: string[] = [];

      if (w.hasMacra) {
        tags.push("macra");
        badges.push('<span class="v2-badge v2-badge-macra">Macronized</span>');
      }
      if (w.hasTranslation) {
        tags.push("translation");
        badges.push('<span class="v2-badge v2-badge-trans">Translated</span>');
      }

      const readerUrl = `/v2/reader/${w.urlAuthor}/${w.urlName}`;

      const metaParts: string[] = [];
      if (w.editor) {
        metaParts.push(
          `<span class="v2-meta-editor">Ed. ${he.escape(w.editor)}</span>`
        );
      }
      if (w.translator) {
        metaParts.push(
          `<span class="v2-meta-trans">Trans. ${he.escape(w.translator)}</span>`
        );
      }
      const metaHtml =
        metaParts.length > 0
          ? `<p class="v2-work-card-meta">${metaParts.join(" &middot; ")}</p>`
          : "";

      const badgesHtml =
        badges.length > 0
          ? `<div class="v2-work-card-badges">${badges.join(" ")}</div>`
          : "";

      return `
        <a href="${readerUrl}"
           class="v2-work-card"
           data-author="${he.escape((w.author || "").toLowerCase())}"
           data-title="${he.escape((w.title || "").toLowerCase())}"
           data-tags="${tags.join(" ")}"
           aria-label="${he.escape(w.title)}${
        w.author ? ` by ${he.escape(w.author)}` : ""
      }">
          <div class="v2-work-card-content">
            <span class="v2-work-card-author">${he.escape(
              w.author || "Unknown"
            )}</span>
            <h2 class="v2-work-card-title">${he.escape(w.title)}</h2>
            ${metaHtml}
            ${badgesHtml}
          </div>
        </a>
      `;
    })
    .join("\n");

  const contentHtml = `
    <morcus-library-view class="v2-library-view">
      <!-- Library Hero Header -->
      <header class="v2-library-header">
        <div class="v2-library-title-group">
          <h1 class="v2-library-title">Welcome to the library!</h1>
        </div>

        <!-- Interactive Search & Feature Filters -->
        <div class="v2-library-search-form v2-search-form">
          <div class="v2-input-wrapper">
            <input type="search"
                   id="v2-library-search-input"
                   class="v2-input v2-library-search-input"
                   placeholder="Filter by author or work (e.g. Caesar, Aeneid, Catullus)..."
                   aria-label="Filter classical works"
                   autocomplete="off"
                   enterkeyhint="search">
            <button type="button" class="v2-search-btn" aria-label="Search" tabindex="-1">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="${SEARCH_PATH}"></path>
              </svg>
            </button>
          </div>

          <div class="v2-search-tray">
            <div class="v2-library-filter-pills" role="group" aria-label="Filter works by edition feature">
              <button type="button" class="v2-filter-pill active" data-filter="all">All</button>
              <button type="button" class="v2-filter-pill" data-filter="macra">Macronized</button>
              <button type="button" class="v2-filter-pill" data-filter="translation">Translated</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Empty Filter State -->
      <div id="v2-library-empty-state" class="v2-library-empty-state" hidden>
        <p class="v2-library-empty-title">No classical works match your filter</p>
        <p class="v2-library-empty-desc">Try clearing your search query or choosing a different feature filter.</p>
        <button type="button" class="v2-btn v2-btn-secondary" id="v2-library-reset-filter-btn">Show All Works</button>
      </div>

      <!-- Continuous Works Grid -->
      <main class="v2-library-main" id="v2-library-main">
        <div class="v2-library-grid" id="v2-library-grid">
          ${cardsHtml}
        </div>
      </main>
    </morcus-library-view>
  `;

  return renderPageShell({
    title: "Classical Library - Morcus Latin Tools",
    activePage: "library",
    contentHtml,
  });
}
