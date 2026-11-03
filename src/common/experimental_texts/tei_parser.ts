/**
 * Best-effort TEI parsing for Experimental Texts.
 *
 * Unlike the Library pipeline (`src/common/library/`), this parser never
 * rejects a document: it keeps whatever text it can find, derives pages from
 * `<pb>` when present, and records oddities as warnings instead of failing.
 * It must stay runnable in the browser, since works are parsed on the reader's
 * device.
 *
 * Tuned first for the Patrologia Latina (OGL `patrologia_latina-dev`), whose
 * TEI is machine-corrected OCR:
 * - `<pb n>` marks a Migne column (or, in some volumes, a two-column page).
 * - `<milestone unit="PLSection" n="A|B|C|D"/>` marks the section letters
 *   within a column; letters restart for each column, so `529A`…`529D`,
 *   `530A`… are derived by watching for the letter to go backwards.
 * - Words broken across lines keep their hyphen (`-` or a soft hyphen) before
 *   `<lb/>`, and are rejoined.
 * - Footnotes (`<note>`) sit in the reading flow where the OCR met them, often
 *   mid-sentence; they are lifted out into the page's note list.
 */

import { parseXmlRootWithDomParser } from "@/common/xml/dom_xml_parser";
import type {
  ExperimentalTextBlock,
  ExperimentalTextBlockKind,
  ExperimentalTextDocument,
  ExperimentalTextNote,
  ExperimentalTextPage,
  ExperimentalTextRun,
  ExperimentalTextSectionMarker,
  ExperimentalTextSegment,
  ExperimentalTextStyle,
} from "@/common/experimental_texts/experimental_text_document";

/** Target page size (in characters) when the source has no page breaks. */
const DEFAULT_CHUNK_CHARS = 6000;

const SOFT_HYPHEN = "\u00ad";
/** A word fragment ending in a line-break hyphen (`-` needs a letter first). */
const HARD_HYPHEN_END = /\p{L}-\s*$/u;
const SOFT_HYPHEN_END = /\u00ad\s*$/;
const ANY_HYPHEN_END = /(?:(?<=\p{L})-|\u00ad)\s*$/u;
/**
 * A line-break hyphen the OCR kept without an `<lb/>`: a letter, a hyphen,
 * whitespace, then a lowercase letter (`ser- mone`). Hyphenated compounds
 * don't have the space, so this is safe to rejoin.
 */
const SPACED_HYPHEN_INSIDE = /(\p{L})-\s+(?=\p{Ll})/gu;
const SPACED_HYPHEN_END = /\p{L}-\s+$/u;
const STARTS_LOWERCASE = /^\s*\p{Ll}/u;

/** Elements whose content is irrelevant to reading. */
const SKIPPED = new Set(["teiHeader", "figure", "graphic", "figDesc", "gap"]);

/** Containers that end any open block but otherwise just hold content. */
const CONTAINERS = new Set([
  "TEI",
  "TEI.2",
  "text",
  "body",
  "front",
  "back",
  "group",
  "div",
  "div1",
  "div2",
  "div3",
  "div4",
  "div5",
  "list",
  "opener",
  "closer",
  "sp",
]);

/** Block elements that become a paragraph each. */
const PARAGRAPHS = new Set([
  "p",
  "item",
  "salute",
  "signed",
  "dateline",
  "byline",
]);

/** Inline elements whose text is kept as-is. */
const TRANSPARENT = new Set([
  "title",
  "persName",
  "name",
  "placeName",
  "orgName",
  "unclear",
  "seg",
  "quote",
  "q",
  "said",
  "num",
  "date",
  "w",
  "emph",
  "term",
  "ref",
  "bibl",
  "cit",
  "sic",
  "corr",
  "choice",
  "orig",
  "reg",
  "add",
  "del",
  "abbr",
  "expan",
  "speaker",
  "label",
  "supplied",
  "surplus",
]);

interface InlineContext {
  style?: ExperimentalTextStyle;
  lang?: string;
}

export interface ParseTeiOptions {
  /** Page size for sources without `<pb>`. */
  chunkChars?: number;
}

function isElement(node: Node | undefined): node is Element {
  return node !== undefined && node.nodeType === 1;
}

