/**
 * Renders a parsed {@link OpenTextDocument} for `<morcus-open-text-reader>`.
 *
 * The Open Texts reader is the M4 JS-only exception (see `src/web/ui/README.md`):
 * the text only exists after the browser fetches and parses it, so the server
 * renders just the host (`renderOpenTextReaderHostHtml`) and this module builds
 * the reading UI on the client. To read exactly like a library work, it builds
 * the same `<morcus-reader-view>` frame the server renders for library and
 * external texts (`reader.server.ts`): a text card whose passage uses the
 * library's section shape (`.reader-section` > `.reader-gutter` +
 * `.reader-passage`), next to the dictionary companion panel. The reader view
 * then tokenizes the words, looks them up in the dictionary panel, and handles
 * the section anchors, unchanged.
 *
 * Only existing reader, shell and core classes are used, so nothing here needs
 * a stylesheet of its own. The `open-text-badge*` classes are hooks that the
 * Open Texts stylesheet may style; unstyled, they read as plain metadata text.
 *
 * The chrome every reader shares comes from the same browser-safe renderers
 * the server uses: the contents button and dialog (`reader_toc.common.ts`),
 * and the `Aa` settings button and dialog and the permalink heading
 * (`reader_chrome.common.ts`). A page's notes sit in the companion panel's
 * Notes tab, in the same `notes` slot as on library pages, so
 * `ReaderPanelController` handles them the same way.
 *
 * All DOM writes go through {@link writeOpenTextHtml}, the module's single
 * audited `setHtml` call site (`inventory_ratchet.json`). Page turns re-render
 * only the passage, through the reader view's `adoptPassage`, and the notes
 * slot ({@link swapOpenTextNotes}), and patch the surrounding chrome with
 * {@link syncOpenTextPageChrome} (text and attributes only), so the dictionary
 * panel and its state survive a page turn.
 */

