import { assert } from "@/common/assert";
import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import { formatSectionLabel } from "@/common/library/section_labels";
import { XmlNode } from "@/common/xml/xml_node";
import { preRenderTocItemsHtml } from "@/web/ui/reader/reader_toc.server";
import * as he from "he";

function formatPageTitle(pageId: string[], textParts: string[]): string {
  if (pageId.length === 0) return "Preface";
  const parts: string[] = [];
  for (let i = 0; i < pageId.length; i++) {
    const partName = textParts[i] ?? `Level ${i + 1}`;
    parts.push(formatSectionLabel(partName, pageId[i]));
  }
  return parts.join(", ");
}

function getSectionLocalId(secId: string[], pageId: string[]): string {
  const localTokens = secId.slice(pageId.length);
  return localTokens.length > 0
    ? localTokens.join(".")
    : secId[secId.length - 1] ?? "";
}

function getSectionPrefix(secId: string[], pageId: string[]): string {
  const full = secId.join(".");
  const local = getSectionLocalId(secId, pageId);
  return full.slice(0, full.length - local.length);
}

/** A critical apparatus note referenced from the page being rendered. */
interface CollectedNote {
  /** Display label, e.g. `"3"` for a text note or `"c"` for a translation note. */
  label: string;
  /** DOM id of the note body in the footnote list, e.g. `"note-n3"`. */
  bodyId: string;
  /** DOM id of the in-text marker, e.g. `"noteref-n3"`. */
  refId: string;
  /** Rendered HTML of the note body. */
  bodyHtml: string;
}

/**
 * Accumulates the note bodies referenced by a single page.
 *
 * `process_work.ts` hoists note bodies into a work-level array and leaves
 * positional `<note noteId="N"/>` markers behind, where `N` indexes that array
 * across the whole work. Readers see one page at a time, so markers are
 * renumbered per page: a page that happens to open at note 2,314 still labels
 * its first marker "1".
 */
interface NoteCollector {
  /** Work-level note bodies, indexed by a marker's `noteId`. */
  bodies: XmlNode[];
  /** Separates text notes (`"n"`) from translation notes (`"t"`) in DOM ids. */
  idPrefix: string;
  /**
   * Text notes are numbered and translation notes lettered, so a parallel row
   * never shows two unrelated markers both labelled "3".
   */
  labelStyle: "numeric" | "alpha";
  /** Notes referenced so far on this page, in document order. */
  collected: CollectedNote[];
}

function createNoteCollector(
  bodies: XmlNode[] | undefined,
  idPrefix: string,
  labelStyle: "numeric" | "alpha"
): NoteCollector {
  return { bodies: bodies ?? [], idPrefix, labelStyle, collected: [] };
}

/** Converts a 1-based sequence number to `a`, `b`, ... `z`, `aa`, `ab`, ... */
function alphabeticLabel(seq: number): string {
  let remaining = seq;
  let label = "";
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    label = String.fromCharCode(97 + digit) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

/**
 * Renders an in-text note marker as a link to its footnote body, registering
 * that body with `collector` so the page can render it.
 *
 * Returns the empty string when the body cannot be resolved: a marker with
 * nothing behind it is worse than no marker, and that dead control is exactly
 * what this replaces.
 */
function renderNoteMarker(
  noteId: string,
  collector: NoteCollector | undefined
): string {
  const index = Number.parseInt(noteId, 10);
  const body = collector?.bodies[index];
  if (collector === undefined || body === undefined) {
    return "";
  }
  const seq = collector.collected.length + 1;
  const label =
    collector.labelStyle === "alpha" ? alphabeticLabel(seq) : String(seq);
  const bodyId = `note-${collector.idPrefix}${seq}`;
  const refId = `noteref-${collector.idPrefix}${seq}`;
  collector.collected.push({
    label,
    bodyId,
    refId,
    // Rendered without a collector: a note nested inside a note body would
    // have no marker position of its own to link back to.
    bodyHtml: renderXmlNodeCleanHtml(body),
  });
  // Bracketed, as on Wikipedia: a bare superscript numeral is a ~14px tap
  // target, and the brackets also keep the marker legible against the digits
  // of a citation or a date in the text itself. The CSS pads this out to a
  // real hit area on top of the extra glyph width.
  return `<a class="reader-note-ref" id="${refId}" href="#${bodyId}" role="doc-noteref" aria-label="Note ${label}"><sup>[${label}]</sup></a>`;
}

/**
 * The renditions on a content node. `process_work` emits one or more
 * space-separated canonical tokens (see `canonicalRend`), e.g. `smallcaps` or
 * `overline smallcaps`.
 */
function rendClasses(node: XmlNode): Set<string> {
  return new Set(node.getAttr("rend")?.split(" "));
}

/** Elements rendered as markers with no text of their own (rule 4). */
const MARKER_TAGS = new Set(["br", "space", "gap", "note"]);

/**
 * Whether `node` renders as inline text, as opposed to a marker or a line,
 * block, heading or list element, which break words on their own.
 */
function isInlineTextElement(node: XmlNode): boolean {
  const rends = rendClasses(node);
  return !(
    MARKER_TAGS.has(node.name) ||
    node.name === "head" ||
    node.name === "ul" ||
    node.name === "li" ||
    node.getAttr("l") !== undefined ||
    node.getAttr("block") !== undefined ||
    node.getAttr("sectionHead") !== undefined ||
    rends.has("blockquote") ||
    rends.has("indent")
  );
}

/** The text `node` renders, excluding marker elements. */
function inlineText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  if (MARKER_TAGS.has(node.name)) {
    return "";
  }
  return node.children.map(inlineText).join("");
}

