/**
 * Renders a parsed {@link ExperimentalTextDocument} for `<morcus-experimental-text-reader>`.
 *
 * The Experimental Texts reader is the one JS-only reading surface (see
 * "JS-only exception: Experimental Texts" in `src/web/ui/README.md`): the
 * text only exists after the browser fetches and parses it, so the server
 * renders just the host (`renderExperimentalTextReaderHostHtml`) and this module
 * builds the reading UI on the client. To read exactly like a library work,
 * it builds the same `<morcus-reader-view>` frame the server renders for
 * library and external texts (`reader.server.ts`): a text card whose passage
 * uses the library's section shape (`.reader-section` > `.reader-gutter` +
 * `.reader-passage`), next to the dictionary companion panel. The reader view
 * then tokenizes the words, looks them up in the dictionary panel, and
 * handles the section anchors, unchanged.
 *
 * Only existing reader, shell and core classes are used, so nothing here needs
 * a stylesheet of its own. The `experimental-text-badge*` classes are hooks that the
 * Experimental Texts stylesheet may style; unstyled, they read as plain
 * metadata text.
 *
 * The frame markup every reader shares comes from the same browser-safe
 * renderers the server uses: the contents button and dialog
 * (`reader_toc.common.ts`), and the sticky bar, its pager arrows, the `Aa`
 * settings button and dialog, the permalink heading and the companion panel
 * (`reader_frame.common.ts`). A page's notes sit in the
 * companion panel's Notes tab, in the same `notes` slot as on library pages,
 * so `ReaderPanelController` handles them the same way.
 *
 * All DOM writes go through {@link writeExperimentalTextHtml}, the module's single
 * audited `setHtml` call site (`inventory_ratchet.json`). Page turns re-render
 * only the passage, through the reader view's `adoptPassage`, and the notes
 * slot ({@link swapExperimentalTextNotes}), and patch the surrounding frame in place
 * with {@link syncExperimentalTextPageChrome} (text, attributes and the `hidden` /
 * `disabled` state of the pager links, never new markup), so the dictionary
 * panel and its state survive a page turn.
 */

