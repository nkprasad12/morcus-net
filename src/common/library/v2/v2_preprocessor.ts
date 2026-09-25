import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import { XmlNode } from "@/common/xml/xml_node";
import * as he from "he";

function formatPartCoordinate(partName: string, value: string): string {
  const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
  return `${capitalized} ${value}`;
}

export function formatPageTitle(pageId: string[], textParts: string[]): string {
  if (pageId.length === 0) return "Preface";
  const parts: string[] = [];
  for (let i = 0; i < pageId.length; i++) {
    const partName = textParts[i] ?? `Level ${i + 1}`;
    parts.push(formatPartCoordinate(partName, pageId[i]));
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

function renderXmlNodeCleanHtml(
  node: XmlNode | string,
  notes?: NoteCollector
): string {
  if (typeof node === "string") {
    return he.escape(node);
  }

  const tag = node.name;
  const rend = node.getAttr("rend");
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
    .map((child) => renderXmlNodeCleanHtml(child, notes))
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
  if (rend === "italic") classes.push("italic");
  if (rend === "bold") classes.push("bold");
  if (rend === "blockquote") classes.push("blockquote");
  if (rend === "sup" || rend === "superscript") classes.push("superscript");
  // Perseus marks the inscriptional and legal quotations that other editions
  // set in small caps with a bare `rend="7"`.
  if (rend === "smallcaps" || rend === "7") classes.push("smallcaps");
  if (rend === "uppercase") classes.push("uppercase");
  if (rend === "overline") classes.push("overline");
  if (rend === "indent") {
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
  const rendered = renderXmlNodeCleanHtml(node, notes);
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
          `<li class="reader-note" id="${note.bodyId}">
            <a class="reader-note-backref" href="#${note.refId}" role="doc-backlink" aria-label="Back to note ${note.label} in the text">[${note.label}]</a>
            <div class="reader-note-body">${note.bodyHtml}</div>
          </li>`
      )
      .join("\n");
    return `${heading}<ol class="reader-notes-list">${items}</ol>`;
  });
  return `<aside class="reader-notes" role="doc-endnotes" aria-labelledby="${headingId}">
      <h2 class="reader-notes-heading" id="${headingId}">${he.escape(
    mainHeading
  )}</h2>
      ${sections.join("\n")}
    </aside>`;
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

  // Index translation rows if available
  const translationRowsByDotId = new Map<
    string,
    XmlNode<ProcessedWorkContentNodeType>
  >();
  if (translationWork) {
    for (const [tId, tNode] of translationWork.rows) {
      translationRowsByDotId.set(tId.join("."), tNode);
    }
  }

  const v2Pages: V2PreprocessedPage[] = [];

  for (const page of work.pages) {
    const pageId = page.id;
    const pageTitle = formatPageTitle(pageId, textParts);
    const [startIdx, endIdx] = page.rows;

    const singleSectionsHtml: string[] = [];
    const translationSectionsHtml: string[] = [];
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

      const gutterHtml = isLeafRow
        ? `
        <div class="reader-gutter">
          <a href="#sec-${dotId}"
             class="${anchorClass}"
             title="Citation § ${dotId} (Click to copy anchor)"
             aria-label="Section ${dotId}">
            <span class="cite-prefix">${he.escape(
              prefix
            )}</span><span class="cite-local">${he.escape(localId)}</span>
          </a>
        </div>
      `.trim()
        : '<div class="reader-gutter"></div>';

      const sectionClass = isVerseWork
        ? "reader-section section-verse"
        : "reader-section";
      const idAttr = isLeafRow ? ` id="sec-${dotId}"` : "";

      singleSectionsHtml.push(
        `
        <div class="${sectionClass}"${idAttr}>
          ${gutterHtml}
          <div class="reader-passage" data-tokenize-target="true">
            ${latinHtml}
          </div>
        </div>
      `.trim()
      );

      // Check for matching translation
      if (translationWork) {
        const transNode = translationRowsByDotId.get(dotId);
        const transHtml = transNode
          ? renderPassageContent(transNode, isVerseWork, translationNotes)
          : "";

        translationSectionsHtml.push(
          `
          <div class="reader-translation-section" id="trans-sec-${dotId}">
            <div class="reader-translation-gutter"><span class="cite-local">${he.escape(
              localId
            )}</span></div>
            <div class="reader-translation-text">${transHtml}</div>
          </div>
        `.trim()
        );
      }
    }

    const citationRange: [string, string] = [
      citationIds[0] ?? "",
      citationIds[citationIds.length - 1] ?? "",
    ];

    let transPageHtml: string | undefined = undefined;
    if (translationWork && translationSectionsHtml.length > 0) {
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
    pages: v2Pages,
  };
}
