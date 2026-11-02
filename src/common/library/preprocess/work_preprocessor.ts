import { assert } from "@/common/assert";
import type {
  CitationStyle,
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import { BLOCK_CONTENT_KINDS } from "@/common/library/process_work";
import {
  formatRomanLawGutter,
  formatSectionPath,
} from "@/common/library/section_labels";
import { areArraysEqual } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { preRenderTocItemsHtml } from "@/web/ui/reader/reader_toc.server";
import * as he from "he";

function formatPageTitle(
  pageId: string[],
  textParts: string[],
  citationStyle?: CitationStyle
): string {
  if (pageId.length === 0) return "Preface";
  return formatSectionPath(textParts, pageId, citationStyle);
}

/**
 * The title of a page holding a run of lines, e.g. `Lines 1–414`, from the
 * local ids of its citable rows; `undefined` if it has none.
 */
function formatLineRangeTitle(lineIds: string[]): string | undefined {
  const first = lineIds[0];
  const last = lineIds[lineIds.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return first === last ? `Line ${first}` : `Lines ${first}–${last}`;
}

/**
 * Whether a row's root is a heading, a spacer, a speaker label or a stage
 * direction, which carry no citation.
 */
function isHeadingOrSpacerRow(node: XmlNode): boolean {
  const kind = node.getAttr("kind");
  return (
    node.name === "head" ||
    node.name === "space" ||
    node.getAttr("sectionHead") === "1" ||
    kind === "speaker" ||
    kind === "stage"
  );
}

/**
 * A verse line number: the range of integers it covers and whatever follows
 * them, e.g. `293b` -> `[293, 293, "b"]`, Plautus' merged `159_160` ->
 * `[159, 160, ""]`, his fragment `1034_frg1` -> `[1034, 1034, "_frg1"]` and
 * Seneca's transposed `1018a1019b` -> `[1018, 1018, "a1019b"]`; `undefined`
 * for an id that does not start with a number (`pr`).
 */
function parseLineNumber(
  localId: string
): [number, number, string] | undefined {
  const match = /^(\d+)(?:_(\d+))?(.*)$/.exec(localId);
  if (match === null) {
    return undefined;
  }
  const first = Number(match[1]);
  const last = match[2] === undefined ? first : Number(match[2]);
  return last < first ? undefined : [first, last, match[3]];
}

/** Whether a line numbered `first`..`last` holds line 1 or a multiple of 5. */
function coversCountedLine(first: number, last: number): boolean {
  return first === 1 || Math.floor(last / 5) > Math.floor((first - 1) / 5);
}

/**
 * Decides which verse line numbers show in the gutter (the rest are latent,
 * shown on hover): the first line of a page, then every fifth line.
 *
 * Every fifth line is read off the line number itself where there is one
 * (`5`, `10`, ...), so a page that opens mid-count (a Plautus scene starting
 * at line 153) still numbers 155, 160. A line without a numeric id falls back
 * to counting lines (the fifth, tenth, ... on the page).
 *
 * The continuation of a line split between speakers (`<l part="M|F">`, or a
 * suffixed id with the same number as the line before, like `293b` after
 * `293`) never shows a number and is not counted: it is the same verse.
 */
class VerseLineNumbering {
  #counted = 0;
  #previousId: string | undefined = undefined;
  #previousBase: number | undefined = undefined;

  /** Whether the line `localId` (whose content is `node`) shows its number. */
  shows(localId: string, node: XmlNode): boolean {
    const parsed = parseLineNumber(localId);
    // A line in several rows (split around a block) is numbered once.
    const isContinuation =
      localId === this.#previousId ||
      node.getAttr("linePart") !== undefined ||
      (parsed !== undefined &&
        parsed[2] !== "" &&
        parsed[0] === this.#previousBase);
    this.#previousId = localId;
    this.#previousBase = parsed?.[1];
    if (isContinuation) {
      return false;
    }
    const index = this.#counted++;
    if (index === 0) {
      return true;
    }
    return parsed === undefined
      ? (index + 1) % 5 === 0
      : parsed[2] === "" && coversCountedLine(parsed[0], parsed[1]);
  }
}

/**
 * The index of the row that cites a page whose leaf sits above full depth,
 * such as Jerome's Letter 44, which has no sections: `undefined` unless the
 * page has no row deeper than its own id.
 *
 * That row is the first one with the page's id that is not a heading or a
 * spacer. Only one row gets the citation, so its DOM id stays unique.
 */
function findShallowLeafRow(
  rows: ProcessedWork2["rows"],
  page: ProcessedPage,
  textParts: string[]
): number | undefined {
  const pageId = page.id;
  if (pageId.length === 0 || pageId.length >= textParts.length) {
    return undefined;
  }
  const [start, end] = page.rows;
  let leafRow: number | undefined = undefined;
  for (let j = start; j < end; j++) {
    const [secId, node] = rows[j];
    if (secId.length > pageId.length) {
      return undefined;
    }
    if (
      leafRow === undefined &&
      areArraysEqual(secId, pageId) &&
      !isHeadingOrSpacerRow(node)
    ) {
      leafRow = j;
    }
  }
  return leafRow;
}

function getSectionLocalId(secId: string[], pageId: string[]): string {
  const localTokens = secId.slice(pageId.length);
  return localTokens.length > 0
    ? localTokens.join(".")
    : secId[secId.length - 1] ?? "";
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

/** Whether `node` renders as a marker with no text of its own. */
function isMarker(node: XmlNode): boolean {
  return MARKER_TAGS.has(node.name) || node.getAttr("kind") === "tei-space";
}

/**
 * Whether `node` renders as inline text, as opposed to a marker or a line,
 * block, heading or list element, which break words on their own.
 */
function isInlineTextElement(node: XmlNode): boolean {
  const rends = rendClasses(node);
  return !(
    isMarker(node) ||
    BLOCK_CONTENT_KINDS.has(node.getAttr("kind") ?? "") ||
    node.name === "head" ||
    node.name === "ul" ||
    node.name === "li" ||
    node.getAttr("l") !== undefined ||
    node.getAttr("block") !== undefined ||
    node.getAttr("sectionHead") !== undefined ||
    rends.has("blockquote") ||
    rends.has("indent") ||
    rends.has("center")
  );
}

/** The text `node` renders, excluding marker elements. */
function inlineText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  if (isMarker(node)) {
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
  const nextRend = next.getAttr("rend");
  if (
    next.name === "sub" ||
    next.name === "sup" ||
    (nextRend !== undefined &&
      (nextRend.includes("superscript") ||
        nextRend.includes("sup") ||
        nextRend.includes("super") ||
        nextRend.includes("subscript")))
  ) {
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

/**
 * The element and class of each content `kind` (see `ContentKind` in
 * `process_work.ts`). A speaker or stage direction that is a row of its own
 * is a `<div>`; inside a row (a speech quoted in a prose section) it is a
 * `<span>` that the stylesheet sets as a block, since a prose row is a `<p>`.
 */
const KIND_HTML: Readonly<
  Record<string, { tag: "span" | "div"; className: string }>
> = {
  speaker: { tag: "span", className: "reader-speaker" },
  "speaker-inline": { tag: "span", className: "reader-speaker-inline" },
  stage: { tag: "span", className: "reader-stage" },
  "cast-list": { tag: "div", className: "reader-cast-list" },
  "cast-person": { tag: "div", className: "reader-cast-person" },
  "role-name": { tag: "span", className: "reader-role-name italic" },
  unclear: { tag: "span", className: "reader-unclear" },
};

/**
 * Renders a content node as reader HTML.
 *
 * @param isVerseWork Whether the node belongs to a verse work. There, a node
 * that came from a TEI `<p>`/`<ab>` (`para="1"`) renders as a paragraph, so
 * that a prose preface is not set as a verse line. Outside verse works the
 * row is already wrapped in a paragraph and `para` changes nothing.
 * @param isRowRoot Whether the node is a row's root, so its own block.
 * @param rowClass An extra class for a row's root (see `AntilabeSteps`).
 */
function renderXmlNodeCleanHtml(
  node: XmlNode | string,
  notes?: NoteCollector,
  isVerseWork = false,
  isRowRoot = false,
  rowClass?: string
): string {
  if (typeof node === "string") {
    return he.escape(node);
  }

  const tag = node.name;
  const rends = rendClasses(node);
  const isLine = node.getAttr("l") === "1";
  const isSectionHead = node.getAttr("sectionHead") === "1";
  const noteId = node.getAttr("noteId");
  const kind = node.getAttr("kind");

  if (tag === "br") {
    return "<br>";
  }
  if (tag === "space") {
    return '<span class="line-space" aria-hidden="true"></span>';
  }
  if (tag === "gap") {
    return '<span class="reader-gap text-muted" data-no-tokenize="true">[gap]</span>';
  }
  if (kind === "tei-space") {
    // A blank in the manuscript, inside a verse line.
    return '<span class="tei-space italic text-muted" data-no-tokenize="true">[space]</span>';
  }
  if (tag === "note" && noteId !== undefined) {
    return renderNoteMarker(noteId, notes);
  }

  // A paragraph cannot hold another, so only the outermost `para` node in a
  // verse work becomes one.
  const wantsVersePara = isVerseWork && !isLine && node.getAttr("para") === "1";
  const childrenHtml = node.children
    .map((child, i) => {
      const previous = node.children[i - 1];
      const html = renderXmlNodeCleanHtml(
        child,
        notes,
        isVerseWork && !wantsVersePara
      );
      return child instanceof XmlNode &&
        previous instanceof XmlNode &&
        needsWordBreak(previous, child)
        ? ` ${html}`
        : html;
    })
    .join("");

  // An empty paragraph would add a blank block to the page, so it renders as
  // before (nothing of its own).
  const isVersePara = wantsVersePara && childrenHtml.trim() !== "";
  const isBlock = node.getAttr("block") === "1" || isVersePara;
  const isSmallcapsEditorial =
    kind === "editorial" && node.getAttr("style") === "smallcaps";
  // Editorial matter inside a row (a letter's dateline, or a Roman-law jurist
  // inscription) looks like the text around it but is not tokenized for lookup,
  // as the corpus does not index it. A whole editorial row is marked by
  // `markUntokenizedRow` instead.
  const noTokenize =
    (kind === "editorial" && !isRowRoot) || isSmallcapsEditorial
      ? ' data-no-tokenize="true"'
      : "";

  if (tag === "head" || isSectionHead) {
    return `<h3 class="reader-subheading"${noTokenize}>${childrenHtml}</h3>`;
  }
  if (tag === "ul") {
    return `<ul class="reader-list">${childrenHtml}</ul>`;
  }
  if (tag === "li") {
    return `<li>${childrenHtml}</li>`;
  }
  const kindHtml = kind === undefined ? undefined : KIND_HTML[kind];
  if (kindHtml !== undefined) {
    const kindTag =
      isRowRoot && (kind === "speaker" || kind === "stage")
        ? "div"
        : kindHtml.tag;
    const kindClass =
      rowClass === undefined
        ? kindHtml.className
        : `${kindHtml.className} ${rowClass}`;
    return `<${kindTag} class="${kindClass}">${childrenHtml}</${kindTag}>`;
  }

  // Handle attributes and renditions
  const classes: string[] = [];
  if (isSmallcapsEditorial) {
    classes.push("reader-editorial-smallcaps");
  }
  if (isLine) classes.push("reader-line");
  if (isBlock) classes.push("reader-block");
  if (rends.has("italic")) classes.push("italic");
  if (rends.has("bold")) classes.push("bold");
  if (rends.has("center")) classes.push("center");
  if (rends.has("blockquote")) classes.push("blockquote");
  if (rends.has("sup") || rends.has("superscript")) {
    classes.push("superscript");
  }
  // Perseus marks the inscriptional and legal quotations that other editions
  // set in small caps with a bare `rend="7"`.
  if (rends.has("smallcaps") || rends.has("7")) classes.push("smallcaps");
  if (rends.has("uppercase")) classes.push("uppercase");
  if (rends.has("overline")) classes.push("overline");
  // The medial and final parts of a verse line split between speakers
  // (`<l part="M|F">`) are indented, to show they continue the line.
  const isLinePart = isLine && node.getAttr("linePart") !== undefined;
  if (rends.has("indent") || isLinePart) {
    classes.push("indent");
    // Inside a paragraph an indent opens the paragraph, so only the first line
    // moves; anywhere else (verse, above all) the whole block shifts. Mirrors
    // the textIndent / paddingLeft split in `reader.tsx`.
    if (node.getAttr("rendParent") === "p") classes.push("indent-para");
  }
  // In a verse work the parts of a split line step across the page
  // (`AntilabeSteps`). A verse quotation in prose keeps the plain indent.
  if (rowClass !== undefined) {
    classes.push(rowClass);
  }

  const classAttr =
    (classes.length > 0 ? ` class="${classes.join(" ")}"` : "") + noTokenize;

  // Subscripts (only emitted in notes) use the native element, which needs
  // no stylesheet support.
  if (rends.has("subscript") && !isLine && !isBlock) {
    return `<sub${classAttr}>${childrenHtml}</sub>`;
  }

  if (tag === "b") {
    return `<strong${classAttr}>${childrenHtml}</strong>`;
  }

  if (isLine) {
    return `<span${classAttr}>${childrenHtml}</span>`;
  }
  if (isBlock) {
    return `<p${classAttr}>${childrenHtml}</p>`;
  }
  if (classes.length === 0 && noTokenize === "") {
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
  notes?: NoteCollector,
  rowClass?: string
): string {
  const html = wrapPassageHtml(
    renderXmlNodeCleanHtml(node, notes, isVerseWork, true, rowClass),
    isVerseWork
  );
  return node.getAttr("kind") === "editorial" &&
    node.getAttr("style") !== "smallcaps"
    ? markUntokenizedRow(html)
    : html;
}

/**
 * Marks a whole row of editorial matter (a list of sigla, an English heading)
 * as not tokenized for lookup, as the corpus does not index it either
 * (`UNTOKENIZED_CONTENT_KINDS`). The wrapper has no class or style, so the
 * row looks as it did; it only carries `data-no-tokenize`, which the reader's
 * tokenizer skips along with everything inside.
 */
function markUntokenizedRow(html: string): string {
  return `<div data-no-tokenize="true">${html}</div>`;
}

/** The most steps a split line's parts are indented across the page. */
const MAX_ANTILABE_STEP = 6;

/**
 * The staircase of a verse line split between speakers (antilabe), as in a
 * printed edition: each medial or final part (`linePart`) is indented one
 * step further than the part before it, so it starts about where that part
 * ended, and the speaker label over a part is indented with it.
 *
 * `classFor` is called on a page's rows in order and returns the step class
 * (`reader-step-N`) for a row, if any. A whole line, or the first part of a
 * split one, resets the staircase. Only rows that are a verse line or a
 * speaker label get a class.
 */
class AntilabeSteps {
  #step = 0;
  readonly #rows: ProcessedWork2["rows"];

  constructor(rows: ProcessedWork2["rows"]) {
    this.#rows = rows;
  }

  classFor(index: number): string | undefined {
    const node = this.#rows[index][1];
    if (node.getAttr("l") === "1") {
      if (node.getAttr("linePart") === undefined) {
        this.#step = 0;
        return undefined;
      }
      this.#step = Math.min(this.#step + 1, MAX_ANTILABE_STEP);
      return `reader-step-${this.#step}`;
    }
    if (node.getAttr("kind") !== "speaker") {
      return undefined;
    }
    // The speaker of a part sits over it: look ahead to the speech's first
    // line, past any stage direction.
    for (let j = index + 1; j < this.#rows.length; j++) {
      const next = this.#rows[j][1];
      if (next.getAttr("kind") === "stage") {
        continue;
      }
      if (next.getAttr("l") !== "1" || next.getAttr("linePart") === undefined) {
        return undefined;
      }
      return `reader-step-${Math.min(this.#step + 1, MAX_ANTILABE_STEP)}`;
    }
    return undefined;
  }
}

/** Wraps a row's rendered HTML in a verse line or prose paragraph. */
function wrapPassageHtml(rendered: string, isVerseWork: boolean): string {
  const trimmed = rendered.trimStart();
  // A block of its own: a speaker label, a stage direction or a cast list.
  if (trimmed.startsWith('<div class="reader-')) {
    return rendered;
  }
  if (isVerseWork) {
    // Matches `reader-line` with or without trailing rendition classes, so an
    // indented pentameter is not wrapped in a second, redundant line span.
    // A row holding a paragraph (a prose preface in a verse work) is prose,
    // and a `<p>` inside a `<span>` would be invalid anyway. Hypotactic rows
    // (`<span meter>`) hold no paragraph, so they still get their line here.
    if (
      trimmed.startsWith('<span class="reader-line') ||
      trimmed.startsWith("<h") ||
      trimmed.startsWith('<span class="line-space"') ||
      rendered.includes('<p class="reader-block')
    ) {
      return rendered;
    }
    return `<span class="reader-line">${rendered}</span>`;
  }
  // For prose, if it's not already wrapped in a paragraph or block, wrap in paragraph
  if (
    trimmed.startsWith("<p") ||
    trimmed.startsWith("<h") ||
    trimmed.startsWith("<ul") ||
    rendered.includes('<p class="reader-block')
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

/** canonical-latinLit's repository licence (its `license.md`). */
const PERSEUS_REPO_LICENCE =
  "Available under a Creative Commons Attribution-ShareAlike 4.0 International License";

/**
 * The licence line for a Perseus text: the file's own `<licence>` statement,
 * else the repository's. CC BY-SA asks adapters to say they changed the work,
 * and we patch typos and normalise markup, so the line says so.
 */
function perseusLicence(fileLicence: string | undefined): string {
  const statement = (fileLicence ?? PERSEUS_REPO_LICENCE).replace(/\.$/, "");
  return `${statement}. The text may have been modified from the original.`;
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
  const citationStyle = work.info.citationStyle;
  const isVerseWork =
    textParts.length > 0 &&
    textParts[textParts.length - 1].toLowerCase() === "line";
  const paginationDepth =
    work.pages[0]?.id.length ??
    (textParts.length > 1 ? textParts.length - 1 : 1);

  const findTranslationPage = translationWork
    ? createTranslationPageMatcher(work.info.workId, translationWork)
    : undefined;

  // A work cited by line alone is one page (see `divideWork`), titled by its
  // line range in both the page header and the table of contents.
  const isLineOnly = textParts.length === 1 && textParts[0] === "line";
  const tocLabels = new Map<string, string>();

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
    const [startIdx, endIdx] = page.rows;
    const shallowLeafRow = findShallowLeafRow(work.rows, page, textParts);

    const singleSectionsHtml: string[] = [];
    const citationIds: string[] = [];
    const citationLocalIds: string[] = [];
    const usedAnchorIds = new Set<string>();
    const textNotes = createNoteCollector(work.notes, "n", "numeric");
    const translationNotes = createNoteCollector(
      translationWork?.notes,
      "t",
      "alpha"
    );

    const lineNumbering = new VerseLineNumbering();
    const antilabe = new AntilabeSteps(work.rows.slice(startIdx, endIdx));

    for (let j = startIdx; j < endIdx; j++) {
      const [secId, node] = work.rows[j];
      const { dotId, localId, prefix, aliasIds } = formatRomanLawGutter(
        secId,
        pageId,
        citationStyle,
        textParts
      );
      const isFullDepthLeaf = secId.length === textParts.length;
      const isRomanLawLeaf =
        citationStyle === "roman_law" &&
        secId.length > pageId.length &&
        !isHeadingOrSpacerRow(node);
      const isLeafRow =
        isFullDepthLeaf || isRomanLawLeaf || j === shallowLeafRow;
      // Rendered once and reused by both views, so a note keeps the same label
      // whether the reader is in single or parallel mode.
      const latinHtml = renderPassageContent(
        node,
        isVerseWork,
        textNotes,
        isVerseWork ? antilabe.classFor(j - startIdx) : undefined
      );

      // A shallow leaf (a preface or a letter with no sections) is not a verse
      // line, so its label always shows and it does not count towards the
      // every-fifth-line numbering. Nor is a cited prose paragraph (Rule F in
      // `cite_structure.ts`: Ausonius' prose letters, cited `pr.1`, `pr.2`).
      const isLatentVerseLabel =
        isVerseWork &&
        isFullDepthLeaf &&
        isLeafRow &&
        node.getAttr("para") !== "1" &&
        !lineNumbering.shows(localId, node);
      const anchorClass = isLatentVerseLabel
        ? "section-anchor latent"
        : "section-anchor";

      const extraAnchorSpans: string[] = [];
      if (isLeafRow) {
        usedAnchorIds.add(dotId);
        citationIds.push(dotId);
        citationLocalIds.push(localId);
        for (const aliasId of aliasIds) {
          if (!usedAnchorIds.has(aliasId)) {
            usedAnchorIds.add(aliasId);
            extraAnchorSpans.push(
              `<span id="sec-${he.escape(aliasId)}"></span>`
            );
          }
        }
      }

      const prefixHtml = prefix
        ? `<span class="cite-prefix">${he.escape(prefix)}</span>`
        : "";
      const gutterHtml = isLeafRow
        ? `<div class="reader-gutter">${extraAnchorSpans.join(
            ""
          )}<a href="#sec-${dotId}" class="${anchorClass}">${prefixHtml}<span class="cite-local">${he.escape(
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
    // Set after the rows, since a line-only work's title names its line range.
    const pageTitle =
      isLineOnly && pageId.length === textParts.length
        ? formatLineRangeTitle(citationLocalIds) ??
          formatPageTitle(pageId, textParts, citationStyle)
        : formatPageTitle(pageId, textParts, citationStyle);
    if (isLineOnly) {
      tocLabels.set(dotPageId, pageTitle);
    }

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
        ? perseusLicence(work.info.licence)
        : work.info.attribution === "hypotactic"
        ? "Hypotactic Latin Metron (Public / Educational)"
        : work.info.attribution === "theLatinLibrary"
        ? "Presented as public domain by The Latin Library"
        : "Public Domain",
    sourceRepo: work.info.sourceRef?.[0],
    textParts,
    paginationDepth,
    citationStyle,
    navTree: work.navTree,
    tocHtml: preRenderTocItemsHtml({
      pages: v2Pages,
      work: {
        urlAuthor: metadata.urlAuthor,
        urlName: metadata.urlName,
        pages: v2Pages,
        textParts,
        navTree: work.navTree,
        citationStyle,
      },
      nodeLabels: tocLabels,
    }),
    pages: v2Pages,
  };
}