/**
 * Whether a space must separate two adjacent sibling elements, following the
 * word-boundary rule on `extractRowText` (`corpus_library_utils.ts`): two
 * sibling tags that meet with nothing between them are a word break (rule 2),
 * unless the first ends in `-` (rule 3).
 *
 * Unstyled wrappers render no element of their own, so without this their
 * contents would run together (Livy `</choice><choice>` as `tumCocles`).
 * Markers and structural elements already break words, and get no space, so
 * a note marker stays flush against its word.
 */
function needsWordBreak(previous: XmlNode, next: XmlNode): boolean {
  if (!isInlineTextElement(previous) || !isInlineTextElement(next)) {
    return false;
  }
  const before = inlineText(previous);
  const after = inlineText(next);
  return (
    before.trim().length > 0 &&
    after.trim().length > 0 &&
    !/\s$/.test(before) &&
    !/^\s/.test(after) &&
    !before.endsWith("-")
  );
}

function renderXmlNodeCleanHtml(
  node: XmlNode | string,
  notes?: NoteCollector
): string {
  if (typeof node === "string") {
    return he.escape(node);
  }

  const tag = node.name;
  const rends = rendClasses(node);
  const isLine = node.getAttr("l") === "1";
  const isBlock = node.getAttr("block") === "1";
  const isSectionHead = node.getAttr("sectionHead") === "1";
  const noteId = node.getAttr("noteId");

  if (tag === "br") {
    return "<br>";
  }
  if (tag === "space") {
    return '<span class="line-space" aria-hidden="true"></span>';
  }
  if (tag === "gap") {
    return '<span class="reader-gap text-muted" data-no-tokenize="true">[gap]</span>';
  }
  if (tag === "note" && noteId !== undefined) {
    return renderNoteMarker(noteId, notes);
  }

  const childrenHtml = node.children
    .map((child, i) => {
      const previous = node.children[i - 1];
      const html = renderXmlNodeCleanHtml(child, notes);
      return child instanceof XmlNode &&
        previous instanceof XmlNode &&
        needsWordBreak(previous, child)
        ? ` ${html}`
        : html;
    })
    .join("");

  if (tag === "head" || isSectionHead) {
    return `<h3 class="reader-subheading">${childrenHtml}</h3>`;
  }
  if (tag === "b") {
    return `<strong>${childrenHtml}</strong>`;
  }
  if (tag === "ul") {
    return `<ul class="reader-list">${childrenHtml}</ul>`;
  }
  if (tag === "li") {
    return `<li>${childrenHtml}</li>`;
  }

  // Handle attributes and renditions
  const classes: string[] = [];
  if (isLine) classes.push("reader-line");
  if (isBlock) classes.push("reader-block");
  if (rends.has("italic")) classes.push("italic");
  if (rends.has("bold")) classes.push("bold");
  if (rends.has("blockquote")) classes.push("blockquote");
  if (rends.has("sup") || rends.has("superscript")) {
    classes.push("superscript");
  }
  // Perseus marks the inscriptional and legal quotations that other editions
  // set in small caps with a bare `rend="7"`.
  if (rends.has("smallcaps") || rends.has("7")) classes.push("smallcaps");
  if (rends.has("uppercase")) classes.push("uppercase");
  if (rends.has("overline")) classes.push("overline");
  if (rends.has("indent")) {
    classes.push("indent");
    // Inside a paragraph an indent opens the paragraph, so only the first line
    // moves; anywhere else (verse, above all) the whole block shifts. Mirrors
    // the textIndent / paddingLeft split in `reader.tsx`.
    if (node.getAttr("rendParent") === "p") classes.push("indent-para");
  }

  const classAttr = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";

  if (isLine) {
    return `<span${classAttr}>${childrenHtml}</span>`;
  }
  if (isBlock) {
    return `<p${classAttr}>${childrenHtml}</p>`;
  }
  if (classes.length === 0) {
    return childrenHtml;
  }

  // A `blockquote` rendition stays a `<span>` made block-level by CSS, as it
  // was in V1: prose sections are wrapped in a `<p>`, and a `<blockquote>`
  // inside a `<p>` is invalid and gets silently reparented by the browser.
  return `<span${classAttr}>${childrenHtml}</span>`;
}

