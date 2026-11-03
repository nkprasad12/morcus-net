import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { renderTextsTabBar } from "@/web/ui/shell/texts_tabs.server";
import * as he from "he";
import { ssr } from "@/web/ui/core/server/ssr_template.server";
import type { V2WorkSummary } from "@/common/library/preprocess/preprocessed_types";

/** The title a work is shown under everywhere: its short title if curated. */
function displayTitle(w: { title: string; shortTitle?: string }): string {
  return w.shortTitle || w.title || "";
}

/**
 * Perseus author strings that are inverted (`"Augustine, Saint"`), Latinized
 * differently from their neighbours, or split one author over two cards
 * (`"L. Annaeus Seneca iunior"` and `"Seneca, Lucius Annaeus"`), mapped to
 * the name their `/library` card is shown under.
 */
const LIBRARY_AUTHOR_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "L. Annaeus Seneca iunior": "Seneca the Younger",
  "Seneca, Lucius Annaeus": "Seneca the Younger",
  "Augustine, Saint": "Augustine",
  "Jerome, Saint": "Jerome",
  "Ausonius, Decimus Magnus": "Decimus Magnus Ausonius",
  "Cato, Marcus Porcius": "Marcus Porcius Cato (Cato the Elder)",
  "Curtius Rufus, Quintus": "Quintus Curtius Rufus",
  "Florus, Lucius Annaeus": "Lucius Annaeus Florus",
};

/**
 * Sort keys for `/library` author cards whose display name begins with a Roman
 * praenomen rather than the familiar name a reader looks under.
 */
const LIBRARY_AUTHOR_SORT_KEYS: Readonly<Record<string, string>> = {
  "Decimus Magnus Ausonius": "Ausonius",
  "Marcus Porcius Cato (Cato the Elder)": "Cato",
  "Quintus Curtius Rufus": "Curtius Rufus",
  "Lucius Annaeus Florus": "Florus",
  "Aulus Gellius": "Gellius",
  "Julius Caesar": "Caesar",
  "C. Valerius Catullus": "Catullus",
  "M. Tullius Cicero": "Cicero, M. Tullius",
  "Q. Tullius Cicero": "Cicero, Q. Tullius",
  "Titus Livius (Livy)": "Livy",
  "Cornelius Nepos": "Nepos",
  "P. Ovidius Naso": "Ovid",
  "T. Maccius Plautus": "Plautus",
  "Sextus Propertius": "Propertius",
  "C. Suetonius Tranquillus": "Suetonius",
  "Cornelius Tacitus": "Tacitus",
  "Publius Terentius Afer (Terence)": "Terence",
  "Pompeius Trogus": "Trogus",
};

/**
 * The name a `/library` author card is shown (and grouped) under: the raw
 * Perseus author, unless it is one of the inconsistent strings above.
 */
export function normalizeLibraryAuthorName(rawAuthor: string): string {
  const trimmed = rawAuthor.trim();
  return LIBRARY_AUTHOR_DISPLAY_NAMES[trimmed] ?? trimmed;
}

/**
 * The key a `/library` author card sorts under, so praenomen-first display
 * names (`"Decimus Magnus Ausonius"`, `"M. Tullius Cicero"`) sort by the
 * familiar name (`"Ausonius"`, `"Cicero"`).
 */
export function authorSortKey(author: string): string {
  const normalized = normalizeLibraryAuthorName(author);
  return LIBRARY_AUTHOR_SORT_KEYS[normalized] ?? normalized;
}

/**
 * One work's row in its author's card. The row is the item the client hides
 * or shows: the badges (including a saved spot's badge and clear button from
 * library_view.client.ts) sit beside the link, on the title's line when there
 * is room, since a button can't go inside one.
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
  // label still says whose it is. When the heading normalizes the Perseus
  // author (`Seneca, Lucius Annaeus` -> `Seneca the Younger`), the original
  // spelling rides along in `data-alt-author` so a search for it still
  // matches.
  const rawAuthor = (w.author || "").trim();
  const author = rawAuthor ? normalizeLibraryAuthorName(rawAuthor) : "";
  const altAuthorAttr =
    rawAuthor && author !== rawAuthor
      ? ` data-alt-author="${he.escape(rawAuthor)}"`
      : "";
  return ssr`
    <li class="library-work-row">
      <a href="${readerUrl}"
         class="work-card library-work-link"
         data-work-id="${he.escape(w.id)}"
         data-first-page="${he.escape(w.firstPageId.join("."))}"
         data-tags="${tags.join(" ")}"${altAuthorAttr}
         aria-label="${he.escape(shownTitle)}${
    author ? ` by ${he.escape(author)}` : ""
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
      </summary>
      <ul class="author-card-list library-work-list">
        ${works.map(renderWorkRowHtml).join("\n")}
      </ul>
    </details>
  `;
}

export async function renderLibraryPageHtml(): Promise<string> {
  const summaries = (await getV2LibrarySummaries()) || [];

  // Sort works alphabetically by author sort key (then display name), then by title
  const authorOf = (w: V2WorkSummary) =>
    w.author ? normalizeLibraryAuthorName(w.author) : "";
  const sortedWorks = [...summaries].sort((a, b) => {
    const sortCmp = authorSortKey(authorOf(a)).localeCompare(
      authorSortKey(authorOf(b))
    );
    if (sortCmp !== 0) return sortCmp;
    const authorCmp = authorOf(a).localeCompare(authorOf(b));
    if (authorCmp !== 0) return authorCmp;
    return displayTitle(a).localeCompare(displayTitle(b));
  });

  // Group by author, keeping the sort order (a Map iterates in insertion
  // order, and each author's works are already contiguous and by title).
  const byAuthor = new Map<string, V2WorkSummary[]>();
  for (const w of sortedWorks) {
    const author = authorOf(w) || "Unknown";
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
        <h1 class="sr-only">Library</h1>
        <p class="library-own-text">Welcome to the library! These texts have been carefully vetted to work well in the reader.</p>
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

      <div class="library-main" id="library-main">
        <div class="library-grid" id="library-grid">
          ${groupsHtml}
        </div>
      </div>
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