function isTextNode(node: Node): boolean {
  return node.nodeType === 3 || node.nodeType === 4;
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

function attr(node: Element, name: string): string | undefined {
  return node.getAttribute(name) ?? undefined;
}

function sameInline(
  a: ExperimentalTextRun,
  style?: ExperimentalTextStyle,
  lang?: string
) {
  return a.lang === lang && JSON.stringify(a.style) === JSON.stringify(style);
}

function styleFromRend(rend: string | undefined): ExperimentalTextStyle {
  const style: ExperimentalTextStyle = {};
  const value = (rend ?? "").toLowerCase();
  if (value.includes("ital")) style.italic = true;
  if (value.includes("bold")) style.bold = true;
  if (/sm\w*cap/.test(value)) style.smallCaps = true;
  if (value.includes("sup")) style.superscript = true;
  if (value.includes("subscript")) style.subscript = true;
  return style;
}

function isRun(segment: unknown): segment is ExperimentalTextRun {
  return (
    typeof segment === "object" &&
    segment !== null &&
    "kind" in segment &&
    segment.kind === "text"
  );
}

function mergeStyle(
  base: ExperimentalTextStyle | undefined,
  extra: ExperimentalTextStyle
): ExperimentalTextStyle | undefined {
  const merged = { ...base, ...extra };
  return Object.keys(merged).length === 0 ? undefined : merged;
}

/** Where the source broke a printed line (`<lb/>`), kept until `finish`. */
interface LineBreakMark {
  kind: "lineBreak";
}

type BufferSegment = ExperimentalTextSegment | LineBreakMark;

/**
 * When a paragraph's printed lines are treated as verse: enough of them, most
 * starting with a capital, none too long for a verse line, and few words
 * hyphenated across them (prose wraps mid-word; verse rarely does).
 */
const VERSE_MIN_LINES = 5;
const VERSE_MIN_UPPERCASE_SHARE = 0.85;
const VERSE_MAX_LINE_CHARS = 90;
const VERSE_MAX_JOIN_SHARE = 0.1;

/** Concatenates adjacent runs with the same styling. */
function mergeRuns(
  segments: ExperimentalTextSegment[]
): ExperimentalTextSegment[] {
  const result: ExperimentalTextSegment[] = [];
  for (const segment of segments) {
    const tail = result[result.length - 1];
    if (
      segment.kind === "text" &&
      tail?.kind === "text" &&
      sameInline(tail, segment.style, segment.lang)
    ) {
      tail.text += segment.text;
    } else {
      result.push(segment.kind === "text" ? { ...segment } : segment);
    }
  }
  return result;
}

/** Trims a segment list's ends and drops empty runs. */
function trimSegments(
  segments: ExperimentalTextSegment[]
): ExperimentalTextSegment[] {
  const runs = segments.filter(
    (s): s is ExperimentalTextRun => s.kind === "text"
  );
  if (runs.length > 0) {
    runs[0].text = runs[0].text.trimStart();
    const last = runs[runs.length - 1];
    last.text = last.text.replace(/\u00ad/g, "").trimEnd();
  }
  return segments.filter((s) => s.kind !== "text" || s.text.length > 0);
}

/**
 * Accumulates the inline content of one block (or note): collapses
 * whitespace, and rejoins words hyphenated across line breaks, moving any
 * section marker that fell inside the word to just before it.
 */
class SegmentBuffer {
  readonly segments: BufferSegment[] = [];
  private pendingLineBreak = false;
  private joinNext = false;
  /** Words rejoined across a line break so far. */
  private lineJoins = 0;
  /** Whitespace seen right after a `word-`, held back in case it rejoins. */
  private hyphenSpace = false;

  private lastRunIndex(): number {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      if (this.segments[i].kind === "text") return i;
    }
    return -1;
  }

  private lastRun(): ExperimentalTextRun | undefined {
    const i = this.lastRunIndex();
    const segment = this.segments[i];
    return isRun(segment) ? segment : undefined;
  }

  /** Whether the content so far ends in a hyphenated word fragment. */
  endsWithHyphen(): boolean {
    return ANY_HYPHEN_END.test(this.lastRun()?.text ?? "");
  }

  hasText(): boolean {
    return this.segments.some(
      (s) => s.kind === "text" && s.text.trim().length > 0
    );
  }

  /** The section markers collected so far. */
  markers(): ExperimentalTextSectionMarker[] {
    return this.segments.filter(
      (s): s is ExperimentalTextSectionMarker => s.kind === "section"
    );
  }

  lineBreak() {
    this.pendingLineBreak = true;
  }

  addMarker(marker: ExperimentalTextSectionMarker) {
    this.segments.push(marker);
  }

  /**
   * Removes and returns a trailing hyphenated word fragment (without its
   * hyphen), so a word split across a page break can be finished on the next
   * page.
   */
  takeDanglingFragment(): ExperimentalTextRun | undefined {
    const i = this.lastRunIndex();
    const run = this.segments[i];
    if (
      !isRun(run) ||
      i !== this.segments.length - 1 ||
      !this.endsWithHyphen()
    ) {
      return undefined;
    }
    const stripped = run.text.replace(ANY_HYPHEN_END, "");
    const match = /^([\s\S]*\s)?(\S*)$/.exec(stripped);
    const prefix = match?.[1] ?? "";
    const fragment = match?.[2] ?? "";
    if (fragment.length === 0) return undefined;
    run.text = prefix;
    if (prefix.length === 0) this.segments.splice(i, 1);
    return { ...run, text: fragment };
  }

  /** Starts with a fragment carried over from the previous page. */
  seedFragment(run: ExperimentalTextRun) {
    this.segments.push(run);
    this.joinNext = true;
  }

  /** Strips the hyphen from the last run and glues the next text to it. */
  private joinHyphenated() {
    const i = this.lastRunIndex();
    const run = this.segments[i];
    if (!isRun(run)) return;
    run.text = run.text.replace(ANY_HYPHEN_END, "");
    // The word continues, so the line breaks after it don't count.
    const markers = this.segments
      .splice(i + 1)
      .filter((s) => s.kind === "section");
    if (markers.length === 0) return;
    // Markers fell inside the word: move the fragment after them, so the
    // marker sits before the whole word.
    const match = /^([\s\S]*\s)?(\S*)$/.exec(run.text);
    const fragment = match?.[2] ?? "";
    run.text = match?.[1] ?? "";
    if (run.text.length === 0) this.segments.splice(i, 1);
    this.segments.push(...markers);
    if (fragment.length > 0) this.segments.push({ ...run, text: fragment });
  }

  appendText(raw: string, ctx: InlineContext) {
    let text = raw
      .replace(/\u00ad(?=\S)/g, "")
      .replace(/\u00ad\s+(?=\S)/g, "")
      .replace(SPACED_HYPHEN_INSIDE, "$1")
      .replace(/\s+/g, " ");
    const blank = text.trim().length === 0;
    const last = this.lastRun()?.text ?? "";
    if (blank && HARD_HYPHEN_END.test(last)) {
      // `pro-` + space: wait to see whether the next word continues it.
      this.hyphenSpace = this.hyphenSpace || text.length > 0;
      return;
    }
    const spaced =
      SPACED_HYPHEN_END.test(last) ||
      (HARD_HYPHEN_END.test(last) && (this.hyphenSpace || /^\s/.test(text)));
    const wantsJoin =
      this.joinNext ||
      SOFT_HYPHEN_END.test(last) ||
      (this.pendingLineBreak && HARD_HYPHEN_END.test(last)) ||
      (spaced && STARTS_LOWERCASE.test(text));
    if (blank && (wantsJoin || this.pendingLineBreak)) {
      // Whitespace between a line break and the next word carries nothing.
      return;
    }
    if (!wantsJoin && this.hyphenSpace && !/^\s/.test(text)) {
      text = " " + text;
    }
    this.hyphenSpace = false;
    if (wantsJoin) {
      if (this.pendingLineBreak) this.lineJoins += 1;
      this.joinHyphenated();
      text = text.trimStart();
    } else if (this.pendingLineBreak && this.hasText()) {
      this.segments.push({ kind: "lineBreak" });
      text = text.trimStart();
    }
    this.joinNext = false;
    this.pendingLineBreak = false;
    this.pushRun(text, ctx);
  }

  private pushRun(text: string, ctx: InlineContext) {
    const tail = this.segments[this.segments.length - 1];
    const previousText = this.lastRun()?.text ?? "";
    if (/\s$/.test(previousText) || this.segments.length === 0) {
      text = text.replace(/^\s+/, "");
    }
    if (text.length === 0) return;
    if (tail?.kind === "text" && sameInline(tail, ctx.style, ctx.lang)) {
      tail.text += text;
      return;
    }
    const run: ExperimentalTextRun = { kind: "text", text };
    if (ctx.style !== undefined) run.style = ctx.style;
    if (ctx.lang !== undefined) run.lang = ctx.lang;
    this.segments.push(run);
  }

  /** The content split at the source's line breaks. */
  private lines(): ExperimentalTextSegment[][] {
    const lines: ExperimentalTextSegment[][] = [[]];
    for (const segment of this.segments) {
      if (segment.kind === "lineBreak") lines.push([]);
      else lines[lines.length - 1].push(segment);
    }
    // A marker just before a line break belongs to the next line.
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      let cut = line.length;
      while (cut > 0 && line[cut - 1].kind === "section") cut--;
      lines[i + 1].unshift(...line.splice(cut));
    }
    return lines
      .map((line) => trimSegments(mergeRuns(line)))
      .filter((line) => line.some((s) => s.kind === "text"));
  }

  /**
   * The content as verse lines, if it looks like verse (see
   * `VERSE_MIN_LINES` and friends). Prose lines mostly start mid-sentence, in
   * lowercase, and often end mid-word.
   */
  verseLines(): ExperimentalTextSegment[][] | undefined {
    const lines = this.lines();
    if (lines.length < VERSE_MIN_LINES) return undefined;
    if (this.lineJoins > lines.length * VERSE_MAX_JOIN_SHARE) return undefined;
    const lengths = lines.map((line) =>
      line.reduce((n, s) => n + (s.kind === "text" ? s.text.length : 0), 0)
    );
    if (Math.max(...lengths) > VERSE_MAX_LINE_CHARS) return undefined;
    const uppercase = lines.filter((line) => {
      const first = line.find(
        (s): s is ExperimentalTextRun => s.kind === "text"
      );
      const letter = /\p{L}/u.exec(first?.text ?? "")?.[0] ?? "";
      return letter.length > 0 && letter === letter.toUpperCase();
    }).length;
    return uppercase / lines.length >= VERSE_MIN_UPPERCASE_SHARE
      ? lines
      : undefined;
  }

  /** The cleaned-up segments, with line breaks turned into spaces. */
  finish(): ExperimentalTextSegment[] {
    const flat: ExperimentalTextSegment[] = [];
    let lastTextRun: ExperimentalTextRun | undefined;
    let spaceNeeded = false;
    for (const segment of this.segments) {
      if (segment.kind === "lineBreak") {
        spaceNeeded = true;
        continue;
      }
      if (segment.kind === "text") {
        const nextRun =
          spaceNeeded && lastTextRun && !/\s$/.test(lastTextRun.text)
            ? { ...segment, text: " " + segment.text.trimStart() }
            : segment;
        flat.push(nextRun);
        lastTextRun = nextRun;
        spaceNeeded = false;
        continue;
      }
      flat.push(segment);
    }
    return trimSegments(mergeRuns(flat));
  }
}

