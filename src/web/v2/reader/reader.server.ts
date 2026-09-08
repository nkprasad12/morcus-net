import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import {
  linkifyText,
  renderDictResultsHtml,
  renderDictSearchBar,
} from "@/web/v2/dict/dict.server";
import * as he from "he";

export interface ReaderPageOptions {
  query?: string;
  results?: DictsFusedResponse;
}

export const SAMPLE_LATIN_PARAGRAPHS = [
  "Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur. Hi omnes lingua, institutis, legibus inter se differunt. Gallos ab Aquitanis Garumna flumen, a Belgis Matrona et Sequana dividit.",
  "Horum omnium fortissimi sunt Belgae, propterea quod a cultu atque humanitate provinciae longissime absunt, minimeque ad eos mercatores saepe commeant atque ea quae ad effeminandos animos pertinent important, proximique sunt Germanis, qui trans Rhenum incolunt, quibuscum continenter bellum gerunt.",
  "Qua de causa Helvetii quoque reliquos Gallos virtute praecedunt, quod fere cotidianis proeliis cum Germanis contendunt, cum aut suis finibus eos prohibent aut ipsi in eorum finibus bellum gerunt. Eorum una pars, quam Gallos obtinere dictum est, initium capit a flumine Rhodano, continetur Garumna flumine, Oceano, finibus Belgarum, attingit etiam ab Sequanis et Helvetiis flumen Rhenum, vergit ad septentriones.",
];

export function renderReaderContentHtml(
  options: ReaderPageOptions = {}
): string {
  const query = options.query?.trim() ?? "";
  const results = options.results;

  const urlBuilder = (cleanWord: string) =>
    `/v2/reader?q=${encodeURIComponent(cleanWord)}#v2-reader-dict`;

  const paragraphsHtml = SAMPLE_LATIN_PARAGRAPHS.map((p) => {
    const linkified = linkifyText(p, urlBuilder, query);
    return `<p class="v2-reader-paragraph">${linkified}</p>`;
  }).join("\n");

  const dictResultsHtml = query
    ? renderDictResultsHtml(query, results)
    : `
      <div class="v2-reader-empty-state">
        <p class="v2-reader-empty-title">Select a word to view definitions</p>
        <p class="v2-reader-empty-desc">
          Click or tap any word in the text on the left to inspect its lexical entries,
          inflections, and translations.
        </p>
      </div>
    `;

  const layoutStateClass = query
    ? "v2-reader-layout-active"
    : "v2-reader-layout-empty";

  return `
    <morcus-reader-view class="v2-reader-view">
      <div class="v2-reader-split-layout ${layoutStateClass}">
        <!-- Left / Top Column: Reading Text Panel -->
        <section class="v2-reader-text-panel" aria-label="Reading Text">
          <div class="v2-reader-text-card">
            <header class="v2-reader-text-card-header">
              <div>
                <h2 class="v2-reader-author">C. Iulius Caesar</h2>
                <h3 class="v2-reader-work">Commentarii de Bello Gallico &mdash; Liber I, Caput I</h3>
              </div>
            </header>

            <article class="v2-reader-passage">
              ${paragraphsHtml}
            </article>

            <footer class="v2-reader-passage-footer">
              <span class="v2-reader-footer-note">Text: C. Julius Caesar, <em>De Bello Gallico</em>. Standard pedagogical sample.</span>
            </footer>
          </div>
        </section>

        <!-- Right / Bottom Column: Dictionary Panel (Adaptive Sheet on Mobile) -->
        <aside class="v2-reader-dict-panel" id="v2-reader-dict" aria-label="Dictionary">
          <!-- Mobile sheet handle & teaser bar (visible on mobile) -->
          <div class="v2-reader-sheet-bar">
            <div class="v2-reader-sheet-handle" aria-hidden="true"></div>
            <div class="v2-reader-sheet-teaser">
              <span class="v2-reader-sheet-label">
                ${
                  query
                    ? `Definitions for <strong>${he.encode(query)}</strong>`
                    : "Tap any word to view definitions"
                }
              </span>
              ${
                query
                  ? `<a href="/v2/reader" class="v2-reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : ""
              }
            </div>
          </div>

          <div class="v2-reader-dict-sticky">
            <header class="v2-reader-dict-header">
              ${renderDictSearchBar({
                query,
                action: "/v2/reader",
                formClass: "v2-reader-search-form",
                inputClass: "v2-reader-input",
                placeholder: "Lookup word...",
              })}
            </header>

            <output id="v2-reader-dict-results" class="v2-reader-dict-output" aria-live="polite">
              ${dictResultsHtml}
            </output>
          </div>
        </aside>
      </div>
    </morcus-reader-view>
  `;
}

export function renderReaderPageHtml(options: ReaderPageOptions = {}): string {
  const query = options.query?.trim() ?? "";
  const title = query
    ? `${query} - Latin Reader - Morcus Latin Tools`
    : "Latin Reader - Morcus Latin Tools";

  return renderPageShell({
    title,
    activePage: "reader",
    contentHtml: renderReaderContentHtml(options),
  });
}
