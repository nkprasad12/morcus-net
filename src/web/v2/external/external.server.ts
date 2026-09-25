/**
 * Server renderers for the External Content Reader (`/v2/externalReader`).
 *
 * The reading page reuses the library reader's frame, dictionary panel, and
 * typography popover (see `reader.server.ts`) and renders the text into the
 * library's section markup (`external_text.common.ts`). So word lookup, the
 * drawer, gutters, permalinks and preferences all come from the existing
 * `<morcus-reader-view>` with no external-specific client code. The frame
 * omits `data-work`, the TOC and the pager, which keeps saved spots and page
 * turns off.
 */

import * as he from "he";

import { withDefaultScheme } from "@/web/scraping/safe_fetch";
import {
  buildReaderDictIframeSrc,
  readerLayoutStateClass,
  renderReaderDictPanelHtml,
  renderReaderFrameHtml,
  renderReaderSettingsButtonHtml,
  renderReaderTextPanelHtml,
} from "@/web/v2/reader/reader.server";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import {
  DEFAULT_LINE_MODE,
  LINE_MODES,
  parseExternalText,
  renderExternalPassageHtml,
  resolveExternalTitle,
  type ExternalDocument,
  type LineMode,
} from "@/web/v2/external/external_text.common";
import {
  EXTERNAL_READER_PATH,
  buildExternalReaderUrl,
} from "@/web/v2/external/external_url.common";

const PAGE_TITLE_SUFFIX = "Latin Reader - Morcus Latin Tools";