interface PendingPage {
  /** The raw `<pb n>` value; undefined until the first page break. */
  n?: string;
  blocks: ExperimentalTextBlock[];
  /** Notes, each with the number of blocks that preceded it. */
  notes: { note: ExperimentalTextNote; afterBlock: number }[];
  /** How many columns past `n` the section letters have advanced. */
  columnOffset: number;
  /** Section markers, labelled once the page's column range is known. */
  markers: {
    segment: ExperimentalTextSectionMarker;
    letter: string;
    offset: number;
  }[];
}

function newPage(n?: string): PendingPage {
  return { n, blocks: [], notes: [], columnOffset: 0, markers: [] };
}

/** Builds pages and blocks as the TEI tree is walked in document order. */
class DocumentBuilder {
  private readonly finished: PendingPage[] = [];
  private page: PendingPage = newPage();
  private block?: {
    kind: ExperimentalTextBlockKind;
    buffer: SegmentBuffer;
    continued?: true;
    stanzaStart?: true;
  };
  private pendingMarkers: ExperimentalTextSectionMarker[] = [];
  private previousLetter?: string;
  private stanzaPending = false;
  sawPageBreak = false;

  openBlock(kind: ExperimentalTextBlockKind) {
    this.closeBlock();
    this.block = { kind, buffer: new SegmentBuffer() };
    if (kind === "line" && this.stanzaPending) {
      this.block.stanzaStart = true;
      this.stanzaPending = false;
    }
    for (const marker of this.pendingMarkers) {
      this.block.buffer.addMarker(marker);
    }
    this.pendingMarkers = [];
  }

