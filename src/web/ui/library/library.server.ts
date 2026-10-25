import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { EXTERNAL_READER_PATH } from "@/web/ui/external/external_url.common";
import * as he from "he";
import { ssr } from "@/web/ui/core/server/ssr_template.server";

/** The title a work is shown under everywhere: its short title if curated. */
function displayTitle(w: { title: string; shortTitle?: string }): string {
  return w.shortTitle || w.title || "";
}

export async function renderLibraryPageHtml(): Promise<string> {
  const summaries = (await getV2LibrarySummaries()) || [];

  // Sort works alphabetically by author, then by title
  const sortedWorks = [...summaries].sort((a, b) => {
    const authorCmp = (a.author || "").localeCompare(b.author || "");
    if (authorCmp !== 0) return authorCmp;
    return displayTitle(a).localeCompare(displayTitle(b));
  });

  const cardsHtml = sortedWorks
    .map((w) => {
      const tags: string[] = ["all"];
      const badges: string[] = [];

      if (w.hasMacra) {
        tags.push("macra");
        badges.push('<span class="badge badge-macra">Macronized</span>');
      }
      if (w.hasTranslation) {
        tags.push("translation");
        badges.push('<span class="badge badge-trans">Translated</span>');
      }

      // The hand-curated short title, as the reader shows it; the full
      // title stays available as a tooltip.
      const shownTitle = displayTitle(w);
      const fullTitleAttr =
        w.shortTitle && w.shortTitle !== w.title
          ? ` title="${he.escape(w.title)}"`
          : "";

      const readerUrl = `/work/${w.urlAuthor}/${w.urlName}`;

      // The wrapper is the grid item: the top-right badges (including a saved
      // spot's badge and clear button from library_view.client.ts) sit beside
      // the link, since a button can't go inside one.
      return ssr`
        <div class="work-card-item">
        <a href="${readerUrl}"
           class="card card-interactive work-card"
           data-work-id="${he.escape(w.id)}"
           data-first-page="${he.escape(w.firstPageId.join("."))}"
           data-tags="${tags.join(" ")}"
           aria-label="${he.escape(shownTitle)}${
        w.author ? ` by ${he.escape(w.author)}` : ""
      }">
          <div class="work-card-content">
            <span class="work-card-author">${he.escape(
              w.author || "Unknown"
            )}</span>
            <h2 class="work-card-title"${fullTitleAttr}>${he.escape(
        shownTitle
      )}</h2>
          </div>
        </a>
        <div class="work-card-corner-tag">${badges.join(" ")}</div>
        </div>
      `;
    })
    .join("\n");

  // The "In progress" filter pill counts works with a saved spot
  // (localStorage); it is shown once there are any.
  const contentHtml = ssr`
    <morcus-library-view class="library-view">
      <header class="library-header">
        <div class="library-search-form search-form" data-js-only>
          <div class="input-wrapper">
            <input type="search"
                   id="library-search-input"
                   class="input library-search-input"
                   placeholder="Filter by author or work (e.g. Caesar, Aeneid, Catullus)..."
                   aria-label="Filter classical works"
                   autocomplete="off"
                   enterkeyhint="search">
            <button type="button" class="search-btn" aria-label="Search" tabindex="-1">
              ${renderIconSvg("search")}
            </button>
          </div>

          <div class="search-tray">
            <div class="library-filter-pills" role="group" aria-label="Filter works by edition feature">
              <button type="button" class="filter-pill active" data-filter="all">All</button>
              <button type="button" class="filter-pill" data-filter="macra">Macronized</button>
              <button type="button" class="filter-pill" data-filter="translation">Translated</button>
              <button type="button" class="filter-pill" data-filter="progress" hidden>In progress</button>
            </div>
          </div>
        </div>

        <p class="library-own-text">Welcome to the library! Choose a work below, or <a href="${EXTERNAL_READER_PATH}">read your own text</a>.</p>
      </header>

      <div id="library-empty-state" class="empty-state library-empty-state" hidden>
        <p class="empty-state-title library-empty-title">No classical works match your filter</p>
        <p class="empty-state-desc library-empty-desc">Try clearing your search query or choosing a different feature filter.</p>
        <button type="button" class="btn btn-secondary" id="library-reset-filter-btn">Show All Works</button>
      </div>

      <main class="library-main" id="library-main">
        <div class="library-grid" id="library-grid">
          ${cardsHtml}
        </div>
      </main>
    </morcus-library-view>
  `;

  return renderPageShell({
    title: "Library",
    description:
      "Read Latin literature with instant click-to-lookup across multiple lexica.",
    canonicalPath: "/library",
    activePage: "library",
    widthSurface: "library",
    contentHtml,
  });
}