function renderPassageContent(
  node: XmlNode<ProcessedWorkContentNodeType>,
  isVerseWork: boolean,
  notes?: NoteCollector
): string {
  return wrapPassageHtml(renderXmlNodeCleanHtml(node, notes), isVerseWork);
}

/** Wraps a row's rendered HTML in a verse line or prose paragraph. */
function wrapPassageHtml(rendered: string, isVerseWork: boolean): string {
  if (isVerseWork) {
    // Matches `reader-line` with or without trailing rendition classes, so an
    // indented pentameter is not wrapped in a second, redundant line span.
    if (
      rendered.startsWith('<span class="reader-line') ||
      rendered.startsWith("<h") ||
      rendered.startsWith('<span class="line-space"')
    ) {
      return rendered;
    }
    return `<span class="reader-line">${rendered}</span>`;
  }
  // For prose, if it's not already wrapped in a paragraph or block, wrap in paragraph
  if (
    rendered.startsWith("<p") ||
    rendered.startsWith("<h") ||
    rendered.startsWith("<ul")
  ) {
    return rendered;
  }
  return `<p class="reader-paragraph">${rendered}</p>`;
}

/** One labelled group of footnotes, e.g. the notes on the translation. */
interface NoteGroup {
  /** Shown only when a page carries more than one group. */
  title: string;
  notes: CollectedNote[];
}

/**
 * Renders a page's collected notes as an endnote list.
 *
 * This is the No-JS baseline, and deliberately the scholarly convention rather
 * than V1's per-marker tooltip: at ~12 notes per page (Ammianus) tooltips do
 * not scale, and a list in page flow also survives printing.
 */
function renderNotesSection(
  groups: NoteGroup[],
  mainHeading = "Notes",
  headingId = "reader-notes-heading"
): string | undefined {
  const populated = groups.filter((group) => group.notes.length > 0);
  if (populated.length === 0) {
    return undefined;
  }
  const showTitles = populated.length > 1;
  const sections = populated.map((group) => {
    const heading = showTitles
      ? `<h3 class="reader-notes-subheading">${he.escape(group.title)}</h3>`
      : "";
    const items = group.notes
      .map(
        (note) =>
          `<li class="reader-note" id="${note.bodyId}"><a class="reader-note-backref" href="#${note.refId}" role="doc-backlink" aria-label="Back to note ${note.label} in the text">[${note.label}]</a><div class="reader-note-body">${note.bodyHtml}</div></li>`
      )
      .join("\n");
    return `${heading}<ol class="reader-notes-list">${items}</ol>`;
  });
  return `<aside class="reader-notes" role="doc-endnotes" aria-labelledby="${headingId}"><h2 class="reader-notes-heading" id="${headingId}">${he.escape(
    mainHeading
  )}</h2>${sections.join("\n")}</aside>`;
}

type ProcessedPage = ProcessedWork2["pages"][number];

/**
 * Latin page ids whose translation page is cited differently, keyed by the
 * Latin work id. The Latin and English editions are separate Perseus TEI
 * files that disagree on a handful of divisions: Livy's preface is `1.pr` in
 * Latin but `1.0` in English, the Latin *Pro Rabirio* splits a fragment off as
 * `38b` where the English has `38f`, and the Latin *Amores* splits two poems
 * (`2.9`, `3.11`) that the English translates whole. Every other page matches
 * by id, so this stays a short explicit table rather than a fuzzy match.
 */