  closeBlock() {
    const block = this.block;
    this.block = undefined;
    if (block === undefined || !block.buffer.hasText()) {
      // Keep markers from an empty block for the next one.
      this.pendingMarkers.push(...(block?.buffer.markers() ?? []));
      return;
    }
    const verse =
      block.kind === "paragraph" ? block.buffer.verseLines() : undefined;
    if (verse !== undefined) {
      verse.forEach((segments, i) => {
        const line: ExperimentalTextBlock = { kind: "line", segments };
        if (i === 0) {
          line.stanzaStart = true;
          if (block.continued) line.continued = true;
        }
        this.page.blocks.push(line);
      });
      return;
    }
    const result: ExperimentalTextBlock = {
      kind: block.kind,
      segments: block.buffer.finish(),
    };
    if (block.continued) result.continued = true;
    if (block.stanzaStart) result.stanzaStart = true;
    this.page.blocks.push(result);
  }

  startStanza() {
    this.closeBlock();
    this.stanzaPending = true;
  }

  text(raw: string, ctx: InlineContext) {
    if (this.block === undefined) {
      if (raw.trim().length === 0) return;
      this.openBlock("paragraph");
    }
    this.block!.buffer.appendText(raw, ctx);
  }

  lineBreak() {
    this.block?.buffer.lineBreak();
  }