import type {
  OpenTextCatalogEntry,
  OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import type {
  OpenTextBlock,
  OpenTextDocument,
  OpenTextPage,
  OpenTextRun,
  OpenTextSegment,
} from "@/common/open_texts/open_text_document";
import {
  ICON_CLOSE,
  html,
  joinHtml,
  raw,
  setHtml,
  type SafeHtml,
} from "@/web/ui/core/index.client";
import {
  OPEN_TEXTS_PATH,
  buildOpenTextsUrl,
} from "@/web/ui/open_texts/open_texts_contract.common";
import { SLOT_ATTR } from "@/web/ui/core/nav/slots.common";
import {
  renderReaderHeadingHtml,
  renderReaderSettingsButtonHtml,
  renderReaderSettingsPopoverHtml,
} from "@/web/ui/reader/reader_chrome.common";
import {
  renderPageListTocDrawerHtml,
  renderTocTriggerHtml,
} from "@/web/ui/reader/reader_toc.common";

/** `data-role` values inside the client-rendered frame. */
export const OPEN_TEXT_VIEW_ROLES = {
  prev: "open-text-prev",
  next: "open-text-next",
  prevLabel: "open-text-prev-label",
  nextLabel: "open-text-next-label",
  pageLabel: "open-text-page-label",
  notesLink: "open-text-notes-link",
} as const;

/** The companion panel's Notes view (target of the notes link). */
export const OPEN_TEXT_NOTES_VIEW_ID = "panel-view-notes";

/** The element id of a page's note `index` (0-based): `note-1`, `note-2`... */
export function openTextNoteId(index: number): string {
  return `note-${index + 1}`;
}

/** Shown in About: Open Texts make no promise (Decision #16, M4). */
export const OPEN_TEXT_NO_PROMISE_NOTICE =
  "This text comes from an open collection and is shown as its source has it. " +
  "It hasn't been checked, so expect occasional errors. It is offered on a " +
  "best-effort basis, with no promise of accuracy, completeness or availability.";

// The frame's icons. Client code can't import `renderIconSvg` / `ICON_PATHS`
// (they would ship every icon), so the few paths the frame needs are copied
// from `core/widgets/icons.common.ts`, and drawn the way `renderIconSvg`
// draws them.
const ICONS = {
  close: ICON_CLOSE,
  chevronUp: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01",
  notes:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  drawer:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 14h18 M10 17.5h4",
  strokeChevronLeft: "M15 6l-6 6 6 6",
  strokeChevronRight: "M9 6l6 6-6 6",
} as const;

interface IconOptions {
  className?: string;
  size?: number;
  /** Outline icons: stroked rather than filled. */
  strokeWidth?: number;
}

function icon(name: keyof typeof ICONS, options: IconOptions = {}): SafeHtml {
  const cls = options.className ? ` class="${options.className}"` : "";
  const size = options.size
    ? ` width="${options.size}" height="${options.size}"`
    : "";
  const stroke =
    options.strokeWidth !== undefined
      ? ` fill="none" stroke="currentColor" stroke-width="${options.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
      : "";
  return html`<svg
    viewBox="0 0 24 24"
    ${raw(size)}${raw(cls)}
    aria-hidden="true"
    ${raw(stroke)}>
    <path d="${ICONS[name]}"></path>
  </svg>`;
}

/** Everything the frame shows besides the document itself. */
export interface OpenTextViewModel {
  readonly entry: OpenTextCatalogEntry;
  readonly sourceMeta: OpenTextSourceRepoMeta;
  readonly doc: OpenTextDocument;
  /** The "Back to Open Texts" link target. */
  readonly backHref: string;
}

/** The URL that opens `pageId` of an Open Text. */
export function openTextPageHref(entryId: string, pageId: string): string {
  return buildOpenTextsUrl({ open: entryId, page: pageId });
}

/**
 * The index of the page named by `pageRef` (an `OpenTextPage.id`, or failing
 * that a page label such as `col. 529`), or -1 when nothing matches.
 */
export function findOpenTextPageIndex(
  doc: OpenTextDocument,
  pageRef: string | null | undefined
): number {
  const ref = pageRef?.trim();
  if (!ref) return -1;
  const byId = doc.pages.findIndex((page) => page.id === ref);
  if (byId >= 0) return byId;
  const lower = ref.toLowerCase();
  return doc.pages.findIndex((page) => page.label.toLowerCase() === lower);
}

// ---------------------------------------------------------------------------
// Passage: blocks and segments in the library's section shape
// ---------------------------------------------------------------------------

/** Languages read as Latin; any other `lang` is skipped by word lookup. */
const LATIN_LANGS = new Set(["la", "lat"]);

function renderRun(run: OpenTextRun): SafeHtml {
  const style = run.style;
  const classes: string[] = [];
  if (style?.italic) classes.push("italic");
  if (style?.bold) classes.push("bold");
  if (style?.smallCaps) classes.push("smallcaps");
  if (style?.superscript) classes.push("superscript");
  let inner = html`${run.text}`;
  if (style?.subscript) inner = html`<sub>${raw(inner)}</sub>`;
  const foreign =
    run.lang !== undefined && !LATIN_LANGS.has(run.lang.toLowerCase());
  if (foreign) {
    // Not Latin (e.g. Greek): kept out of dictionary lookup.
    return html`<span
      class="${classes.join(" ")}"
      lang="${run.lang}"
      data-no-tokenize="true"
      >${raw(inner)}</span
    >`;
  }
  if (classes.length > 0) {
    return html`<span class="${classes.join(" ")}">${raw(inner)}</span>`;
  }
  return inner;
}

function renderRuns(runs: readonly OpenTextRun[]): SafeHtml {
  return html`${joinHtml(runs.map(renderRun))}`;
}

/** An inline marker that has no gutter to sit in (inside a note). */
function renderInlineMarker(label: string): SafeHtml {
  return html`<span class="text-muted" data-no-tokenize="true"
    >[${label}]</span
  >`;
}

function renderInlineSegments(segments: readonly OpenTextSegment[]): SafeHtml {
  return html`${joinHtml(
    segments.map((segment) =>
      segment.kind === "section"
        ? renderInlineMarker(segment.label)
        : renderRun(segment)
    )
  )}`;
}

/** A run of segments between two section markers. */
interface SegmentPiece {
  /** The markers that open this piece (none for text before the first). */
  labels: string[];
  runs: OpenTextRun[];
}

/** Splits segments at section markers; adjacent markers share a piece. */
function splitAtMarkers(segments: readonly OpenTextSegment[]): SegmentPiece[] {
  const pieces: SegmentPiece[] = [{ labels: [], runs: [] }];
  for (const segment of segments) {
    let current = pieces[pieces.length - 1];
    if (segment.kind === "section") {
      if (current.runs.some((run) => run.text.trim() !== "")) {
        current = { labels: [], runs: [] };
        pieces.push(current);
      }
      current.labels.push(segment.label);
    } else {
      current.runs.push(segment);
    }
  }
  return pieces.filter(
    (piece) =>
      piece.labels.length > 0 || piece.runs.some((run) => run.text.trim())
  );
}

/** Trims the whitespace a split leaves at either end of a piece. */
function trimRuns(runs: readonly OpenTextRun[]): OpenTextRun[] {
  const out = runs.map((run) => ({ ...run }));
  while (out.length > 0 && out[0].text.trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].text.trim() === "") out.pop();
  if (out.length > 0) {
    out[0].text = out[0].text.trimStart();
    out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  }
  return out;
}

function isRun(segment: OpenTextSegment): segment is OpenTextRun {
  return segment.kind === "text";
}

function markerLabels(segments: readonly OpenTextSegment[]): string[] {
  return segments.flatMap((s) => (s.kind === "section" ? [s.label] : []));
}

/** Allocates `sec-<label>` ids, unique within one page. */
class SectionIds {
  readonly #used = new Set<string>();

  next(label: string): string {
    const slug =
      label
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}._-]/gu, "") || "x";
    let id = `sec-${slug}`;
    for (let n = 2; this.#used.has(id); n++) id = `sec-${slug}-${n}`;
    this.#used.add(id);
    return id;
  }
}

function renderSection(
  ids: SectionIds,
  labels: readonly string[],
  content: SafeHtml,
  verse: boolean
): SafeHtml {
  const sectionClass = verse
    ? "reader-section section-verse"
    : "reader-section";
  if (labels.length === 0) {
    return html`<div class="${sectionClass}">
      <div class="reader-gutter"></div>
      <div class="reader-passage">${raw(content)}</div>
    </div>`;
  }
  const id = ids.next(labels[0]);
  return html`<div class="${sectionClass}" id="${id}">
    <div class="reader-gutter">
      <a href="#${id}" class="section-anchor"
        ><span class="cite-local">${labels.join(" ")}</span></a
      >
    </div>
    <div class="reader-passage">${raw(content)}</div>
  </div>`;
}

function renderBlock(
  ids: SectionIds,
  block: OpenTextBlock,
  isFirst: boolean
): SafeHtml[] {
  switch (block.kind) {
    case "line": {
      // A verse line keeps its markers in the gutter rather than being split.
      const runs = trimRuns(block.segments.filter(isRun));
      const line = html`<span class="reader-line"
        >${raw(renderRuns(runs))}</span
      >`;
      const content =
        block.stanzaStart && !isFirst
          ? html`<span class="line-space" aria-hidden="true"></span>${raw(
                line
              )}`
          : line;
      return [renderSection(ids, markerLabels(block.segments), content, true)];
    }
    case "heading": {
      const runs = trimRuns(block.segments.filter(isRun));
      const heading = html`<h3 class="reader-subheading">
        ${raw(renderRuns(runs))}
      </h3>`;
      return [renderSection(ids, markerLabels(block.segments), heading, false)];
    }
    case "paragraph":
      // Each section marker starts a new row, so its label sits in the
      // gutter beside the text it cites (e.g. Migne's `529A`).
      return splitAtMarkers(block.segments).map((piece) =>
        renderSection(
          ids,
          piece.labels,
          html`<p class="reader-paragraph">
            ${raw(renderRuns(trimRuns(piece.runs)))}
          </p>`,
          false
        )
      );
  }
}

/**
 * The page's notes as the companion panel's Notes view shows them, in the
 * library's endnote shape (`renderNotesSection` in `work_preprocessor.ts`):
 * one `li.reader-note#note-<n>` each, which `ReaderPanelController` counts,
 * shows the Notes tab for, and reveals for a `#note-<n>` link. Open Text
 * notes have no in-text markers, so the label is plain text rather than a
 * back-link. "" for a page without notes, as on library pages.
 */
export function renderOpenTextNotesHtml(page: OpenTextPage): SafeHtml {
  if (page.notes.length === 0) return html``;
  const items = page.notes.map(
    (note, i) =>
      html`<li class="reader-note" id="${openTextNoteId(i)}">
        <span class="text-muted">[${i + 1}]</span>
        <div class="reader-note-body">
          ${raw(renderInlineSegments(note.segments))}
        </div>
      </li>`
  );
  return html`<aside
    class="reader-notes"
    role="doc-endnotes"
    aria-labelledby="reader-notes-heading">
    <h2 class="reader-notes-heading" id="reader-notes-heading">Notes</h2>
    <ol class="reader-notes-list">
      ${joinHtml(items)}
    </ol>
  </aside>`;
}

/** The `notes` page-turn slot inside `#panel-view-notes`. */
function renderNotesSlot(page: OpenTextPage): SafeHtml {
  return html`<div class="reader-notes-slot" ${raw(SLOT_ATTR)}="notes">
    ${raw(renderOpenTextNotesHtml(page))}
  </div>`;
}

/**
 * The inner HTML of `#reader-passage` for one page: a section row per block
 * (per marker within a paragraph). The page's notes are in the companion
 * panel ({@link renderOpenTextNotesHtml}).
 */
export function renderOpenTextPassageHtml(page: OpenTextPage): SafeHtml {
  const ids = new SectionIds();
  const rows = page.blocks.flatMap((block, i) =>
    renderBlock(ids, block, i === 0)
  );
  if (rows.length === 0) {
    rows.push(
      html`<div class="reader-section">
        <div class="reader-gutter"></div>
        <div class="reader-passage">
          <p class="reader-paragraph text-muted">This page has no text.</p>
        </div>
      </div>`
    );
  }
  return html`${joinHtml(rows, "\n")}`;
}

// ---------------------------------------------------------------------------
// Frame: sticky bar, text card, and the dictionary companion panel
// ---------------------------------------------------------------------------

interface PageNav {
  page: OpenTextPage;
  prev: OpenTextPage | undefined;
  next: OpenTextPage | undefined;
}

function pageNav(doc: OpenTextDocument, index: number): PageNav {
  return {
    page: doc.pages[index],
    prev: index > 0 ? doc.pages[index - 1] : undefined,
    next: index < doc.pages.length - 1 ? doc.pages[index + 1] : undefined,
  };
}

function notesLinkText(count: number): string {
  return count === 1 ? "1 note" : `${count} notes`;
}

function sourceBadgeText(model: OpenTextViewModel): string {
  const volume = model.entry.volumeLabel;
  return volume
    ? `${model.sourceMeta.label} · ${volume}`
    : model.sourceMeta.label;
}

/**
 * A sticky-bar pager arrow. Glyph only: page labels (`cols. 529–530`) are too
 * long for the bar, so they show in the bar's centre and on the footer cards.
 */
function renderStickyArrow(
  model: OpenTextViewModel,
  dir: "prev" | "next",
  current: OpenTextPage,
  target: OpenTextPage | undefined
): SafeHtml {
  const isPrev = dir === "prev";
  const role = isPrev ? OPEN_TEXT_VIEW_ROLES.prev : OPEN_TEXT_VIEW_ROLES.next;
  const href = openTextPageHref(model.entry.id, (target ?? current).id);
  const cls = target
    ? "reader-btn reader-nav-arrow"
    : "reader-btn reader-nav-arrow disabled";
  const disabled = target ? "" : ' aria-disabled="true" tabindex="-1"';
  const chevron = raw(
    icon(isPrev ? "strokeChevronLeft" : "strokeChevronRight", {
      className: "pager-chevron",
      size: 16,
      strokeWidth: 2.5,
    })
  );
  const aria = isPrev ? "Previous page" : "Next page";
  return html`<a
    href="${href}"
    class="${cls}"
    data-role="${role}"
    ${raw(disabled)}
    aria-label="${aria}"
    title="${aria}"
    ><span class="pager-arrow" aria-hidden="true">${isPrev ? "←" : "→"}</span
    >${chevron}</a
  >`;
}

/**
 * The bar's centre: for a work of several pages, the library reader's
 * contents button (`#reader-toc-btn`, opening {@link renderTocDrawer}); for a
 * single page, which has nothing to switch to, just the title and page.
 */
function renderStickyCenter(model: OpenTextViewModel, nav: PageNav): SafeHtml {
  const title = model.doc.title || model.entry.title;
  const pageLabel = html`<span
    class="jump-val"
    data-role="${OPEN_TEXT_VIEW_ROLES.pageLabel}"
    >${nav.page.label}</span
  >`;
  if (model.doc.pages.length > 1) {
    return renderTocTriggerHtml({
      title,
      shortTitle: model.entry.title,
      pageLabelHtml: pageLabel,
      // Page labels name their own unit (`col. 529`, `Part 2`).
      sectionGlyph: false,
    });
  }
  return html`<div class="sticky-title-wrapper" title="${title}">
    <span class="sticky-work-title">${model.entry.title}</span
    ><span class="sticky-section-sep" aria-hidden="true">·</span>${raw(
      pageLabel
    )}
  </div>`;
}

function renderStickyBar(model: OpenTextViewModel, nav: PageNav): SafeHtml {
  return html`<header
    class="reader-sticky-bar"
    role="toolbar"
    aria-label="Reader Quick Navigation">
    <div class="sticky-primary-row">
      ${raw(renderStickyArrow(model, "prev", nav.page, nav.prev))}
      <div class="reader-sticky-form">
        <div class="sticky-center-group">
          ${raw(renderStickyCenter(model, nav))}
        </div>
      </div>
      <div class="sticky-primary-right">
        ${raw(renderStickyArrow(model, "next", nav.page, nav.next))}
        <span class="running-right-sep" aria-hidden="true">&middot;</span>
        ${raw(renderReaderSettingsButtonHtml())}
      </div>
    </div>
  </header>`;
}

/**
 * The library reader's contents dialog (`#reader-toc-drawer`), listing every
 * page, for a work of several pages; "" for a single page. Its items are
 * page links (`data-page-id`) that `<morcus-open-text-reader>` turns in place.
 */
function renderTocDrawer(model: OpenTextViewModel, index: number): SafeHtml {
  const { entry, doc } = model;
  if (doc.pages.length <= 1) return html``;
  return renderPageListTocDrawerHtml({
    pages: doc.pages.map((page) => ({
      id: page.id,
      label: page.label,
      href: openTextPageHref(entry.id, page.id),
    })),
    activeIndex: index,
    // A GET form's action drops its own query, so the entry is a field.
    formAction: OPEN_TEXTS_PATH,
    hiddenFields: [["open", entry.id]],
    footer: { href: model.backHref, label: "Back to Open Texts" },
  });
}

function renderPartialNotice(model: OpenTextViewModel): SafeHtml {
  const partial = model.entry.partialCoverage;
  if (!partial) return html``;
  const target = partial.libraryTitle
    ? `Read ${partial.libraryTitle} in the Library`
    : "Read it in the Library";
  return html`<p class="external-notice" role="note">
    ${partial.message} <a href="${partial.libraryUrl}">${target}</a>
  </p>`;
}

function renderTextCard(model: OpenTextViewModel, nav: PageNav): SafeHtml {
  const { entry, doc } = model;
  const author = doc.author || entry.author;
  const title = entry.title || doc.title;
  const notes = nav.page.notes.length;
  const multiPage = doc.pages.length > 1;
  const notesHidden = notes > 0 ? "" : " hidden";
  return html`<div class="reader-text-card">
    <header class="reader-text-card-header">
      <div class="reader-text-meta">
        <span class="reader-author-tag">${author}</span
        ><span class="reader-meta-sep">·</span
        ><span class="reader-work-tag" title="${title}">${title}</span>
      </div>
      ${raw(
        renderReaderHeadingHtml(
          nav.page.label,
          openTextPageHref(entry.id, nav.page.id)
        )
      )}
      <div class="reader-text-meta">
        <span
          class="open-text-badge open-text-badge-uncurated"
          title="Shown as the source has it; not checked"
          >Uncurated</span
        ><span class="reader-meta-sep">·</span
        ><span class="open-text-badge open-text-badge-source"
          >${sourceBadgeText(model)}</span
        >
      </div>
      <p class="reader-header-attribution">
        <a href="#panel-view-about" class="reader-attribution-link"
          >About this text<span aria-hidden="true"> ⓘ</span></a
        ><span class="reader-meta-sep" aria-hidden="true"> · </span
        ><a href="${entry.sourceUrl}" target="_blank" rel="noopener noreferrer"
          >View source</a
        ><span
          class="reader-meta-sep"
          aria-hidden="true"
          data-role="${OPEN_TEXT_VIEW_ROLES.notesLink}"
          ${raw(notesHidden)}>
          · </span
        ><a
          href="#${OPEN_TEXT_NOTES_VIEW_ID}"
          data-role="${OPEN_TEXT_VIEW_ROLES.notesLink}"
          ${raw(notesHidden)}
          >${notesLinkText(notes)}</a
        >
      </p>
      ${raw(renderPartialNotice(model))}
    </header>
    <article class="reader-passage" id="reader-passage">
      ${raw(renderOpenTextPassageHtml(nav.page))}
    </article>
    <footer class="reader-passage-footer">
      ${raw(multiPage ? renderContinuation(model, nav) : html``)}
      <div class="reader-library-nav">
        <a href="${model.backHref}" class="reader-library-link"
          >← Back to Open Texts</a
        >
      </div>
    </footer>
  </div>`;
}

function renderContinuation(model: OpenTextViewModel, nav: PageNav): SafeHtml {
  const { prev, next, page } = nav;
  const prevHref = openTextPageHref(model.entry.id, (prev ?? page).id);
  const nextHref = openTextPageHref(model.entry.id, (next ?? page).id);
  return html`<nav
    class="reader-continuation-actions"
    aria-label="Page navigation">
    <a
      href="${prevHref}"
      class="reader-continuation-card reader-return-btn prev-card"
      rel="prev"
      data-role="${OPEN_TEXT_VIEW_ROLES.prev}"
      ${raw(prev ? "" : " hidden")}
      ><span class="continuation-kicker">← Previous</span
      ><span
        class="continuation-title"
        data-role="${OPEN_TEXT_VIEW_ROLES.prevLabel}"
        >${prev?.label ?? ""}</span
      ></a
    >
    <a
      href="${nextHref}"
      class="reader-continuation-card reader-continue-btn next-card"
      rel="next"
      data-role="${OPEN_TEXT_VIEW_ROLES.next}"
      ${raw(next ? "" : " hidden")}
      ><span class="continuation-kicker">Next →</span
      ><span
        class="continuation-title"
        data-role="${OPEN_TEXT_VIEW_ROLES.nextLabel}"
        >${next?.label ?? ""}</span
      ></a
    >
  </nav>`;
}

function renderMetaRow(term: string, value: SafeHtml): SafeHtml {
  return html`<div class="meta-row">
    <dt>${term}</dt>
    <dd>${raw(value)}</dd>
  </div>`;
}

function renderExternalLink(href: string, text: string): SafeHtml {
  return html`<a href="${href}" target="_blank" rel="noopener noreferrer"
    >${text}</a
  >`;
}

/** The About view: provenance, license and the no-promise notice. */
export function renderOpenTextAboutHtml(model: OpenTextViewModel): SafeHtml {
  const { entry, sourceMeta, doc } = model;
  const rows: SafeHtml[] = [
    renderMetaRow("Author", html`${doc.author || entry.author}`),
    renderMetaRow("Title", html`${entry.title || doc.title}`),
    renderMetaRow("Collection", html`${sourceBadgeText(model)}`),
  ];
  if (entry.statedEdition) {
    rows.push(renderMetaRow("Edition", html`${entry.statedEdition}`));
  }
  const urn = entry.urn ?? doc.urn;
  rows.push(renderMetaRow("ID", html`<code>${urn ?? entry.id}</code>`));
  rows.push(
    renderMetaRow("Source", renderExternalLink(entry.sourceUrl, "Link"))
  );
  rows.push(
    renderMetaRow(
      "Version",
      renderExternalLink(
        `https://github.com/${sourceMeta.repo}/tree/${sourceMeta.commit}`,
        `${sourceMeta.repo}@${sourceMeta.commit.slice(0, 7)}`
      )
    )
  );
  rows.push(renderMetaRow("License", html`${entry.license}`));
  const partial = entry.partialCoverage;
  const partialHtml = partial
    ? html`<p class="reader-about-attribution">
        ${partial.message}
        <a href="${partial.libraryUrl}"
          >${partial.libraryTitle
            ? `Read ${partial.libraryTitle} in the Library`
            : "Read it in the Library"}</a
        >
      </p>`
    : html``;
  return html`<div class="reader-work-about">
    <div class="reader-about-card">
      <dl class="reader-meta-list">${joinHtml(rows)}</dl>
      <p class="reader-about-attribution">
        <strong>Uncurated.</strong> ${OPEN_TEXT_NO_PROMISE_NOTICE}
      </p>
      ${raw(partialHtml)}
    </div>
  </div>`;
}

function tabIcon(name: "book" | "notes" | "info"): SafeHtml {
  return html`<span class="reader-tab-icon" aria-hidden="true"
    >${raw(icon(name, { size: 14, strokeWidth: 2 }))}</span
  >`;
}

/** The URL of the embedded dictionary for a lookup already in `?q=`. */
function dictFrameSrc(query: string): string {
  return query
    ? `/dicts?q=${encodeURIComponent(query)}&lang=La&o=1&embedded=1`
    : "/dicts?embedded=1";
}

/**
 * The splitter and companion panel, mirroring `renderReaderDictPanelHtml` in
 * `reader.server.ts`, with the Dictionary, Notes and About tabs (there is no
 * translation). As on library pages, the Notes tab is hidden on a page
 * without notes, and `ReaderPanelController` shows or hides it again when a
 * page turn swaps the `notes` slot.
 */
function renderDictPanel(
  model: OpenTextViewModel,
  page: OpenTextPage,
  query: string
): SafeHtml {
  const closeIcon = raw(icon("close", { size: 16, strokeWidth: 2 }));
  const unarmed = query ? "" : " data-dict-unarmed";
  const minimized = query ? "" : " drawer-minimized";
  return html`<div
      class="reader-splitter resize-handle"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="Resize dictionary sidebar"
      aria-valuemin="300"
      aria-valuemax="750"
      aria-valuenow="420">
      <div class="resize-grip" aria-hidden="true"></div>
    </div>
    <aside
      class="reader-dict-panel drawer has-companion-tabs${raw(minimized)}"
      id="reader-dict"
      aria-label="Dictionary">
      <div
        class="reader-sheet-bar"
        role="separator"
        tabindex="0"
        aria-orientation="horizontal"
        aria-label="Resize dictionary drawer"
        aria-valuemin="18"
        aria-valuemax="88"
        aria-valuenow="${query ? "48" : "0"}">
        <div class="reader-sheet-handle" aria-hidden="true"></div>
        <div class="reader-sheet-teaser">
          <a
            href="#reader-dict"
            class="reader-sheet-label reader-sheet-open-link"
            title="Open Dictionary Search"
            ><span class="reader-teaser-js"
              >Tap any word to view definitions</span
            ></a
          >
          <nav class="reader-panel-tabs" aria-label="Companion panel">
            <a
              href="#panel-view-dict"
              class="reader-panel-tab"
              id="panel-tab-dict"
              aria-label="Dictionary"
              >${raw(tabIcon("book"))}<span class="reader-tab-label"
                >Dictionary</span
              ></a
            >
            <a
              href="#${OPEN_TEXT_NOTES_VIEW_ID}"
              class="reader-panel-tab"
              id="panel-tab-notes"
              aria-label="Notes"
              ${raw(page.notes.length > 0 ? "" : "hidden")}
              >${raw(tabIcon("notes"))}<span class="reader-tab-label"
                >Notes</span
              ></a
            >
            <a
              href="#panel-view-about"
              class="reader-panel-tab"
              id="panel-tab-about"
              aria-label="About"
              >${raw(tabIcon("info"))}<span class="reader-tab-label"
                >About</span
              ></a
            >
          </nav>
          <a
            href="#reader-dict-dismissed"
            class="reader-sheet-close reader-sheet-close-target"
            aria-label="Close dictionary panel"
            title="Close"
            >${closeIcon}</a
          >
        </div>
      </div>
      <div class="reader-panel-views">
        <div
          class="dict-iframe-container reader-panel-view"
          id="panel-view-dict">
          <div class="reader-dict-landing">
            <p class="reader-dict-landing-copy">
              <strong
                ><span class="reader-dict-verb-desktop">Click</span
                ><span class="reader-dict-verb-mobile">Tap</span> any
                word</strong
              >
              in the passage to look it up<span
                class="reader-dict-landing-shortcut"
                >, or press <kbd class="reader-dict-kbd">/</kbd> to search</span
              >.
            </p>
          </div>
          <iframe
            id="dict-frame"
            name="dict-frame"
            src="${dictFrameSrc(query)}"
            ${raw(unarmed)}
            class="dict-iframe"
            title="Dictionary Search and Definitions"
            loading="lazy"></iframe>
        </div>
        <div
          class="reader-panel-notes reader-panel-view reader-panel-card"
          id="${OPEN_TEXT_NOTES_VIEW_ID}"
          aria-live="polite">
          ${raw(renderNotesSlot(page))}
        </div>
        <div
          class="reader-panel-about reader-panel-view reader-panel-card"
          id="panel-view-about">
          ${raw(renderOpenTextAboutHtml(model))}
        </div>
      </div>
      <button
        type="button"
        class="reader-dict-back-to-top"
        aria-label="Scroll dictionary to top"
        title="Jump to top">
        ${raw(icon("chevronUp"))}
      </button>
    </aside>
    <a
      href="#reader-dict"
      class="reader-drawer-fab"
      aria-label="Open dictionary drawer"
      title="Open dictionary drawer"
      >${raw(icon("drawer", { size: 18, strokeWidth: 2 }))}</a
    >`;
}

/**
 * The whole `<morcus-reader-view>` frame for page `index` of the document.
 * `query` is a dictionary lookup already in the URL (`?q=`), or "".
 */
export function renderOpenTextFrameHtml(
  model: OpenTextViewModel,
  index: number,
  query: string = ""
): SafeHtml {
  const nav = pageNav(model.doc, index);
  const layout = query ? "reader-layout-active" : "reader-layout-empty";
  return html`<morcus-reader-view
    class="reader-view"
    data-open-text="${model.entry.id}"
    data-has-macra="false"
    data-has-translation="false">
    ${raw(renderTocDrawer(model, index))}
    <span
      id="reader-dict-dismissed"
      class="reader-drawer-dismiss-target"
      aria-hidden="true"></span>
    <div class="reader-split-layout ${layout}">
      <div class="reader-main-column">
        ${raw(renderStickyBar(model, nav))}
        <section class="reader-text-panel" aria-label="Reading Text">
          ${raw(renderTextCard(model, nav))}
        </section>
      </div>
      ${raw(renderDictPanel(model, nav.page, query))}
    </div>
    ${raw(renderReaderSettingsPopoverHtml({ hasMacra: false }))}
  </morcus-reader-view>`;
}

/** The module's only HTML sink (see the module comment). */
function writeOpenTextHtml(target: Element, content: SafeHtml): void {
  setHtml(target, content);
}

/** Writes the reader frame into the host's mount. */
export function mountOpenTextFrame(mount: Element, frame: SafeHtml): void {
  writeOpenTextHtml(mount, frame);
}

/**
 * Replaces the companion panel's notes with page `index`'s, for a page turn.
 * The write notifies the reader view's controllers of the swap, so
 * `ReaderPanelController` recounts the notes and shows or hides the Notes
 * tab (falling back to Dictionary when the Notes tab was open and the new
 * page has none), as `swapSlots` does on library pages.
 */
export function swapOpenTextNotes(
  root: ParentNode,
  model: OpenTextViewModel,
  index: number
): void {
  const slot = root.querySelector(
    `#${OPEN_TEXT_NOTES_VIEW_ID} [${SLOT_ATTR}="notes"]`
  );
  const page = model.doc.pages[index];
  if (slot && page) writeOpenTextHtml(slot, renderOpenTextNotesHtml(page));
}

function setArrowState(
  el: HTMLElement,
  href: string,
  target: OpenTextPage | undefined
): void {
  el.setAttribute("href", href);
  if (el.classList.contains("reader-continuation-card")) {
    el.hidden = target === undefined;
    return;
  }
  el.classList.toggle("disabled", target === undefined);
  if (target === undefined) {
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("tabindex", "-1");
  } else {
    el.removeAttribute("aria-disabled");
    el.removeAttribute("tabindex");
  }
}

function setLabels(root: ParentNode, role: string, text: string): void {
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${role}"]`
  )) {
    el.textContent = text;
  }
}