const TRANSLATION_PAGE_ALIASES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  // Livy, Ab urbe condita
  "phi0914.phi001.perseus-lat2": { "1.pr": "1.0" },
  // Cicero, Pro C. Rabirio Perduellionis Reo
  "phi0474.phi012.perseus-lat2": { "38b": "38f" },
  // Ovid, Amores. Both halves of a split poem show the whole English poem.
  "phi0959.phi001.perseus-lat2": {
    "2.9a": "2.9",
    "2.9b": "2.9",
    "3.11a": "3.11",
    "3.11b": "3.11",
  },
};

/**
 * Finds the translation page for Latin pages, as V1's `findMatchPage` did:
 * the Latin page id (after `TRANSLATION_PAGE_ALIASES`) is cut down to the
 * translation's pagination depth, so a translation paginated more coarsely
 * than the Latin (by book rather than by chapter, say) still matches.
 *
 * Translations are matched by page rather than by row because their rows do
 * not line up with the Latin: verse translations rarely have the same number
 * of lines, and editions differ in which sections they number.
 */
function createTranslationPageMatcher(
  latinWorkId: string,
  translationWork: ProcessedWork2
): (latinPageId: string[]) => ProcessedPage | undefined {
  const aliases = TRANSLATION_PAGE_ALIASES[latinWorkId] ?? {};
  const depth = translationWork.pages[0]?.id.length ?? 0;
  const pagesById = new Map<string, ProcessedPage>();
  for (const page of translationWork.pages) {
    const key = page.id.join(".");
    if (!pagesById.has(key)) {
      pagesById.set(key, page);
    }
  }
  return (latinPageId) => {
    const alias = aliases[latinPageId.join(".")];
    const normalized = alias === undefined ? latinPageId : alias.split(".");
    return pagesById.get(normalized.slice(0, depth).join("."));
  };
}

/**
 * Renders the rows of `transPage`, the translation of one Latin page, as
 * translation sections. Rows that render nothing are skipped, and only leaf
 * rows (lines or sections) get a citation in the gutter: headings and
 * editorial notes sit at a coarser level and have no number of their own.
 */
function renderTranslationSections(
  translationWork: ProcessedWork2,
  transPage: ProcessedPage,
  notes: NoteCollector
): string[] {
  const textParts = translationWork.textParts;
  const isVerse =
    textParts.length > 0 &&
    textParts[textParts.length - 1].toLowerCase() === "line";
  const [start, end] = transPage.rows;
  const usedIds = new Set<string>();
  const sections: string[] = [];
  for (let j = start; j < end; j++) {
    const [tId, tNode] = translationWork.rows[j];
    const rendered = renderXmlNodeCleanHtml(tNode, notes);
    if (rendered.trim() === "") {
      continue;
    }
    const transHtml = wrapPassageHtml(rendered, isVerse);
    const isLeafRow = tId.length === textParts.length;
    const tDotId = tId.join(".");
    // Only leaf rows carry an id, as on the Latin side: heading rows repeat
    // their parent's id, and ids must stay unique within the page.
    const idAttr =
      isLeafRow && !usedIds.has(tDotId) ? ` id="trans-sec-${tDotId}"` : "";
    usedIds.add(tDotId);
    const gutterLabel = isLeafRow
      ? `<span class="cite-local">${he.escape(
          getSectionLocalId(tId, transPage.id)
        )}</span>`
      : "";
    sections.push(
      `<div class="reader-translation-section"${idAttr}><div class="reader-translation-gutter">${gutterLabel}</div><div class="reader-translation-text">${transHtml}</div></div>`
    );
  }
  return sections;
}