  /** A Migne section letter (or any other milestone label). */
  section(raw: string, unit?: string) {
    const letter = raw.trim().toUpperCase();
    if (letter.length === 0) return;
    const isLetter = unit === "PLSection" && /^[A-H]$/.test(letter);
    if (
      isLetter &&
      this.previousLetter !== undefined &&
      letter < this.previousLetter
    ) {
      this.page.columnOffset += 1;
    }
    const marker: ExperimentalTextSectionMarker = {
      kind: "section",
      label: letter,
    };
    if (isLetter) {
      this.previousLetter = letter;
      this.page.markers.push({
        segment: marker,
        letter,
        offset: this.page.columnOffset,
      });
    }
    if (this.block === undefined) {
      this.pendingMarkers.push(marker);
    } else {
      this.block.buffer.addMarker(marker);
    }
  }

  pageBreak(n: string) {
    this.sawPageBreak = true;
    if (this.page.n === undefined) {
      // Content before the first break belongs to the first column.
      this.page.n = n;
      return;
    }
    this.previousLetter = undefined;
    const open = this.block;
    const fragment = open?.buffer.takeDanglingFragment();
    this.closeBlock();
    this.finished.push(this.page);
    this.page = newPage(n);
    if (open !== undefined) {
      this.openBlock(open.kind);
      this.block!.continued = true;
      if (fragment !== undefined) this.block!.buffer.seedFragment(fragment);
    }
  }

  note(segments: ExperimentalTextSegment[]) {
    if (segments.length === 0) return;
    const notes = this.page.notes;
    const previous = notes[notes.length - 1]?.note;
    if (previous !== undefined && noteEndsHyphenated(previous)) {
      // A footnote continued past a column break: rejoin the split word.
      const run = previous.segments[previous.segments.length - 1];
      if (!isRun(run)) return;
      run.text = run.text.replace(ANY_HYPHEN_END, "");
      const [first, ...rest] = segments;
      if (first.kind === "text" && sameInline(run, first.style, first.lang)) {
        run.text += first.text;
        previous.segments.push(...rest);
      } else {
        previous.segments.push(...segments);
      }
      return;
    }
    notes.push({ note: { segments }, afterBlock: this.page.blocks.length });
  }

  finish(): PendingPage[] {
    this.closeBlock();
    this.finished.push(this.page);
    this.finished.forEach((page) => joinHyphenatedLines(page.blocks));
    return this.finished;
  }
}

/**
 * Verse-like `<l>` lines in the OCR sometimes split a word across lines
 * (`sacerdoti-` / `bus qui…`). Moves the fragment down to finish the word.
 */
function joinHyphenatedLines(blocks: ExperimentalTextBlock[]) {
  for (let i = 1; i < blocks.length; i++) {
    const [previous, current] = [blocks[i - 1], blocks[i]];
    if (previous.kind !== "line" || current.kind !== "line") continue;
    const tail = previous.segments[previous.segments.length - 1];
    const head = current.segments.find(
      (s): s is ExperimentalTextRun => s.kind === "text"
    );
    if (tail?.kind !== "text" || head === undefined) continue;
    if (!/\p{L}-$/u.test(tail.text) || !STARTS_LOWERCASE.test(head.text)) {
      continue;
    }
    const match = /^([\s\S]*\s)?(\S+)-$/.exec(tail.text);
    if (match === null) continue;
    tail.text = (match[1] ?? "").trimEnd();
    head.text = match[2] + head.text;
    if (tail.text.length === 0) previous.segments.pop();
  }
}

