import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { EXTERNAL_READER_PATH } from "@/web/ui/external/external_url.common";
import { renderTextsTabBar } from "@/web/ui/shell/texts_tabs.server";
import { TEXTS_TAB_PATHS } from "@/web/ui/shell/texts_tabs.common";
import * as he from "he";
import { ssr } from "@/web/ui/core/server/ssr_template.server";
import type { V2WorkSummary } from "@/common/library/preprocess/preprocessed_types";

/** The title a work is shown under everywhere: its short title if curated. */
function displayTitle(w: { title: string; shortTitle?: string }): string {
  return w.shortTitle || w.title || "";
}

/** `1 work`, `2 works`; `<morcus-library-view>` rewrites it the same way. */
function worksLabel(n: number): string {
  return `${n} ${n === 1 ? "work" : "works"}`;
}

/**
 * One work's row in its author's card. The row is the item the client hides
 * or shows: the top-right badges (including a saved spot's badge and clear
 * button from library_view.client.ts) sit beside the link, since a button
 * can't go inside one.
 */
function renderWorkRowHtml(w: V2WorkSummary): string {
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

  // The author is the card's heading, so the row only names the work; the
  // label still says whose it is.
  return ssr`
    <li class="library-work-row">
      <a href="${readerUrl}"
         class="work-card library-work-link"
         data-work-id="${he.escape(w.id)}"
         data-first-page="${he.escape(w.firstPageId.join("."))}"
         data-tags="${tags.join(" ")}"
         aria-label="${he.escape(shownTitle)}${
    w.author ? ` by ${he.escape(w.author)}` : ""
  }">
        <h3 class="work-card-title"${fullTitleAttr}>${he.escape(
    shownTitle
  )}</h3>
      </a>
      <div class="work-card-corner-tag">${badges.join(" ")}</div>
    </li>
  `;
}

/**
 * One author's card: a native `<details>`, open by default, so the reader can
 * fold away authors without any JS. `<morcus-library-view>` hides the card
 * while none of its works match, and unfolds it when one does.
 */
function renderAuthorGroupHtml(
  author: string,
  works: readonly V2WorkSummary[]
): string {
  return ssr`
    <details class="author-card library-author-group" data-author-group open>
      <summary class="author-card-header library-author-header">
        <h2 class="author-card-name library-author-name">${he.escape(
          author
        )}</h2>
        <span class="author-card-meta">
          <span class="author-card-count library-author-count" data-role="author-count">${worksLabel(
            works.length
          )}</span>
          ${renderIconSvg("strokeChevronDown", {
            className: "author-card-chevron",
            width: 16,
            height: 16,
          })}
        </span>
      </summary>
      <ul class="author-card-list library-work-list">
        ${works.map(renderWorkRowHtml).join("\n")}
      </ul>
    </details>
  `;
}

export async function renderLibraryPageHtml(): Promise<string> {
  const summaries = (await getV2LibrarySummaries()) || [];

  // Sort works alphabetically by author, then by title
  const sortedWorks = [...summaries].sort((a, b) => {
    const authorCmp = (a.author || "").localeCompare(b.author || "");
    if (authorCmp !== 0) return authorCmp;
    return displayTitle(a).localeCompare(displayTitle(b));
  });

  // Group by author, keeping the sort order (a Map iterates in insertion
  // order, and each author's works are already contiguous and by title).
  const byAuthor = new Map<string, V2WorkSummary[]>();
  for (const w of sortedWorks) {
    const author = w.author || "Unknown";
    const works = byAuthor.get(author);
    if (works) works.push(w);
    else byAuthor.set(author, [w]);
  }
  const groupsHtml = Array.from(byAuthor, ([author, works]) =>
    renderAuthorGroupHtml(author, works)
  ).join("\n");

  // The "In progress" filter pill counts works with a saved spot
  // (localStorage); it is shown once there are any.
  const contentHtml = ssr`
    <morcus-library-view class="library-view">
      <header class="library-header">
        ${renderTextsTabBar("library")}
        <p class="library-own-text">Welcome to the library of verified texts!<br>Looking for something else? Try <a href="${
          TEXTS_TAB_PATHS.opentexts
        }">Open Texts</a>, or <a href="${EXTERNAL_READER_PATH}">read your own text</a>.</p>
        <div class="library-search-form search-form" data-js-only>
          <div class="input-wrapper">
            <input type="text"
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
      </header>

      <div id="library-empty-state" class="empty-state library-empty-state" hidden>
        <p class="empty-state-title library-empty-title">No works match your filter</p>
        <p class="empty-state-desc library-empty-desc">Try clearing your search query or choosing a different feature filter.</p>
        <button type="button" class="btn btn-secondary" id="library-reset-filter-btn">Show All Works</button>
      </div>

      <main class="library-main" id="library-main">
        <div class="library-grid" id="library-grid">
          ${groupsHtml}
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
