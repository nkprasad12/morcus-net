import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import {
  getV2LibrarySummaries,
  V2WorkSummary,
} from "@/web/v2/reader/reader_loader.server";
import * as he from "he";

export async function renderLibraryPageHtml(): Promise<string> {
  const summaries = (await getV2LibrarySummaries()) || [];

  const macraCount = summaries.filter((w) => w.hasMacra).length;
  const transCount = summaries.filter((w) => w.hasTranslation).length;
  const perseusCount = summaries.filter(
    (w) => w.attribution === "perseus"
  ).length;
  const phiCount = summaries.filter(
    (w) => w.attribution === "publicDomain"
  ).length;

  // Group by author
  const byAuthor = new Map<string, V2WorkSummary[]>();
  for (const s of summaries) {
    const author = s.author || "Unknown";
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author)!.push(s);
  }

  // Sort authors alphabetically
  const sortedAuthors = Array.from(byAuthor.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  const authorSectionsHtml = sortedAuthors
    .map((author) => {
      const works = byAuthor.get(author)!;
      // Sort works by title
      works.sort((a, b) => a.title.localeCompare(b.title));

      const cardsHtml = works
        .map((w) => {
          const tags: string[] = ["all"];
          const badges: string[] = [];

          if (w.hasMacra) {
            tags.push("macra");
            badges.push(
              '<span class="v2-badge v2-badge-macra" title="Macronized vowel lengths and metrical scansion">Macronized</span>'
            );
          }
          if (w.hasTranslation) {
            tags.push("translation");
            badges.push(
              '<span class="v2-badge v2-badge-trans" title="Includes parallel English translation">Translation</span>'
            );
          }
          if (w.attribution === "perseus") {
            tags.push("perseus");
            badges.push(
              '<span class="v2-badge v2-badge-perseus" title="Perseus Digital Library critical edition">Perseus</span>'
            );
          } else if (w.attribution === "publicDomain") {
            tags.push("phi");
            badges.push(
              '<span class="v2-badge v2-badge-phi" title="Packard Humanities Institute Public Domain Latin">Public Domain</span>'
            );
          }

          const readerUrl = `/v2/reader/${w.urlAuthor}/${w.urlName}`;
          const chapterLabel =
            w.pageCount === 1 ? "1 chapter" : `${w.pageCount} chapters`;

          return `
            <article class="v2-work-card"
                     data-author="${he.encode(w.author.toLowerCase())}"
                     data-title="${he.encode(w.title.toLowerCase())}"
                     data-tags="${tags.join(" ")}">
              <div class="v2-work-card-content">
                <div class="v2-work-card-badges">
                  ${badges.join(" ")}
                </div>
                <h3 class="v2-work-card-title">
                  <a href="${readerUrl}">${he.encode(w.title)}</a>
                </h3>
                <p class="v2-work-card-meta">
                  <span class="v2-meta-chapters">${chapterLabel}</span>
                  ${
                    w.editor
                      ? `&middot; <span class="v2-meta-editor">Ed. ${he.encode(
                          w.editor
                        )}</span>`
                      : ""
                  }
                  ${
                    w.translator
                      ? `&middot; <span class="v2-meta-trans">Trans. ${he.encode(
                          w.translator
                        )}</span>`
                      : ""
                  }
                </p>
              </div>
              <div class="v2-work-card-action">
                <a href="${readerUrl}" class="v2-work-card-btn" aria-label="Read ${he.encode(
            w.title
          )} by ${he.encode(w.author)}">
                  <span>Read</span> &rarr;
                </a>
              </div>
            </article>
          `;
        })
        .join("\n");

      return `
        <section class="v2-library-author-section" data-author="${he.encode(
          author.toLowerCase()
        )}">
          <header class="v2-library-author-header">
            <h2 class="v2-library-author-name">${he.encode(author)}</h2>
            <span class="v2-library-author-count">${works.length} ${
        works.length === 1 ? "work" : "works"
      }</span>
          </header>
          <div class="v2-library-grid">
            ${cardsHtml}
          </div>
        </section>
      `;
    })
    .join("\n");

  const contentHtml = `
    <morcus-library-view class="v2-library-view">
      <!-- Library Hero Header -->
      <header class="v2-library-header">
        <div class="v2-library-title-group">
          <h1 class="v2-library-title">Classical Latin Library</h1>
          <p class="v2-library-subtitle">
            Explore <strong>${summaries.length}</strong> classical Latin works with instant lexical lookup,
            macronized metrical editions, and parallel English translations.
          </p>
        </div>

        <!-- Interactive Search & Tag Filters -->
        <div class="v2-library-controls">
          <div class="v2-library-search-box">
            <span class="v2-library-search-glyph" aria-hidden="true">&#x1F50D;</span>
            <input type="search"
                   id="v2-library-search-input"
                   class="v2-library-search-input"
                   placeholder="Filter by author or work (e.g. Caesar, Aeneid, Catullus, Cicero)..."
                   aria-label="Filter classical works"
                   autocomplete="off">
            <span id="v2-library-count-badge" class="v2-library-count-badge">${summaries.length} works</span>
          </div>

          <div class="v2-library-filter-pills" role="group" aria-label="Filter works by edition feature">
            <button type="button" class="v2-filter-pill active" data-filter="all">All (${summaries.length})</button>
            <button type="button" class="v2-filter-pill" data-filter="macra">Macronized (${macraCount})</button>
            <button type="button" class="v2-filter-pill" data-filter="translation">With Translation (${transCount})</button>
            <button type="button" class="v2-filter-pill" data-filter="perseus">Perseus (${perseusCount})</button>
            <button type="button" class="v2-filter-pill" data-filter="phi">Public Domain (${phiCount})</button>
          </div>
        </div>
      </header>

      <!-- Empty Filter State -->
      <div id="v2-library-empty-state" class="v2-library-empty-state" hidden>
        <p class="v2-library-empty-title">No classical works match your filter</p>
        <p class="v2-library-empty-desc">Try clearing your search query or choosing a different feature filter.</p>
        <button type="button" class="v2-btn v2-btn-secondary" id="v2-library-reset-filter-btn">Show All Works</button>
      </div>

      <!-- Grouped Author Sections -->
      <main class="v2-library-main" id="v2-library-main">
        ${authorSectionsHtml}
      </main>
    </morcus-library-view>
  `;

  return renderPageShell({
    title: "Classical Library - Morcus Latin Tools",
    activePage: "library",
    contentHtml,
  });
}