function noteEndsHyphenated(note: ExperimentalTextNote): boolean {
  const last = note.segments[note.segments.length - 1];
  return last?.kind === "text" && /(?:\p{L}-|\u00ad)$/u.test(last.text);
}

function collectNote(
  node: Element,
  ctx: InlineContext
): ExperimentalTextSegment[] {
  const buffer = new SegmentBuffer();
  const walkNote = (el: Element, inner: InlineContext) => {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (isTextNode(child)) {
        buffer.appendText(child.nodeValue ?? "", inner);
        continue;
      }
      if (!isElement(child)) continue;
      const name = localName(child.tagName);
      if (SKIPPED.has(name) || name === "pb" || name === "milestone") continue;
      if (name === "lb") {
        buffer.lineBreak();
      } else if (name === "hi") {
        walkNote(child, {
          ...inner,
          style: mergeStyle(inner.style, styleFromRend(attr(child, "rend"))),
        });
      } else if (name === "foreign") {
        walkNote(child, {
          ...inner,
          lang: attr(child, "xml:lang") ?? inner.lang,
        });
      } else {
        // Paragraphs and lines inside a note are run together.
        if (name === "p" || name === "l") buffer.lineBreak();
        walkNote(child, inner);
      }
    }
  };
  walkNote(node, ctx);
  // Notes keep a trailing hyphen so a continuation can be rejoined.
  const keepHyphen = buffer.endsWithHyphen();
  const segments = buffer.finish();
  const last = segments[segments.length - 1];
  if (keepHyphen && last?.kind === "text" && !/[-\u00ad]$/.test(last.text)) {
    last.text += SOFT_HYPHEN;
  }
  return segments;
}

function isNoteElement(child: Node | undefined): boolean {
  return isElement(child) && localName(child.tagName) === "note";
}

/** The nearest non-whitespace sibling in direction `step` (+1 or -1). */
function neighbor(
  children: ArrayLike<Node>,
  index: number,
  step: number
): Node | undefined {
  for (let i = index + step; i >= 0 && i < children.length; i += step) {
    const child = children[i];
    if (isTextNode(child)) {
      if ((child.nodeValue ?? "").trim().length === 0) continue;
      return child;
    }
    if (isElement(child)) return child;
  }
  return undefined;
}

class TeiWalker {
  readonly unhandled = new Map<string, number>();
  constructor(private readonly builder: DocumentBuilder) {}

  walkChildren(node: Element, ctx: InlineContext) {
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (isTextNode(child)) {
        this.builder.text(child.nodeValue ?? "", ctx);
        continue;
      }
      if (!isElement(child)) continue;
      if (
        localName(child.tagName) === "milestone" &&
        isNoteElement(neighbor(children, i, -1)) &&
        isNoteElement(neighbor(children, i, 1))
      ) {
        // A section letter printed in the footnote area, between notes.
        continue;
      }
      this.visit(child, ctx);
    }
  }

  private visit(node: Element, ctx: InlineContext) {
    const name = localName(node.tagName);
    const b = this.builder;
    if (SKIPPED.has(name)) return;
    if (CONTAINERS.has(name)) {
      b.closeBlock();
      this.walkChildren(node, ctx);
      b.closeBlock();
      return;
    }
    switch (name) {
      case "head":
        this.block("heading", node, ctx);
        return;
      case "ab":
        this.block(isTitleOnly(node) ? "heading" : "paragraph", node, ctx);
        return;
      case "lg":
        b.startStanza();
        this.walkChildren(node, ctx);
        b.closeBlock();
        return;
      case "l":
        this.block("line", node, ctx);
        return;
      case "note":
        b.note(collectNote(node, ctx));
        return;
      case "pb":
        b.pageBreak((attr(node, "n") ?? "").trim());
        return;
      case "cb":
        return;
      case "milestone":
        b.section(attr(node, "n") ?? "", attr(node, "unit"));
        return;
      case "lb":
        b.lineBreak();
        return;
      case "hi":
        this.walkChildren(node, {
          ...ctx,
          style: mergeStyle(ctx.style, styleFromRend(attr(node, "rend"))),
        });
        return;
      case "foreign":
        this.walkChildren(node, {
          ...ctx,
          lang: attr(node, "xml:lang") ?? ctx.lang,
        });
        return;
    }
    if (PARAGRAPHS.has(name)) {
      this.block("paragraph", node, ctx);
      return;
    }
    if (!TRANSPARENT.has(name)) {
      this.unhandled.set(name, (this.unhandled.get(name) ?? 0) + 1);
    }
    this.walkChildren(node, ctx);
  }

  private block(
    kind: ExperimentalTextBlockKind,
    node: Element,
    ctx: InlineContext
  ) {
    this.builder.openBlock(kind);
    this.walkChildren(node, ctx);
    this.builder.closeBlock();
  }
}