import type {
  ExperimentalTextCatalogEntry,
  ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import type {
  ExperimentalTextBlock,
  ExperimentalTextDocument,
  ExperimentalTextPage,
  ExperimentalTextRun,
  ExperimentalTextSegment,
} from "@/common/experimental_texts/experimental_text_document";
import {
  html,
  joinHtml,
  raw,
  setHtml,
  type SafeHtml,
} from "@/web/ui/core/index.client";
import {
  EXPERIMENTAL_TEXTS_PATH,
  buildExperimentalTextsUrl,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import { SLOT_ATTR } from "@/web/ui/core/nav/slots.common";
import {
  renderReaderCompanionPanelHtml,
  renderReaderHeadingHtml,
  renderReaderPagerArrowHtml,
  renderReaderSettingsPopoverHtml,
  renderReaderStickyBarHtml,
} from "@/web/ui/reader/reader_frame.common";
import {
  renderPageListTocDrawerHtml,
  renderTocTriggerHtml,
} from "@/web/ui/reader/reader_toc.common";

/** `data-role` values inside the client-rendered frame. */
export const EXPERIMENTAL_TEXT_VIEW_ROLES = {
  prev: "experimental-text-prev",
  next: "experimental-text-next",
  prevLabel: "experimental-text-prev-label",
  nextLabel: "experimental-text-next-label",
  pageLabel: "experimental-text-page-label",
  uncuratedBadge: "experimental-text-uncurated-badge",
  aboutLink: "experimental-text-about-link",
} as const;

/** The companion panel's Notes view (target of its Notes tab). */
export const EXPERIMENTAL_TEXT_NOTES_VIEW_ID = "panel-view-notes";

/** The element id of a page's note `index` (0-based): `note-1`, `note-2`... */
export function experimentalTextNoteId(index: number): string {
  return `note-${index + 1}`;
}

/** Everything the frame shows besides the document itself. */
export interface ExperimentalTextViewModel {
  readonly entry: ExperimentalTextCatalogEntry;
  readonly sourceMeta: ExperimentalTextSourceRepoMeta;
  readonly doc: ExperimentalTextDocument;
  /** The "Back to Experimental Texts" link target. */
  readonly backHref: string;
}

/** The URL that opens `pageId` of an Experimental Text. */
export function experimentalTextPageHref(
  entryId: string,
  pageId: string
): string {
  return buildExperimentalTextsUrl({ open: entryId, page: pageId });
}

/**
 * The index of the page named by `pageRef` (an `ExperimentalTextPage.id`, or failing
 * that a page label such as `col. 529`), or -1 when nothing matches.
 */
export function findExperimentalTextPageIndex(
  doc: ExperimentalTextDocument,
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

/** Languages read as Latin; other languages get an explicit `lang` attribute. */
const LATIN_LANGS = new Set(["la", "lat"]);
/** Non-Latin languages eligible for dictionary lookup (Greek via Logeion). */
const GREEK_LANGS = new Set(["grc", "el", "greek", "gr"]);

function renderRun(run: ExperimentalTextRun): SafeHtml {
  const style = run.style;
  const classes: string[] = [];
  if (style?.italic) classes.push("italic");
  if (style?.bold) classes.push("bold");
  if (style?.smallCaps) classes.push("smallcaps");
  if (style?.superscript) classes.push("superscript");
  let inner = html`${run.text}`;
  if (style?.subscript) inner = html`<sub>${raw(inner)}</sub>`;
  const lang = run.lang?.toLowerCase();
  if (lang !== undefined && !LATIN_LANGS.has(lang)) {
    if (GREEK_LANGS.has(lang)) {
      return html`<span class="${classes.join(" ")}" lang="${run.lang}"
        >${raw(inner)}</span
      >`;
    }
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

function renderRuns(runs: readonly ExperimentalTextRun[]): SafeHtml {
  return html`${joinHtml(runs.map(renderRun))}`;
}

/** An inline marker that has no gutter to sit in (inside a note). */
function renderInlineMarker(label: string): SafeHtml {
  return html`<span class="text-muted" data-no-tokenize="true"
    >[${label}]</span
  >`;
}

function renderInlineSegments(
  segments: readonly ExperimentalTextSegment[]
): SafeHtml {
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
  runs: ExperimentalTextRun[];
}

/** Splits segments at section markers; adjacent markers share a piece. */
function splitAtMarkers(
  segments: readonly ExperimentalTextSegment[]
): SegmentPiece[] {
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
function trimRuns(runs: readonly ExperimentalTextRun[]): ExperimentalTextRun[] {
  const out = runs.map((run) => ({ ...run }));
  while (out.length > 0 && out[0].text.trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].text.trim() === "") out.pop();
  if (out.length > 0) {
    out[0].text = out[0].text.trimStart();
    out[out.length - 1].text = out[out.length - 1].text.trimEnd();
  }
  return out;
}

function isRun(
  segment: ExperimentalTextSegment
): segment is ExperimentalTextRun {
  return segment.kind === "text";
}

function markerLabels(segments: readonly ExperimentalTextSegment[]): string[] {
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
  block: ExperimentalTextBlock,
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
 * shows the Notes tab for, and reveals for a `#note-<n>` link. Experimental
 * Text notes have no in-text markers, so the label is plain text rather than a
 * back-link. "" for a page without notes, as on library pages.
 */
export function renderExperimentalTextNotesHtml(
  page: ExperimentalTextPage
): SafeHtml {
  if (page.notes.length === 0) return html``;
  const items = page.notes.map(
    (note, i) =>
      html`<li class="reader-note" id="${experimentalTextNoteId(i)}">
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

/**
 * The inner HTML of `#reader-passage` for one page: a section row per block
 * (per marker within a paragraph). The page's notes are in the companion
 * panel ({@link renderExperimentalTextNotesHtml}).
 */
export function renderExperimentalTextPassageHtml(
  page: ExperimentalTextPage
): SafeHtml {
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
  page: ExperimentalTextPage;
  prev: ExperimentalTextPage | undefined;
  next: ExperimentalTextPage | undefined;
}

function pageNav(doc: ExperimentalTextDocument, index: number): PageNav {
  return {
    page: doc.pages[index],
    prev: index > 0 ? doc.pages[index - 1] : undefined,
    next: index < doc.pages.length - 1 ? doc.pages[index + 1] : undefined,
  };
}

function sourceBadgeText(model: ExperimentalTextViewModel): string {
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
  model: ExperimentalTextViewModel,
  dir: "prev" | "next",
  current: ExperimentalTextPage,
  target: ExperimentalTextPage | undefined
): SafeHtml {
  const isPrev = dir === "prev";
  const role = isPrev
    ? EXPERIMENTAL_TEXT_VIEW_ROLES.prev
    : EXPERIMENTAL_TEXT_VIEW_ROLES.next;
  const label = isPrev ? "Previous page" : "Next page";
  return renderReaderPagerArrowHtml({
    dir,
    href: experimentalTextPageHref(model.entry.id, (target ?? current).id),
    disabled: target === undefined,
    ariaLabel: label,
    title: label,
    attrs: `data-role="${role}"`,
  });
}

/**
 * The bar's centre: for a work of several pages, the library reader's
 * contents button (`#reader-toc-btn`, opening {@link renderTocDrawer}); for a
 * single page, which has nothing to switch to, just the title and page.
 */
function renderStickyCenter(
  model: ExperimentalTextViewModel,
  nav: PageNav
): SafeHtml {
  const title = model.doc.title || model.entry.title;
  const pageLabel = html`<span
    class="jump-val"
    data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.pageLabel}"
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

function renderStickyBar(
  model: ExperimentalTextViewModel,
  nav: PageNav
): SafeHtml {
  return renderReaderStickyBarHtml({
    prevHtml: renderStickyArrow(model, "prev", nav.page, nav.prev),
    centerHtml: renderStickyCenter(model, nav),
    nextHtml: renderStickyArrow(model, "next", nav.page, nav.next),
  });
}

/**
 * The library reader's contents dialog (`#reader-toc-drawer`), listing every
 * page, for a work of several pages; "" for a single page. Its items are
 * page links (`data-page-id`) that `<morcus-experimental-text-reader>` turns in place.
 */
function renderTocDrawer(
  model: ExperimentalTextViewModel,
  index: number
): SafeHtml {
  const { entry, doc } = model;
  if (doc.pages.length <= 1) return html``;
  return renderPageListTocDrawerHtml({
    pages: doc.pages.map((page) => ({
      id: page.id,
      label: page.label,
      href: experimentalTextPageHref(entry.id, page.id),
    })),
    activeIndex: index,
    // A GET form's action drops its own query, so the entry is a field.
    formAction: EXPERIMENTAL_TEXTS_PATH,
    hiddenFields: [["open", entry.id]],
    footer: { href: model.backHref, label: "Back to Experimental Texts" },
  });
}

function renderPartialNotice(model: ExperimentalTextViewModel): SafeHtml {
  const partial = model.entry.partialCoverage;
  if (!partial) return html``;
  const target = partial.libraryTitle
    ? `Read ${partial.libraryTitle} in the Library`
    : "Read it in the Library";
  return html`<p class="external-notice" role="note">
    ${partial.message} <a href="${partial.libraryUrl}">${target}</a>
  </p>`;
}

function renderTextCard(
  model: ExperimentalTextViewModel,
  nav: PageNav
): SafeHtml {
  const { entry, doc } = model;
  const author = doc.author || entry.author;
  const title = entry.title || doc.title;
  const multiPage = doc.pages.length > 1;
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
          experimentalTextPageHref(entry.id, nav.page.id)
        )
      )}
      <p class="reader-header-attribution">
        <span
          class="experimental-text-badge experimental-text-badge-uncurated"
          title="Shown as the source has it; not checked"
          data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.uncuratedBadge}"
          >Experimental</span
        ><span class="reader-meta-sep" aria-hidden="true"> · </span
        ><a
          href="#panel-view-about"
          class="reader-attribution-link"
          data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.aboutLink}"
          >About this text<span aria-hidden="true"> ⓘ</span></a
        >
      </p>
      ${raw(renderPartialNotice(model))}
    </header>
    <article class="reader-passage" id="reader-passage">
      ${raw(renderExperimentalTextPassageHtml(nav.page))}
    </article>
    <footer class="reader-passage-footer">
      ${raw(multiPage ? renderContinuation(model, nav) : html``)}
      <div class="reader-library-nav">
        <a href="${model.backHref}" class="reader-library-link"
          >← Back to Experimental Texts</a
        >
      </div>
    </footer>
  </div>`;
}

function renderContinuation(
  model: ExperimentalTextViewModel,
  nav: PageNav
): SafeHtml {
  const { prev, next, page } = nav;
  const prevHref = experimentalTextPageHref(model.entry.id, (prev ?? page).id);
  const nextHref = experimentalTextPageHref(model.entry.id, (next ?? page).id);
  return html`<nav
    class="reader-continuation-actions"
    aria-label="Page navigation">
    <a
      href="${prevHref}"
      class="reader-continuation-card reader-return-btn prev-card"
      rel="prev"
      data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.prev}"
      ${raw(prev ? "" : " hidden")}
      ><span class="continuation-kicker">← Previous</span
      ><span
        class="continuation-title"
        data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.prevLabel}"
        >${prev?.label ?? ""}</span
      ></a
    >
    <a
      href="${nextHref}"
      class="reader-continuation-card reader-continue-btn next-card"
      rel="next"
      data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.next}"
      ${raw(next ? "" : " hidden")}
      ><span class="continuation-kicker">Next →</span
      ><span
        class="continuation-title"
        data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.nextLabel}"
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

/** The About view: provenance, license and the experimental-text caveat. */
export function renderExperimentalTextAboutHtml(
  model: ExperimentalTextViewModel
): SafeHtml {
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
  // The header keeps only "Experimental · About this text": the collection,
  // volume and source link live here.
  rows.push(
    renderMetaRow("Source", renderExternalLink(entry.sourceUrl, "View source"))
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
        This text is experimental, and is more likely to have typos or
        formatting quirks than works in the <a href="/library">Library</a>.
      </p>
      ${raw(partialHtml)}
    </div>
  </div>`;
}

/** The URL of the embedded dictionary for a lookup already in `?q=`. */
function dictFrameSrc(query: string): string {
  return query
    ? `/dicts?q=${encodeURIComponent(query)}&lang=La&o=1&embedded=1`
    : "/dicts?embedded=1";
}

/**
 * The splitter and companion panel the library reader renders, with the
 * Dictionary, Notes and About tabs (there is no translation). As on library
 * pages, the Notes tab is hidden on a page without notes, and
 * `ReaderPanelController` shows or hides it again when a page turn swaps the
 * `notes` slot.
 */
function renderDictPanel(
  model: ExperimentalTextViewModel,
  page: ExperimentalTextPage,
  query: string
): SafeHtml {
  return renderReaderCompanionPanelHtml({
    query,
    dictIframeSrc: dictFrameSrc(query),
    companion: {
      notesHtml: renderExperimentalTextNotesHtml(page),
      aboutHtml: renderExperimentalTextAboutHtml(model),
      hasTranslation: false,
    },
  });
}

/**
 * The whole `<morcus-reader-view>` frame for page `index` of the document.
 * `query` is a dictionary lookup already in the URL (`?q=`), or "".
 */
export function renderExperimentalTextFrameHtml(
  model: ExperimentalTextViewModel,
  index: number,
  query: string = ""
): SafeHtml {
  const nav = pageNav(model.doc, index);
  const layout = query ? "reader-layout-active" : "reader-layout-empty";
  return html`<morcus-reader-view
    class="reader-view"
    data-experimental-text="${model.entry.id}"
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
function writeExperimentalTextHtml(target: Element, content: SafeHtml): void {
  setHtml(target, content);
}

/** Writes the reader frame into the host's mount. */
export function mountExperimentalTextFrame(
  mount: Element,
  frame: SafeHtml
): void {
  writeExperimentalTextHtml(mount, frame);
}

/**
 * Replaces the companion panel's notes with page `index`'s, for a page turn.
 * The write notifies the reader view's controllers of the swap, so
 * `ReaderPanelController` recounts the notes and shows or hides the Notes
 * tab (falling back to Dictionary when the Notes tab was open and the new
 * page has none), as `swapSlots` does on library pages.
 */
export function swapExperimentalTextNotes(
  root: ParentNode,
  model: ExperimentalTextViewModel,
  index: number
): void {
  const slot = root.querySelector(
    `#${EXPERIMENTAL_TEXT_NOTES_VIEW_ID} [${SLOT_ATTR}="notes"]`
  );
  const page = model.doc.pages[index];
  if (slot && page)
    writeExperimentalTextHtml(slot, renderExperimentalTextNotesHtml(page));
}

function setArrowState(
  el: HTMLElement,
  href: string,
  target: ExperimentalTextPage | undefined
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
 * heading's permalink and prev / next links. Text and
 * attributes only; the passage itself is replaced with `adoptPassage`, the
 * notes with {@link swapExperimentalTextNotes}, and the contents dialog's current
 * page is moved by the reader view (`syncTocActivePage`).
 */
export function syncExperimentalTextPageChrome(
  root: ParentNode,
  model: ExperimentalTextViewModel,
  index: number
): void {
  const { page, prev, next } = pageNav(model.doc, index);
  setLabels(root, EXPERIMENTAL_TEXT_VIEW_ROLES.pageLabel, page.label);
  syncHeading(
    root,
    page.label,
    experimentalTextPageHref(model.entry.id, page.id)
  );
  const prevHref = experimentalTextPageHref(model.entry.id, (prev ?? page).id);
  const nextHref = experimentalTextPageHref(model.entry.id, (next ?? page).id);
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.prev}"]`
  )) {
    setArrowState(el, prevHref, prev);
  }
  for (const el of root.querySelectorAll<HTMLElement>(
    `[data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.next}"]`
  )) {
    setArrowState(el, nextHref, next);
  }
  setLabels(root, EXPERIMENTAL_TEXT_VIEW_ROLES.prevLabel, prev?.label ?? "");
  setLabels(root, EXPERIMENTAL_TEXT_VIEW_ROLES.nextLabel, next?.label ?? "");
}