export function preprocessWorkToV2(
  work: ProcessedWork2,
  metadata: LibraryWorkMetadata,
  translationWork?: ProcessedWork2
): V2PreprocessedWork {
  const textParts = work.textParts;
  const isVerseWork =
    textParts.length > 0 &&
    textParts[textParts.length - 1].toLowerCase() === "line";
  const paginationDepth =
    work.pages[0]?.id.length ??
    (textParts.length > 1 ? textParts.length - 1 : 1);

  const findTranslationPage = translationWork
    ? createTranslationPageMatcher(work.info.workId, translationWork)
    : undefined;

  const v2Pages: V2PreprocessedPage[] = [];
  const seenPageIds = new Set<string>();

  for (const page of work.pages) {
    const pageId = page.id;
    const dotPageId = pageId.join(".");
    assert(
      !seenPageIds.has(dotPageId),
      `Duplicate page id ${dotPageId} in ${work.info.workId}`
    );
    seenPageIds.add(dotPageId);
    const pageTitle = formatPageTitle(pageId, textParts);
    const [startIdx, endIdx] = page.rows;

    const singleSectionsHtml: string[] = [];
    const citationIds: string[] = [];
    const textNotes = createNoteCollector(work.notes, "n", "numeric");
    const translationNotes = createNoteCollector(
      translationWork?.notes,
      "t",
      "alpha"
    );

    let verseLineIndex = 0;

    for (let j = startIdx; j < endIdx; j++) {
      const [secId, node] = work.rows[j];
      const dotId = secId.join(".");
      const localId = getSectionLocalId(secId, pageId);
      const prefix = getSectionPrefix(secId, pageId);
      const isLeafRow = secId.length === textParts.length;
      // Rendered once and reused by both views, so a note keeps the same label
      // whether the reader is in single or parallel mode.
      const latinHtml = renderPassageContent(node, isVerseWork, textNotes);

      const isLatentVerseLabel =
        isVerseWork &&
        isLeafRow &&
        verseLineIndex !== 0 &&
        (verseLineIndex + 1) % 5 !== 0;
      const anchorClass = isLatentVerseLabel
        ? "section-anchor latent"
        : "section-anchor";

      if (isLeafRow) {
        citationIds.push(dotId);
        if (isVerseWork) {
          verseLineIndex++;
        }
      }

      const prefixHtml = prefix
        ? `<span class="cite-prefix">${he.escape(prefix)}</span>`
        : "";
      const gutterHtml = isLeafRow
        ? `<div class="reader-gutter"><a href="#sec-${dotId}" class="${anchorClass}">${prefixHtml}<span class="cite-local">${he.escape(
            localId
          )}</span></a></div>`
        : '<div class="reader-gutter"></div>';

      const sectionClass = isVerseWork
        ? "reader-section section-verse"
        : "reader-section";
      const idAttr = isLeafRow ? ` id="sec-${dotId}"` : "";

      singleSectionsHtml.push(
        `<div class="${sectionClass}"${idAttr}>${gutterHtml}<div class="reader-passage">${latinHtml}</div></div>`
      );
    }

    const citationRange: [string, string] = [
      citationIds[0] ?? "",
      citationIds[citationIds.length - 1] ?? "",
    ];

    const transPage = findTranslationPage?.(pageId);
    const translationSectionsHtml =
      translationWork && transPage
        ? renderTranslationSections(
            translationWork,
            transPage,
            translationNotes
          )
        : [];
    let transPageHtml: string | undefined = undefined;
    if (translationSectionsHtml.length > 0) {
      const transNotesHtml =
        translationNotes.collected.length > 0
          ? renderNotesSection(
              [
                {
                  title: "Notes on the translation",
                  notes: translationNotes.collected,
                },
              ],
              "Notes on the translation",
              "reader-trans-notes-heading"
            )
          : undefined;
      transPageHtml = transNotesHtml
        ? `${translationSectionsHtml.join("\n")}\n${transNotesHtml}`
        : translationSectionsHtml.join("\n");
    }

    v2Pages.push({
      id: pageId.join("."),
      title: pageTitle,
      sectionCount: citationIds.length,
      citationRange,
      singleHtml: singleSectionsHtml.join("\n"),
      translationHtml: transPageHtml,
      notesHtml: renderNotesSection([
        { title: "Notes on the text", notes: textNotes.collected },
      ]),
    });
  }

  return {
    id: work.info.workId,
    title: work.info.title,
    shortTitle: work.info.shortTitle,
    author: work.info.author,
    urlAuthor: metadata.urlAuthor,
    urlName: metadata.urlName,
    attribution: work.info.attribution,
    hasMacra: work.info.attribution === "hypotactic",
    hasTranslation: translationWork !== undefined,
    translator: translationWork?.info.translator,
    editor: work.info.editor,
    funder: work.info.funder,
    sponsor: work.info.sponsor,
    sourceRef: work.info.sourceRef,
    ctsUrn: work.info.workId.startsWith("urn:cts:")
      ? work.info.workId
      : undefined,
    license:
      work.info.attribution === "perseus"
        ? "Creative Commons Attribution-ShareAlike 3.0"
        : work.info.attribution === "hypotactic"
        ? "Hypotactic Latin Metron (Public / Educational)"
        : "Public Domain",
    sourceRepo: work.info.sourceRef?.[0],
    textParts,
    paginationDepth,
    navTree: work.navTree,
    tocHtml: preRenderTocItemsHtml({
      pages: v2Pages,
      work: {
        urlAuthor: metadata.urlAuthor,
        urlName: metadata.urlName,
        pages: v2Pages,
        textParts,
        navTree: work.navTree,
      },
    }),
    pages: v2Pages,
  };
}