const LINE_MODE_LABELS: Record<LineMode, { name: string; hint: string }> = {
  keep: {
    name: "Keep lines",
    hint: "Show line breaks as they are in the source.",
  },
  prose: {
    name: "Reflow as prose",
    hint: "Join hard-wrapped lines into paragraphs.",
  },
  verse: {
    name: "Number lines as verse",
    hint: "One numbered line per line of the source.",
  },
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export interface ExternalLandingOptions {
  /** Prefills the address field, e.g. after a failed import. */
  url?: string;
  lines?: LineMode;
  /** A user-facing reason the last import failed. */
  error?: string;
}

export function renderExternalLandingContentHtml(
  options: ExternalLandingOptions = {}
): string {
  const lines = options.lines ?? DEFAULT_LINE_MODE;
  const errorHtml = options.error
    ? `<p class="external-error" id="external-url-error" role="alert">${he.escape(
        options.error
      )}</p>`
    : "";
  const describedBy = options.error
    ? ' aria-describedby="external-url-error" aria-invalid="true"'
    : "";
  const modeOptions = LINE_MODES.map((mode) => {
    const label = LINE_MODE_LABELS[mode];
    return `
            <label class="external-mode-option">
              <input type="radio" name="lines" value="${mode}"${
      mode === lines ? " checked" : ""
    }>
              <span class="external-mode-name">${label.name}</span>
              <span class="external-mode-hint">${label.hint}</span>
            </label>`;
  }).join("");

  return `
    <div class="external-landing">
      <header class="external-landing-header">
        <h1 class="external-landing-title">Read your own text</h1>
        <p class="external-landing-lede">Import a Latin text from a web page and read it with the dictionary alongside, just like a work in the library.</p>
      </header>

      <form class="card external-import-form" method="get" action="${EXTERNAL_READER_PATH}">
        <h2 class="external-form-title">From a web page</h2>
        ${errorHtml}
        <label class="external-field-label" for="external-url">Page address</label>
        <input type="text"
               inputmode="url"
               id="external-url"
               class="input external-url-input"
               name="url"
               required
               autocomplete="url"
               autocapitalize="off"
               autocorrect="off"
               spellcheck="false"
               placeholder="thelatinlibrary.com/cicero/cat1.shtml"
               value="${he.escape(options.url ?? "")}"${describedBy}>

        <fieldset class="external-mode-field">
          <legend class="external-field-label">Line breaks</legend>${modeOptions}
        </fieldset>

        <div class="external-form-actions">
          <button type="submit" class="btn btn-primary">Read</button>
          <span class="external-form-note">The page link can be shared.</span>
        </div>
      </form>

      <p class="external-landing-back">
        <a href="/v2/library">&larr; Return to Library Catalog</a>
      </p>
    </div>
  `;
}

export function renderExternalLandingPageHtml(
  options: ExternalLandingOptions = {}
): string {
  return renderPageShell({
    title: `Read your own text - ${PAGE_TITLE_SUFFIX}`,
    activePage: "library",
    contentHtml: renderExternalLandingContentHtml(options),
  });
}

// ---------------------------------------------------------------------------
// Reading page
// ---------------------------------------------------------------------------

export interface ExternalReaderPageOptions {
  /** The page the text was imported from, as the user entered it. */
  sourceUrl: string;
  text: string;
  lines: LineMode;
  query: string;
}

interface ExternalReaderModel {
  doc: ExternalDocument;
  title: string;
  host: string;
  href: string;
  lines: LineMode;
  query: string;
  sourceUrl: string;
}

function buildModel(options: ExternalReaderPageOptions): ExternalReaderModel {
  const href = withDefaultScheme(options.sourceUrl.trim());
  let host = href;
  try {
    host = new URL(href).host;
  } catch {
    // The scrape already validated the URL; keep the raw form if it didn't.
  }
  return {
    doc: parseExternalText(options.text, options.lines),
    title: resolveExternalTitle(undefined, options.text),
    host,
    href,
    lines: options.lines,
    query: options.query,
    sourceUrl: options.sourceUrl,
  };
}

function renderStickyBar(model: ExternalReaderModel): string {
  const title = he.escape(model.title);
  return `      <header class="reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        <div class="sticky-primary-row">
          <a href="${EXTERNAL_READER_PATH}"
             class="reader-btn reader-nav-arrow"
             id="external-new-text"
             aria-label="Read another text"
             title="Read another text">
            <span class="pager-arrow" aria-hidden="true">&larr;</span>
            <span class="pager-label">New text</span>
          </a>

          <div class="reader-sticky-form">
            <div class="sticky-center-group">
              <div class="sticky-title-wrapper" title="${title}">
                <span class="sticky-work-title">${title}</span>
              </div>
            </div>
          </div>

          <div class="sticky-primary-right">
${renderReaderSettingsButtonHtml()}
          </div>
        </div>
      </header>`;
}

function renderLineModeNav(model: ExternalReaderModel): string {
  const links = LINE_MODES.map((mode) => {
    const name = LINE_MODE_LABELS[mode].name;
    if (mode === model.lines) {
      return `<span class="external-mode-link" aria-current="true">${name}</span>`;
    }
    const url = buildExternalReaderUrl({
      url: model.sourceUrl,
      lines: mode,
      q: model.query || undefined,
    });
    return `<a class="external-mode-link" href="${he.escape(
      url
    )}" rel="nofollow">${name}</a>`;
  }).join(`<span class="reader-meta-sep" aria-hidden="true">&middot;</span>`);
  return `<nav class="external-mode-nav" aria-label="Line breaks">
                <span class="external-mode-nav-label">Line breaks:</span>
                ${links}
              </nav>`;
}

function renderTextCard(model: ExternalReaderModel): string {
  const { doc } = model;
  const truncatedHtml = doc.truncated
    ? `<p class="external-notice" role="note">This text is long, so only the first part is shown.</p>`
    : "";
  const passageHtml =
    doc.sections.length > 0
      ? renderExternalPassageHtml(doc)
      : `<p class="external-notice">No text was found on this page.</p>`;

  return `          <div class="reader-text-card">
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">Imported text</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag">${he.escape(model.host)}</span>
              </div>
              <h1 class="reader-passage-heading" aria-live="polite">${he.escape(
                model.title
              )}</h1>
            </header>
            ${truncatedHtml}

            <article class="reader-passage" id="reader-passage">
              ${passageHtml}
            </article>

            <footer class="reader-passage-footer external-passage-footer">
              ${renderLineModeNav(model)}
              <p class="external-source">
                Imported from <a href="${he.escape(
                  model.href
                )}" rel="nofollow noopener noreferrer" target="_blank">${he.escape(
    model.host
  )}</a>. Not part of the Morcus library.
              </p>
              <div class="reader-library-nav">
                <a href="${EXTERNAL_READER_PATH}" class="reader-library-link">&larr; Read another text</a>
              </div>
            </footer>
          </div>`;
}

export function renderExternalReaderContentHtml(
  options: ExternalReaderPageOptions
): string {
  const model = buildModel(options);
  return renderReaderFrameHtml({
    dataAttrs: {
      external: "true",
      "has-macra": String(model.doc.hasMacra),
      "has-translation": "false",
    },
    tocHtml: "",
    layoutStateClass: readerLayoutStateClass(model.query),
    stickyBarHtml: renderStickyBar(model),
    textPanelHtml: renderReaderTextPanelHtml(renderTextCard(model)),
    dictPanelHtml: renderReaderDictPanelHtml({
      query: model.query,
      dictIframeSrc: buildReaderDictIframeSrc(model.query),
      closeHref: buildExternalReaderUrl({
        url: model.sourceUrl,
        lines: model.lines,
      }),
    }),
    hasMacra: model.doc.hasMacra,
  });
}

export function renderExternalReaderPageHtml(
  options: ExternalReaderPageOptions
): string {
  const query = options.query.trim();
  const title = query
    ? `${query} - ${PAGE_TITLE_SUFFIX}`
    : `${resolveExternalTitle(undefined, options.text)} - ${PAGE_TITLE_SUFFIX}`;
  return renderPageShell({
    title,
    activePage: "library",
    isReader: true,
    contentHtml: renderExternalReaderContentHtml({ ...options, query }),
  });
}