/** An `<ab>` holding only `<title>`s, which PL uses for headings. */
function isTitleOnly(node: Element): boolean {
  let sawTitle = false;
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (isTextNode(child)) {
      if ((child.nodeValue ?? "").trim().length > 0) return false;
      continue;
    }
    if (!isElement(child)) continue;
    if (localName(child.tagName) !== "title") return false;
    sawTitle = true;
  }
  return sawTitle;
}

function plainText(node: Element): string {
  const parts: string[] = [];
  const walk = (el: Element) => {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (isTextNode(child)) {
        const val = child.nodeValue ?? "";
        if (val.length > 0) parts.push(val);
      } else if (isElement(child) && localName(child.tagName) !== "note") {
        walk(child);
      }
    }
  };
  walk(node);
  return parts
    .join(" ")
    .replace(/\u00ad\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findFirst(
  root: Element,
  predicate: (node: Element) => boolean
): Element | undefined {
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (!isElement(child)) continue;
    if (predicate(child)) return child;
    const found = findFirst(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findMetadata(root: Element) {
  const header = findFirst(root, (n) => localName(n.tagName) === "teiHeader");
  const body = findFirst(root, (n) => localName(n.tagName) === "body");
  const edition =
    body &&
    findFirst(
      body,
      (n) => localName(n.tagName) === "div" && attr(n, "type") === "edition"
    );
  const mainTitle =
    body &&
    findFirst(
      body,
      (n) => localName(n.tagName) === "title" && attr(n, "type") === "main"
    );
  const head =
    (edition ?? body) &&
    findFirst(edition ?? body!, (n) => localName(n.tagName) === "head");
  const headerTitle =
    header && findFirst(header, (n) => localName(n.tagName) === "title");
  const author =
    header && findFirst(header, (n) => localName(n.tagName) === "author");
  const title =
    [mainTitle, head, headerTitle]
      .map((n) => (n ? plainText(n) : ""))
      .find((t) => t.length > 0) ?? "Untitled";
  const authorText = author ? plainText(author) : "";
  return {
    title,
    author: authorText.length > 0 ? authorText : undefined,
    urn: edition ? attr(edition, "n") : undefined,
  };
}

function columnNumber(n: string | undefined): number | undefined {
  if (n === undefined || !/^\d+$/.test(n)) return undefined;
  return Number(n);
}

/**
 * Labels a page and its section markers. Section letters can only advance as
 * many columns as there are between this page break and the next (OCR noise
 * sometimes runs the letters backwards more often than that).
 */
function labelPage(page: PendingPage, next: PendingPage | undefined): string {
  const base = columnNumber(page.n);
  if (base === undefined) {
    return page.n !== undefined && page.n.length > 0
      ? `[${page.n}]`
      : "[unnumbered]";
  }
  const nextBase = columnNumber(next?.n);
  const maxOffset =
    nextBase !== undefined && nextBase > base ? nextBase - base - 1 : 1;
  let highest = 0;
  for (const { segment, letter, offset } of page.markers) {
    const clamped = Math.min(offset, maxOffset);
    highest = Math.max(highest, clamped);
    segment.label = `${base + clamped}${letter}`;
  }
  // A page break every other column means each page spans two columns,
  // even where the OCR lost the section letters.
  if (nextBase === base + 2) highest = 1;
  if (highest === 0) return String(base);
  const end = base + highest;
  if (
    base >= 100 &&
    base % 100 !== 0 &&
    Math.floor(base / 100) === Math.floor(end / 100)
  ) {
    return `${base}–${String(end % 100).padStart(2, "0")}`;
  }
  return `${base}–${end}`;
}

function toPages(pending: PendingPage[]): ExperimentalTextPage[] {
  const seen = new Map<string, number>();
  const pages: ExperimentalTextPage[] = [];
  pending.forEach((page, i) => {
    const label = labelPage(page, pending[i + 1]);
    if (i > 0 && page.blocks.length === 0 && page.notes.length === 0) return;
    const raw = page.n ?? "";
    const base = raw.length > 0 ? raw.replace(/[^\p{L}\p{N}]+/gu, "_") : "page";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    pages.push({
      id: count === 1 ? base : `${base}-${count}`,
      label,
      blocks: page.blocks,
      notes: page.notes.map((n) => n.note),
    });
  });
  return pages;
}

function blockLength(block: ExperimentalTextBlock): number {
  return block.segments.reduce(
    (sum, s) => sum + (s.kind === "text" ? s.text.length : 0),
    0
  );
}

/** Splits a single unpaginated page into pages of roughly `chunkChars`. */
function toChunks(
  page: PendingPage,
  chunkChars: number
): ExperimentalTextPage[] {
  const pages: ExperimentalTextPage[] = [];
  let current: ExperimentalTextPage | undefined;
  let size = 0;
  let noteIndex = 0;
  page.blocks.forEach((block, i) => {
    if (current === undefined || (size >= chunkChars && !block.continued)) {
      const index = pages.length + 1;
      current = {
        id: `${index}`,
        label: `Part ${index}`,
        blocks: [],
        notes: [],
      };
      pages.push(current);
      size = 0;
    }
    while (
      noteIndex < page.notes.length &&
      page.notes[noteIndex].afterBlock <= i
    ) {
      current.notes.push(page.notes[noteIndex++].note);
    }
    current.blocks.push(block);
    size += blockLength(block);
  });
  if (current === undefined) {
    current = { id: "1", label: "Part 1", blocks: [], notes: [] };
    pages.push(current);
  }
  while (noteIndex < page.notes.length) {
    current.notes.push(page.notes[noteIndex++].note);
  }
  return pages;
}

function salvageMalformedTeiXml(
  xml: string,
  err: unknown
): ExperimentalTextDocument {
  const titleMatch = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(xml);
  const authorMatch = /<author(?:\s[^>]*)?>([\s\S]*?)<\/author>/i.exec(xml);
  const title =
    titleMatch?.[1]
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled";
  const authorText =
    authorMatch?.[1]
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "";
  const withoutHeader = xml
    .replace(/<teiHeader[\s\S]*?<\/teiHeader>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const rawParagraphs = withoutHeader
    .split(/<\/?(?:p|head|ab|div|l)\b[^>]*>/i)
    .map((chunk) =>
      chunk
        .replace(/<[^>]*>/g, " ")
        .replace(/\u00ad\s*/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((chunk) => chunk.length > 0);
  const blocks: ExperimentalTextBlock[] = rawParagraphs.map((text) => ({
    kind: "paragraph",
    segments: [{ kind: "text", text }],
  }));
  const reason = err instanceof Error ? err.message : String(err);
  return {
    title,
    ...(authorText.length > 0 ? { author: authorText } : {}),
    pagination: "chunks",
    pages: [{ id: "1", label: "Part 1", blocks, notes: [] }],
    warnings: [`Malformed XML: ${reason}`],
  };
}

/** Parses a TEI document leniently into pages for best-effort reading. */
export function parseTeiDocument(
  xml: string,
  options?: ParseTeiOptions
): ExperimentalTextDocument {
  let root: Element;
  try {
    root = parseXmlRootWithDomParser(xml);
  } catch (err) {
    return salvageMalformedTeiXml(xml, err);
  }
  const builder = new DocumentBuilder();
  const walker = new TeiWalker(builder);
  const text = findFirst(root, (n) => localName(n.tagName) === "text") ?? root;
  walker.walkChildren(text, {});
  const pending = builder.finish();

  const pagination = builder.sawPageBreak ? "pageBreaks" : "chunks";
  const pages =
    pagination === "pageBreaks"
      ? toPages(pending)
      : toChunks(pending[0], options?.chunkChars ?? DEFAULT_CHUNK_CHARS);

  const warnings = [...walker.unhandled.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `Unhandled element <${name}> (${count}×)`);
  return { ...findMetadata(root), pagination, pages, warnings };
}
