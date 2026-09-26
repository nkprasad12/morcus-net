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

function renderLineModeOptions(lines: LineMode): string {
  return LINE_MODES.map((mode) => {
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
  // Paste is the default; reopen on the web tab after a failed import.
  const startOnUrl = options.url !== undefined || options.error !== undefined;

  // One form, two sources. The tabs are radios outside the form, so they
  // never submit; CSS shows the chosen panel. Paste fields have no `name`:
  // the loader reads them and the text never reaches the server. Without JS
  // (or until `<morcus-external-loader>` is defined), CSS hides the tabs and
  // the paste panel, leaving the plain GET form for web pages.
  return `
    <morcus-external-loader class="external-landing" data-page="landing">
      <header class="external-landing-header">
        <h1 class="external-landing-title">Read your own text</h1>
        <p class="external-landing-lede">Paste a Latin text, or import one from a web page, and read it with the dictionary alongside, just like a work in the library.</p>
      </header>

      <p class="external-nojs-note">Pasting your own text needs JavaScript. You can still import from a web page.</p>

      <div class="card external-import-card">
        <div class="external-source-tabs external-js-only" role="radiogroup" aria-label="Text source">
          <label class="external-source-tab">
            <input type="radio" name="external-source" id="external-source-paste" value="paste"${
              startOnUrl ? "" : " checked"
            }>
            Paste Text
          </label>
          <label class="external-source-tab">
            <input type="radio" name="external-source" id="external-source-url" value="url"${
              startOnUrl ? " checked" : ""
            }>
            Import from Web Page
          </label>
        </div>

        <form class="external-import-form" id="external-form" method="get" action="${EXTERNAL_READER_PATH}">
          <div class="external-panel external-for-paste">
            <p class="external-error" id="external-paste-error" role="alert" hidden></p>
            <label class="external-field-label" for="external-title">Title <span class="external-optional">(optional)</span></label>
            <input type="text"
                   id="external-title"
                   class="external-input"
                   maxlength="200"
                   autocomplete="off"
                   placeholder="From the first words of the text">
            <label class="external-field-label" for="external-text">Text</label>
            <textarea id="external-text"
                      class="external-input external-textarea"
                      required
                      rows="10"
                      lang="la"
                      autocapitalize="off"
                      autocorrect="off"
                      spellcheck="false"
                      placeholder="Paste Latin text here"></textarea>
          </div>

          <div class="external-panel external-for-url">
            ${errorHtml}
            <label class="external-field-label" for="external-url">Page address</label>
            <input type="text"
                   inputmode="url"
                   id="external-url"
                   class="external-input"
                   name="url"
                   required
                   autocomplete="url"
                   autocapitalize="off"
                   autocorrect="off"
                   spellcheck="false"
                   placeholder="thelatinlibrary.com/cicero/cat1.shtml"
                   value="${he.escape(options.url ?? "")}"${describedBy}>
          </div>

          <fieldset class="external-mode-field">
            <legend class="external-field-label">Line breaks</legend>${renderLineModeOptions(
              lines
            )}
          </fieldset>

          <div class="external-form-actions">
            <button type="submit" class="btn btn-primary">Read</button>
            <span class="external-form-note external-for-paste">Saved in this browser only. Never sent to Morcus.</span>
            <span class="external-form-note external-for-url">The page link can be shared.</span>
          </div>
        </form>
      </div>

      <section class="external-saved external-js-only" aria-labelledby="external-saved-title">
        <h2 class="external-form-title" id="external-saved-title">Saved on this device</h2>
        <ul class="external-saved-list" id="external-saved-list"></ul>
        <p class="external-form-note" id="external-saved-empty">Texts you read here are saved in this browser.</p>
      </section>

      <p class="external-landing-back">
        <a href="/v2/library">&larr; Return to Library Catalog</a>
      </p>
    </morcus-external-loader>
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
// Reading pages
// ---------------------------------------------------------------------------

/** Where the text comes from; exactly one of the two URL targets. */
type ExternalTarget = { url: string } | { local: string };

/** Everything that differs between a URL import and a saved text. */
interface ExternalFrameModel {
  target: ExternalTarget;
  title: string;
  /** Shown after "Imported text ·"; the reader view reads it for tab titles. */
  workTag: string;
  lines: LineMode;
  query: string;
  hasMacra: boolean;
  /** Inner HTML of `#reader-passage`. */
  passageHtml: string;
  /** Notices shown above the passage. */
  noticesHtml: string;
  /** The footer attribution, or "" when there is no source page. */
  sourceHtml: string;
  /** `data-*` for the `<morcus-external-loader>` on this page. */
  loaderAttrs: Record<string, string>;
}

function readerUrl(
  model: ExternalFrameModel,
  lines: LineMode,
  withQuery: boolean
): string {
  return buildExternalReaderUrl({
    ...model.target,
    lines,
    q: withQuery && model.query ? model.query : undefined,
  });
}

/** Tab title, in the same format the reader view's `refreshTitle` uses. */
function pageTitle(model: ExternalFrameModel): string {
  return model.query
    ? `${model.query} - ${PAGE_TITLE_SUFFIX}`
    : `${model.workTag}: ${model.title} - ${PAGE_TITLE_SUFFIX}`;
}

function renderStickyBar(model: ExternalFrameModel): string {
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

function renderLineModeNav(model: ExternalFrameModel): string {
  const links = LINE_MODES.map((mode) => {
    const name = LINE_MODE_LABELS[mode].name;
    if (mode === model.lines) {
      return `<span class="external-mode-link" aria-current="true">${name}</span>`;
    }
    return `<a class="external-mode-link" href="${he.escape(
      readerUrl(model, mode, true)
    )}" rel="nofollow">${name}</a>`;
  }).join(`<span class="reader-meta-sep" aria-hidden="true">&middot;</span>`);
  return `<nav class="external-mode-nav" aria-label="Line breaks">
                <span class="external-mode-nav-label">Line breaks:</span>
                ${links}
              </nav>`;
}

function renderLoader(attrs: Record<string, string>): string {
  const dataAttrs = Object.entries(attrs)
    .map(([key, value]) => ` data-${key}="${he.escape(value)}"`)
    .join("");
  return `<morcus-external-loader hidden${dataAttrs}></morcus-external-loader>`;
}

function renderTextCard(model: ExternalFrameModel): string {
  return `          <div class="reader-text-card">
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">Imported text</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag">${he.escape(model.workTag)}</span>
              </div>
              <h1 class="reader-passage-heading" aria-live="polite">${he.escape(
                model.title
              )}</h1>
            </header>
            ${model.noticesHtml}

            <article class="reader-passage" id="reader-passage">
              ${model.passageHtml}
            </article>

            <footer class="reader-passage-footer external-passage-footer">
              ${renderLineModeNav(model)}
              ${model.sourceHtml}
              <div class="reader-library-nav">
                <a href="${EXTERNAL_READER_PATH}" class="reader-library-link">&larr; Read another text</a>
              </div>
            </footer>
            ${renderLoader(model.loaderAttrs)}
          </div>`;
}

function renderExternalFrameHtml(model: ExternalFrameModel): string {
  return renderReaderFrameHtml({
    dataAttrs: {
      external: "true",
      "has-macra": String(model.hasMacra),
      "has-translation": "false",
    },
    tocHtml: "",
    layoutStateClass: readerLayoutStateClass(model.query),
    stickyBarHtml: renderStickyBar(model),
    textPanelHtml: renderReaderTextPanelHtml(renderTextCard(model)),
    dictPanelHtml: renderReaderDictPanelHtml({
      query: model.query,
      dictIframeSrc: buildReaderDictIframeSrc(model.query),
      closeHref: readerUrl(model, model.lines, false),
    }),
    hasMacra: model.hasMacra,
  });
}

function renderExternalPage(model: ExternalFrameModel): string {
  return renderPageShell({
    title: pageTitle(model),
    activePage: "library",
    isReader: true,
    contentHtml: renderExternalFrameHtml(model),
  });
}

// ----- `?url=`: imported from a web page, rendered here --------------------

export interface ExternalReaderPageOptions {
  /** The page the text was imported from, as the user entered it. */
  sourceUrl: string;
  text: string;
  lines: LineMode;
  query: string;
}

function buildUrlModel(options: ExternalReaderPageOptions): ExternalFrameModel {
  const href = withDefaultScheme(options.sourceUrl.trim());
  let host = href;
  try {
    host = new URL(href).host;
  } catch {
    // The scrape already validated the URL; keep the raw form if it didn't.
  }
  const doc: ExternalDocument = parseExternalText(options.text, options.lines);
  return {
    target: { url: options.sourceUrl },
    title: resolveExternalTitle(undefined, options.text),
    workTag: host,
    lines: options.lines,
    query: options.query.trim(),
    hasMacra: doc.hasMacra,
    passageHtml:
      doc.sections.length > 0
        ? renderExternalPassageHtml(doc)
        : `<p class="external-notice">No text was found on this page.</p>`,
    noticesHtml: doc.truncated
      ? `<p class="external-notice" role="note">This text is long, so only the first part is shown.</p>`
      : "",
    sourceHtml: `<p class="external-source">
                Imported from <a href="${he.escape(
                  href
                )}" rel="nofollow noopener noreferrer" target="_blank">${he.escape(
      host
    )}</a>. Not part of the Morcus library.
              </p>`,
    // Lets the loader add the import to "Saved on this device".
    loaderAttrs: { page: "url", url: options.sourceUrl, lines: options.lines },
  };
}

export function renderExternalReaderContentHtml(
  options: ExternalReaderPageOptions
): string {
  return renderExternalFrameHtml(buildUrlModel(options));
}

export function renderExternalReaderPageHtml(
  options: ExternalReaderPageOptions
): string {
  return renderExternalPage(buildUrlModel(options));
}

// ----- `?local=`: saved in the visitor's browser, rendered there -----------

/** Placeholder chrome until the loader reads the text from IndexedDB. */
export const LOCAL_TEXT_WORK_TAG = "Saved text";
export const LOCAL_TEXT_PLACEHOLDER_TITLE = "Saved text";

export interface ExternalLocalPageOptions {
  /** The IndexedDB storage key. */
  localKey: string;
  lines: LineMode;
  query: string;
}

function buildLocalModel(
  options: ExternalLocalPageOptions
): ExternalFrameModel {
  return {
    target: { local: options.localKey },
    title: LOCAL_TEXT_PLACEHOLDER_TITLE,
    workTag: LOCAL_TEXT_WORK_TAG,
    lines: options.lines,
    query: options.query.trim(),
    // Unknown until the text loads; the Macra toggle is omitted.
    hasMacra: false,
    passageHtml: `<noscript><p class="external-notice">This text is saved in your browser, so reading it needs JavaScript.</p></noscript>`,
    noticesHtml: "",
    sourceHtml: "",
    loaderAttrs: {
      page: "local",
      "local-key": options.localKey,
      lines: options.lines,
    },
  };
}

export function renderExternalLocalContentHtml(
  options: ExternalLocalPageOptions
): string {
  return renderExternalFrameHtml(buildLocalModel(options));
}

export function renderExternalLocalPageHtml(
  options: ExternalLocalPageOptions
): string {
  return renderExternalPage(buildLocalModel(options));
}