/**
 * Points the permalink heading (`renderReaderHeadingHtml`) at another page:
 * its link, its label and its text, leaving the copy icons in place.
 */
function syncHeading(root: ParentNode, label: string, href: string): void {
  const link = root.querySelector<HTMLAnchorElement>(
    "h1.reader-passage-heading a.reader-heading-link"
  );
  if (!link) return;
  link.setAttribute("href", href);
  link.setAttribute("aria-label", `${label} (copy link to this page)`);
  // The label is the link's first child, a text node (page labels are never
  // empty), followed by the icons.
  const first = link.firstChild;
  if (first instanceof Text) first.data = label;
}

/**
 * Updates everything around the passage for page `index`: page labels, the
 * heading's permalink, prev / next links and the notes link. Text and
 * attributes only; the passage itself is replaced with `adoptPassage`, the
 * notes with {@link swapOpenTextNotes}, and the contents dialog's current
 * page is moved by the reader view (`syncTocActivePage`).
 */
export function syncOpenTextPageChrome(
  root: ParentNode,
  model: OpenTextViewModel,
  index: number
): void {
  const { page, prev, next } = pageNav(model.doc, index);
  setLabels(root, OPEN_TEXT_VIEW_ROLES.pageLabel, page.label);
  syncHeading(root, page.label, openTextPageHref(model.entry.id, page.id));
  const prevHref = openTextPageHref(model.entry.id, (prev ?? page).id);
  const nextHref = openTextPageHref(model.entry.id, (next ?? page).id);
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${OPEN_TEXT_VIEW_ROLES.prev}"]`
  )) {
    setArrowState(el, prevHref, prev);
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${OPEN_TEXT_VIEW_ROLES.next}"]`
  )) {
    setArrowState(el, nextHref, next);
  }
  setLabels(root, OPEN_TEXT_VIEW_ROLES.prevLabel, prev?.label ?? "");
  setLabels(root, OPEN_TEXT_VIEW_ROLES.nextLabel, next?.label ?? "");
  const notes = page.notes.length;
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${OPEN_TEXT_VIEW_ROLES.notesLink}"]`
  )) {
    el.hidden = notes === 0;
    if (el instanceof HTMLAnchorElement) el.textContent = notesLinkText(notes);
  }
}
