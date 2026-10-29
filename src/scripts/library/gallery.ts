/**
 * `./morcus.sh library gallery`: builds an exemplar review gallery across
 * Perseus Latin TEI works (both onboarded `LatinWorks` and, with
 * `--include-candidates`, non-onboarded candidate works that currently pass
 * `processTei2`).
 *
 * Implements Pillar 4 of the Library Expansion Plan (`PLAN.md` §4.3):
 *   1. Human sign-off by markup kind (content elements, note elements,
 *      `element@rend` in body and notes, structural/attribute kinds such as
 *      `l@part="I"|"M"|"F"`, `note@target`, `foreign@xml:lang="grc"|"greek"`,
 *      and complex layout passages such as embedded verse in prose, split
 *      verse lines, and dialogue/speaker labels).
 *   2. Per-work spot-check index (metadata, row/page counts, markup kinds
 *      used, and links/previews for each work's first, middle, and last pages).
 *
 * Writes `<out>/<label>/{gallery.json,gallery.md,index.html}`.
 */

import fs from "fs";
import os from "os";
import path from "path";
import he from "he";

import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import {
  EnglishTranslations,
  LatinWorks,
  resolveWorkIdAlias,
} from "@/common/library/library_constants";
import {
  loadPatches,
  type LibraryPatch,
  type LibraryPatchMap,
} from "@/common/library/library_patches";
import type { ProcessedWork2 } from "@/common/library/library_types";
import { rendTokens } from "@/common/library/perseus_rends";
import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import {
  preprocessPerseusWorks,
  stripXmlProlog,
} from "@/common/library/process_library";
import {
  buildCitationSpine,
  CitationSpine,
} from "@/common/library/cite_structure";
import { isVacuousNote } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  gitShortSha,
  pageFileStem,
  readRenderIndex,
  type RenderIndex,
} from "@/scripts/library/render";
import { surveyFiles } from "@/scripts/library/survey";
import { firstLineOf } from "@/scripts/library/survey_census";

export const GALLERY_OUT_DEFAULT = ".cache/library-gallery";
export const GALLERY_MAX_EXAMPLES_DEFAULT = 3;

export type MarkupCategory =
  | "element"
  | "note-element"
  | "rend"
  | "note-rend"
  | "attr"
  | "layout";

export interface GalleryExemplar {
  workId: string;
  workTitle: string;
  author: string;
  sectionId: string;
  pageId: string;
  readerUrl: string;
  /** Alias for `readerUrl`. */
  url: string;
  teiSnippet: string;
  renderedHtml: string;
  inNote?: boolean;
}

export interface GalleryMarkupKind {
  kind: string;
  category: MarkupCategory;
  workCount: number;
  occurrenceCount: number;
  examples: GalleryExemplar[];
}

export interface GalleryPageSpotCheck {
  role: "first" | "middle" | "last";
  pageId: string;
  title: string;
  sectionCount: number;
  citationRange: [string, string];
  readerUrl: string;
  /** Alias for `readerUrl`. */
  url: string;
  previewHtml: string;
  /** Human-readable slot label (e.g., "OPENING", "FEATURED MARKUP", "STRUCTURAL EDGE", "CLOSING", "MIDPOINT", "MID-PAGE"). */
  label?: string;
  /** Why this window was selected (e.g., "featured: 2 notes + foreign/greek"). */
  reason?: string;
  /** Citation range `[start, end]` of the sliced window on the page. */
  windowRange?: [string, string];
}

export interface GalleryWorkSpotCheck {
  workId: string;
  author: string;
  title: string;
  shortTitle?: string;
  urlAuthor: string;
  urlName: string;
  onboarded: boolean;
  rowCount: number;
  citableRowCount: number;
  pageCount: number;
  textParts: string[];
  markupKinds: string[];
  pages: {
    first?: GalleryPageSpotCheck;
    middle?: GalleryPageSpotCheck;
    last?: GalleryPageSpotCheck;
  };
  spotCheckPages: GalleryPageSpotCheck[];
}

export interface GalleryReport {
  label: string;
  createdAt: string;
  root: string;
  latinLitCommit?: string;
  morcusCommit?: string;
  includeCandidates: boolean;
  maxExamples: number;
  totals: {
    worksProcessed: number;
    onboardedCount: number;
    candidateCount: number;
    failedCount: number;
    markupKindCount: number;
  };
  markupKinds: GalleryMarkupKind[];
  kindsByName: Record<string, GalleryMarkupKind>;
  works: GalleryWorkSpotCheck[];
  failures: Record<string, string>;
}

export interface GalleryWorkInput {
  workId: string;
  rawXml: string;
  onboarded: boolean;
  absPath?: string;
  patches?: LibraryPatch[];
  precomputed?: {
    work: ProcessedWork2;
    v2Work: V2PreprocessedWork;
  };
}

export interface GalleryOptions {
  /** canonical-latinLit checkout (default: `$LIB_XML_ROOT`). */
  root?: string;
  /** Output directory label under `--out` (default: `<latinLit sha>-<morcus sha>`). */
  label?: string;
  /** Output directory root (default: `.cache/library-gallery`). */
  out?: string;
  /** Optional work IDs to include. */
  works?: string[];
  /** Also include non-onboarded Latin works in `--root` that pass `processTei2`. */
  includeCandidates?: boolean;
  /** Max exemplar passages per markup kind (default: 3). */
  maxExamples?: number;
  /** Optional patch map override. */
  patches?: LibraryPatchMap;
  /**
   * Optional previous gallery report, directory, or label (under `out`) to
   * compare against and write diff.html.
   */
  compareWith?: string | GalleryReport;
  /**
   * Optional gallery report, directory, or label (under `out`) from before
   * the onboarding. Also writes `<out>/<label>-delta/`: the works onboarded
   * now but not then, and the markup kinds only they exercise.
   */
  deltaFrom?: string | GalleryReport;
  /**
   * Optional `library render` outputs (directories with `index.json`) of the
   * Before and After pipelines, used by the `compareWith` diff to drop
   * exemplars whose reader page is byte-identical in both renders.
   */
  beforeRenderDir?: string;
  afterRenderDir?: string;
  /** Suppress progress output. */
  quiet?: boolean;
}

export interface GalleryResult {
  dir: string;
  report: GalleryReport;
  /** Set when `deltaFrom` was given. */
  deltaDir?: string;
  deltaReport?: GalleryReport;
}

const ONBOARDED_LATIN_WORK_IDS = new Set<string>(Object.values(LatinWorks));
const ENGLISH_TRANSLATION_IDS = new Set<string>(
  Object.values(EnglishTranslations)
);

/** Structural container elements that wrap sections rather than representing content markup. */
const STRUCTURAL_CONTAINER_ELEMENTS = new Set<string>([
  "body",
  "div",
  "div1",
  "div2",
  "div3",
  "#comment",
]);

/** Builds a canonical reader URL path `/work/<urlAuthor>/<urlName>/<pageId>#sec-<sectionId>`. */
export function buildReaderSectionUrl(
  urlAuthor: string,
  urlName: string,
  pageId: string,
  sectionId?: string
): string {
  const base = `/work/${urlAuthor}/${urlName}/${pageId}`;
  return sectionId && sectionId.length > 0 ? `${base}#sec-${sectionId}` : base;
}

function escapeXmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttr(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

/**
 * Ensures a rendered reader HTML fragment cannot inject `<script>` or `</style>`
 * tags into the self-contained gallery document while preserving all reader
 * markup emitted by `work_preprocessor.ts`.
 */
function sanitizeReaderHtmlFragment(html: string): string {
  return html
    .replace(/<(\/?script\b)/gi, "&lt;$1")
    .replace(/<(\/?style\b)/gi, "&lt;$1");
}

/**
 * Scopes all `id="..."`, `href="#..."`, and `aria-labelledby="..."` attributes
 * within a rendered reader preview fragment to a unique card prefix so that
 * `index.html` never repeats HTML IDs across exemplars/spot-checks and
 * in-preview footnote links (`#noteref-n1` ↔ `#note-n1`) jump within the same card.
 */
export function scopePreviewHtmlIds(html: string, prefix: string): string {
  return html
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/\bhref="#([^"]+)"/g, `href="#${prefix}-$1"`)
    .replace(/\baria-labelledby="([^"]+)"/g, `aria-labelledby="${prefix}-$1"`);
}

/**
 * Serializes an `XmlNode` into a compact, single-line TEI XML snippet with
 * properly escaped attributes/text and collapsed whitespace.
 */
export function serializeTeiSnippet(node: XmlNode, maxChars = 280): string {
  const render = (n: XmlNode): string => {
    if (n.name === "#comment") {
      return "";
    }
    const attrs = n.attrs
      .map(([k, v]) => ` ${k}="${escapeXmlAttr(v)}"`)
      .join("");
    if (n.children.length === 0) {
      return `<${n.name}${attrs}/>`;
    }
    const inner = n.children
      .map((c) => (typeof c === "string" ? escapeXmlText(c) : render(c)))
      .join("");
    return `<${n.name}${attrs}>${inner}</${n.name}>`;
  };
  const compact = render(node).replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return compact.slice(0, maxChars) + "…";
}

interface SectionRenderLocation {
  pageId: string;
  sectionId: string;
  rowHtmls: string[];
  pageRowHtmls: string[];
  /** Section id of each row in `pageRowHtmls`, by offset in the page. */
  pageRowSecIds: string[];
  rowOffsetsInPage: number[];
  pageNotesHtml?: string;
}

interface NoteRenderLocation {
  pageId: string;
  sectionId: string;
  sectionHtml: string;
  noteHtml: string;
}

interface IndexedWorkRender {
  bySectionId: Map<string, SectionRenderLocation>;
  orderedLocations: SectionRenderLocation[];
  byNoteId: Map<number, NoteRenderLocation>;
}

function splitPageSectionHtmls(singleHtml: string): string[] {
  if (!singleHtml || singleHtml.trim().length === 0) {
    return [];
  }
  return singleHtml.split(/\n(?=<div class="reader-section)/);
}

/**
 * Extracts top-level `<li class="reader-note" ...>...</li>` items
 * from `notesHtml` using balanced `<li>` / `</li>` tag matching so nested
 * lists inside note bodies cannot truncate a note item.
 */
export function extractNoteListItems(notesHtml: string | undefined): string[] {
  if (!notesHtml) {
    return [];
  }
  const items: string[] = [];
  const startPattern = /<li\b[^>]*\breader-note\b[^>]*>/g;
  const liTagPattern = /<(\/?)li\b[^>]*>/gi;

  let startMatch: RegExpExecArray | null;
  while ((startMatch = startPattern.exec(notesHtml)) !== null) {
    const startIdx = startMatch.index;
    liTagPattern.lastIndex = startIdx;
    let depth = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = liTagPattern.exec(notesHtml)) !== null) {
      const isClosing = tagMatch[1] === "/";
      depth += isClosing ? -1 : 1;
      if (depth === 0) {
        const endIdx = tagMatch.index + tagMatch[0].length;
        items.push(notesHtml.slice(startIdx, endIdx));
        startPattern.lastIndex = endIdx;
        break;
      }
    }
  }
  return items;
}

/**
 * Filters a work page's `notesHtml` to include only the `<li class="reader-note">`
 * items that are actually referenced in `passageHtml` (via `href="#...note-..."`
 * or `data-note-id="..."`), returning a scoped `<aside class="reader-notes">`
 * element or `undefined` if no notes are referenced.
 */
export function filterNotesHtmlToRefs(
  passageHtml: string,
  pageNotesHtml?: string
): string | undefined {
  if (!pageNotesHtml || pageNotesHtml.trim().length === 0) {
    return undefined;
  }

  const referencedIds = new Set<string>();

  // 1. Match href attributes pointing to notes: e.g. href="#note-n1", href="#ex-0-note-n1", etc.
  const hrefRegex = /\bhref="#([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = hrefRegex.exec(passageHtml)) !== null) {
    const rawTarget = match[1];
    referencedIds.add(rawTarget);
    const noteIdx = rawTarget.lastIndexOf("note-");
    if (noteIdx !== -1) {
      const fromNote = rawTarget.slice(noteIdx);
      referencedIds.add(fromNote);
      referencedIds.add(fromNote.slice(5)); // id after 'note-'
    }
  }

  // 2. Match data-note-id attributes
  const dataNoteRegex = /\bdata-note-id="([^"]+)"/g;
  while ((match = dataNoteRegex.exec(passageHtml)) !== null) {
    const noteId = match[1];
    referencedIds.add(noteId);
    referencedIds.add(`note-${noteId}`);
  }

  if (referencedIds.size === 0) {
    return undefined;
  }

  const items = extractNoteListItems(pageNotesHtml);
  if (items.length === 0) {
    return undefined;
  }

  const keptLis: string[] = [];
  for (const item of items) {
    const idMatch = item.match(/\bid="([^"]+)"/);
    if (!idMatch) continue;
    const fullId = idMatch[1];
    const noteIdx = fullId.lastIndexOf("note-");
    const suffix = noteIdx !== -1 ? fullId.slice(noteIdx + 5) : fullId;
    const fromNote = noteIdx !== -1 ? fullId.slice(noteIdx) : `note-${fullId}`;

    if (
      referencedIds.has(fullId) ||
      referencedIds.has(suffix) ||
      referencedIds.has(fromNote)
    ) {
      keptLis.push(item);
    }
  }

  if (keptLis.length === 0) {
    return undefined;
  }

  return `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${keptLis.join(
    "\n"
  )}</ol></aside>`;
}

export const rewriteExemplarIds = scopePreviewHtmlIds;

function collectNoteIdsInRow(node: XmlNode | string, out: number[]): void {
  if (typeof node === "string") {
    return;
  }
  if (node.name === "note") {
    const rawId = node.getAttr("noteId");
    if (rawId !== undefined) {
      const parsed = Number.parseInt(rawId, 10);
      if (Number.isFinite(parsed)) {
        out.push(parsed);
      }
    }
  }
  for (const child of node.children) {
    collectNoteIdsInRow(child, out);
  }
}

function indexWorkRender(
  work: ProcessedWork2,
  v2Work: V2PreprocessedWork
): IndexedWorkRender {
  const bySectionId = new Map<string, SectionRenderLocation>();
  const orderedLocations: SectionRenderLocation[] = [];
  const byNoteId = new Map<number, NoteRenderLocation>();

  for (let p = 0; p < work.pages.length; p++) {
    const workPage = work.pages[p];
    const v2Page = v2Work.pages[p];
    if (!workPage || !v2Page) continue;
    const pageId = Array.isArray(v2Page.id) ? v2Page.id.join(".") : v2Page.id;
    const [startIdx, endIdx] = workPage.rows;
    const pageRowHtmls = splitPageSectionHtmls(v2Page.singleHtml);
    const pageRowSecIds: string[] = [];
    const noteLis = extractNoteListItems(v2Page.notesHtml);
    let pageNoteSeq = 0;

    for (let r = startIdx; r < endIdx; r++) {
      const row = work.rows[r];
      if (!row) continue;
      const [secParts, rowNode] = row;
      const offsetInPage = r - startIdx;
      const rowHtml = pageRowHtmls[offsetInPage] ?? "";
      const rawDotId = secParts.join(".");
      const effectiveSecId =
        rawDotId.length > 0
          ? rawDotId
          : v2Page.citationRange[0] || pageId || "1";
      pageRowSecIds[offsetInPage] = effectiveSecId;

      let loc = bySectionId.get(rawDotId);
      if (!loc) {
        loc = {
          pageId,
          sectionId: effectiveSecId,
          rowHtmls: [],
          pageRowHtmls,
          pageRowSecIds,
          rowOffsetsInPage: [],
          pageNotesHtml: v2Page.notesHtml,
        };
        bySectionId.set(rawDotId, loc);
        orderedLocations.push(loc);
      }
      if (rowHtml.length > 0) {
        loc.rowHtmls.push(rowHtml);
        loc.rowOffsetsInPage.push(offsetInPage);
      }

      const rowNoteIds: number[] = [];
      collectNoteIdsInRow(rowNode, rowNoteIds);
      for (const noteId of rowNoteIds) {
        if (work.notes?.[noteId] === undefined) {
          continue;
        }
        const noteLi = noteLis[pageNoteSeq];
        pageNoteSeq++;
        assert(
          noteLi !== undefined && noteLi.length > 0,
          `Missing rendered <li class="reader-note"> for noteId=${noteId} on page ${pageId} of ${v2Work.id}`
        );
        const noteAsideHtml = `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${noteLi}</ol></aside>`;
        byNoteId.set(noteId, {
          pageId,
          sectionId: effectiveSecId,
          sectionHtml: rowHtml,
          noteHtml: noteAsideHtml,
        });
      }
    }
  }

  return {
    bySectionId,
    orderedLocations,
    byNoteId,
  };
}

function resolveSectionLocation(
  dotSecId: string,
  indexed: IndexedWorkRender
): SectionRenderLocation | undefined {
  const exact = indexed.bySectionId.get(dotSecId);
  if (exact && exact.rowHtmls.length > 0) {
    return exact;
  }
  if (dotSecId.length > 0) {
    const prefix = `${dotSecId}.`;
    for (const [key, loc] of indexed.bySectionId.entries()) {
      if (key.startsWith(prefix) && loc.rowHtmls.length > 0) {
        return loc;
      }
    }
  }
  return undefined;
}

/** Removes all whitespace, so text matching ignores line breaks and spacing. */
function compactText(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * Plain text of a rendered reader row: drops the gutter (citation numbers),
 * footnote-reference markers and tags, then decodes entities.
 */
export function renderedRowText(rowHtml: string): string {
  return he.decode(
    rowHtml
      .replace(/<div class="reader-gutter">[\s\S]*?<\/div>/g, "")
      .replace(/<a class="reader-note-ref"[\s\S]*?<\/a>/g, "")
      .replace(/<[^>]+>/g, "")
  );
}

const ROW_TEXT_CACHE = new WeakMap<string[], string[]>();

function compactRowTexts(pageRowHtmls: string[]): string[] {
  let cached = ROW_TEXT_CACHE.get(pageRowHtmls);
  if (!cached) {
    cached = pageRowHtmls.map((h) => compactText(renderedRowText(h)));
    ROW_TEXT_CACHE.set(pageRowHtmls, cached);
  }
  return cached;
}

/** TEI text of `node`, excluding `<note>` bodies and comments. */
function teiTextWithoutNotes(node: XmlNode): string {
  return node.children
    .map((c) =>
      typeof c === "string"
        ? c
        : c.name === "note" || c.name === "#comment"
        ? ""
        : teiTextWithoutNotes(c)
    )
    .join("");
}

/** First non-blank text node inside `node`, skipping `<note>` bodies. */
function firstTeiTextNode(node: XmlNode | string): string | undefined {
  if (typeof node === "string") {
    return node.trim().length > 0 ? node : undefined;
  }
  if (node.name === "note" || node.name === "#comment") {
    return undefined;
  }
  for (const child of node.children) {
    const found = firstTeiTextNode(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * First non-blank text node after the last node of `ancestors` in document
 * order (outside `<note>` bodies). `ancestors` runs from `<body>` down to the
 * node itself.
 */
function followingTeiTextNode(ancestors: XmlNode[]): string | undefined {
  for (let i = ancestors.length - 1; i >= 1; i--) {
    const parent = ancestors[i - 1];
    const idx = parent.children.indexOf(ancestors[i]);
    for (let j = idx + 1; j < parent.children.length; j++) {
      const found = firstTeiTextNode(parent.children[j]);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/** How many characters of a node's compacted text are matched against rows. */
const ROW_MATCH_CHARS = 40;

/**
 * The text used to find the rendered row of a TEI node: its whole text when
 * short (labels, heads), else its first text node, so the needle cannot span
 * a row break.
 */
function rowMatchNeedle(node: XmlNode): string {
  const whole = compactText(teiTextWithoutNotes(node));
  if (whole.length <= 2 * ROW_MATCH_CHARS) {
    return whole.slice(0, ROW_MATCH_CHARS);
  }
  return compactText(firstTeiTextNode(node) ?? "").slice(0, ROW_MATCH_CHARS);
}

function isContiguous(offsets: number[]): boolean {
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] !== offsets[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

function hasNonWhitespaceContent(node: XmlNode): boolean {
  return node.children.some(
    (child) => typeof child !== "string" || child.trim().length > 0
  );
}

interface DetachedNotesIndex {
  byTarget: Map<string, XmlNode>;
  detachedNodes: Set<XmlNode>;
}

function collectDetachedNotes(body: XmlNode): DetachedNotesIndex {
  const referencedTargets = new Set<string>();
  const byTarget = new Map<string, XmlNode>();
  const detachedNodes = new Set<XmlNode>();
  const xmlIdCandidates: Array<{ node: XmlNode; xmlId: string; norm: string }> =
    [];

  const scanTargetsAndXmlIds = (node: XmlNode) => {
    for (const child of node.children) {
      if (typeof child === "string") continue;
      if (child.name === "note") {
        const target = child.getAttr("target");
        if (target !== undefined) {
          referencedTargets.add(target);
          referencedTargets.add(target.replace(/^#/, ""));
        }
        const xmlId = child.getAttr("xml:id");
        if (xmlId !== undefined) {
          const norm = xmlId.replace(/^#/, "");
          xmlIdCandidates.push({ node: child, xmlId, norm });
          continue;
        }
      }
      scanTargetsAndXmlIds(child);
    }
  };
  scanTargetsAndXmlIds(body);

  // A `<note xml:id>` is a detached body only if some `<note target>` names it;
  // otherwise it is an ordinary inline note where it stands (Columella, Florus,
  // Apuleius' Metamorphoses, Ovid's Ex Ponto).
  for (const { node, xmlId, norm } of xmlIdCandidates) {
    if (referencedTargets.has(norm) || referencedTargets.has(xmlId)) {
      byTarget.set(xmlId, node);
      byTarget.set(norm, node);
      byTarget.set(`#${norm}`, node);
      detachedNodes.add(node);
    }
  }

  const walkForN = (node: XmlNode) => {
    for (const child of node.children) {
      if (typeof child === "string") continue;
      if (child.name === "note") {
        if (detachedNodes.has(child)) {
          continue;
        }
        const nAttr = child.getAttr("n");
        if (
          nAttr !== undefined &&
          child.getAttr("target") === undefined &&
          hasNonWhitespaceContent(child)
        ) {
          const norm = nAttr.replace(/^#/, "");
          if (referencedTargets.has(norm) && !byTarget.has(norm)) {
            byTarget.set(norm, child);
            byTarget.set(`#${norm}`, child);
            detachedNodes.add(child);
            continue;
          }
        }
      }
      walkForN(child);
    }
  };
  walkForN(body);
  return { byTarget, detachedNodes };
}

interface WorkKindAccumulator {
  category: MarkupCategory;
  occurrences: number;
  candidates: GalleryExemplar[];
  sameSectionFallbacks: GalleryExemplar[];
}

export interface AnalyzedWorkGallery {
  spotCheck: GalleryWorkSpotCheck;
  kinds: Map<string, WorkKindAccumulator>;
}

function markGalleryTargetRow(rowHtml: string): string {
  return rowHtml.replace(
    /^<div class="reader-section\b/,
    '<div class="reader-section gallery-target'
  );
}

function joinPassageAndNotesHtml(
  passageHtml: string,
  notesHtml?: string
): string {
  return notesHtml && notesHtml.length > 0
    ? `${passageHtml}\n${notesHtml}`
    : passageHtml;
}

function isHeadingOnlySection(secHtml: string): boolean {
  return (
    secHtml.includes("reader-subheading") && !secHtml.includes("cite-local")
  );
}

function extractSectionRowSecId(rowHtml: string): string | undefined {
  const m = /^<div class="reader-section(?:\s+[^"]*)?"\s+id="sec-([^"]+)"/.exec(
    rowHtml.trim()
  );
  return m?.[1];
}

interface RowFeatureProfile {
  isHeadingOnly: boolean;
  hasSubheading: boolean;
  hasVerse: boolean;
  hasProse: boolean;
  hasSplitIndent: boolean;
  hasBlockquote: boolean;
  hasList: boolean;
  hasForeign: boolean;
  noteCount: number;
  hasSpeakerLabel: boolean;
  hasStyledSpan: boolean;
}

function profileSectionRow(sec: string): RowFeatureProfile {
  return {
    isHeadingOnly: isHeadingOnlySection(sec),
    hasSubheading: /\bclass="[^"]*\breader-subheading\b/.test(sec),
    hasVerse: /\bclass="[^"]*\breader-line\b/.test(sec),
    hasProse: /\bclass="[^"]*\b(?:reader-block|reader-paragraph)\b/.test(sec),
    hasSplitIndent:
      /\bclass="[^"]*\b(?:reader-line\s+indent|indent\s+reader-line|line-indent)\b/.test(
        sec
      ),
    hasBlockquote: /\bclass="[^"]*\bblockquote\b/.test(sec),
    hasList: /\bclass="[^"]*\breader-list\b/.test(sec),
    hasForeign:
      /\bclass="[^"]*\bforeign\b|\blang="(?:el|grc)"|[\u0370-\u03FF\u1F00-\u1FFF]/.test(
        sec
      ),
    noteCount: (sec.match(/\bclass="reader-note-ref"/g) ?? []).length,
    hasSpeakerLabel: /<strong\b/.test(sec),
    hasStyledSpan:
      /\bclass="[^"]*\b(?:italic|smallcaps|bold|uppercase|overline|superscript|reader-gap)\b|<sub\b/.test(
        sec
      ),
  };
}

interface SpotWindowCandidate {
  pageIdx: number;
  pageId: string;
  startCit: number;
  endCit: number;
  firstSecIdx: number;
  lastSecIdx: number;
  score: number;
  categories: string[];
  tags: string[];
}

function scoreSectionSlice(
  profiles: RowFeatureProfile[],
  firstSecIdx: number,
  lastSecIdx: number,
  isOpeningTop: boolean
): { score: number; categories: string[]; tags: string[] } {
  let hasSubheading = false;
  let hasVerseRow = false;
  let hasProseOnlyRow = false;
  let hasVerseOnlyRow = false;
  let hasProseRow = false;
  let hasSplitIndent = false;
  let hasBlockquote = false;
  let hasList = false;
  let hasForeign = false;
  let noteCount = 0;
  let hasSpeakerLabel = false;
  let hasStyledSpan = false;
  let featuredRowCount = 0;

  const rowHasFeature = (p: RowFeatureProfile, isFirstTopRow: boolean) =>
    (p.hasSubheading && !isFirstTopRow) ||
    p.hasSplitIndent ||
    p.hasBlockquote ||
    p.hasList ||
    p.hasForeign ||
    p.noteCount > 0 ||
    p.hasSpeakerLabel ||
    p.hasStyledSpan;

  for (let i = firstSecIdx; i <= lastSecIdx; i++) {
    const p = profiles[i];
    if (p.hasSubheading) hasSubheading = true;
    if (p.hasVerse) hasVerseRow = true;
    if (p.hasProse) hasProseRow = true;
    if (p.hasProse && !p.hasVerse) hasProseOnlyRow = true;
    if (p.hasVerse && !p.hasProse) hasVerseOnlyRow = true;
    if (p.hasSplitIndent) hasSplitIndent = true;
    if (p.hasBlockquote) hasBlockquote = true;
    if (p.hasList) hasList = true;
    if (p.hasForeign) hasForeign = true;
    noteCount += p.noteCount;
    if (p.hasSpeakerLabel) hasSpeakerLabel = true;
    if (p.hasStyledSpan) hasStyledSpan = true;
    if (rowHasFeature(p, isOpeningTop && i === firstSecIdx)) {
      featuredRowCount++;
    }
  }

  let score = 0;
  const categories: string[] = [];
  const tags: string[] = [];

  if (hasVerseRow && hasProseRow && (hasProseOnlyRow || hasVerseOnlyRow)) {
    score += 6;
    categories.push("mixed");
    tags.push("mixed verse+prose");
  }
  if (hasSplitIndent) {
    score += 5;
    categories.push("indent");
    tags.push("split/indented line");
  }
  if (hasBlockquote || hasList) {
    score += 4;
    categories.push("block");
    tags.push(
      hasBlockquote && hasList
        ? "blockquote+list"
        : hasBlockquote
        ? "blockquote"
        : "list"
    );
  }
  if (hasForeign) {
    score += 4;
    categories.push("foreign");
    tags.push("foreign/greek");
  }
  if (noteCount > 0) {
    score += Math.min(5, 3 + (noteCount - 1));
    categories.push("notes");
    tags.push(noteCount === 1 ? "1 note" : `${noteCount} notes`);
  }
  const countSubheading = hasSubheading && !isOpeningTop;
  if (countSubheading || hasSpeakerLabel) {
    score += 3;
    categories.push("heading");
    tags.push(
      countSubheading && hasSpeakerLabel
        ? "subheading+label"
        : countSubheading
        ? "subheading"
        : "speaker/label"
    );
  }
  if (hasStyledSpan) {
    score += 2;
    categories.push("styled");
    tags.push("styled spans");
  }
  if (categories.length >= 2) {
    score += 2 * categories.length;
  }
  if (score > 0) {
    score += featuredRowCount;
    if (rowHasFeature(profiles[firstSecIdx], isOpeningTop)) {
      score += 1;
    }
  }

  return { score, categories, tags };
}

function buildSpotCheckWindow(
  v2Work: V2PreprocessedWork,
  page: V2PreprocessedPage,
  sections: string[],
  citableIndices: number[],
  role: "first" | "middle" | "last",
  startCit: number,
  maxPreviewSections: number,
  label: string,
  reason?: string
): GalleryPageSpotCheck {
  const pageId = Array.isArray(page.id) ? page.id.join(".") : page.id;
  let keptSections: string[];
  let windowRange: [string, string] = [
    page.citationRange[0],
    page.citationRange[1],
  ];
  let effectiveStartCit = 0;

  if (citableIndices.length === 0) {
    keptSections = sections.slice(0, maxPreviewSections);
  } else {
    effectiveStartCit = Math.max(
      0,
      Math.min(startCit, citableIndices.length - 1)
    );
    const endCit = Math.min(
      citableIndices.length - 1,
      effectiveStartCit + maxPreviewSections - 1
    );
    let firstSecIdx = citableIndices[effectiveStartCit];
    while (firstSecIdx > 0 && isHeadingOnlySection(sections[firstSecIdx - 1])) {
      firstSecIdx--;
    }
    const lastSecIdx = citableIndices[endCit];
    keptSections = sections.slice(firstSecIdx, lastSecIdx + 1);

    const citableIds = keptSections
      .filter((s) => !isHeadingOnlySection(s))
      .map((s) => extractSectionRowSecId(s))
      .filter((id): id is string => Boolean(id && id.length > 0));
    if (citableIds.length > 0) {
      windowRange = [citableIds[0], citableIds[citableIds.length - 1]];
    }
  }

  const baseReaderUrl = `/work/${v2Work.urlAuthor}/${v2Work.urlName}/${pageId}`;
  const readerUrl =
    effectiveStartCit > 0 && windowRange[0]
      ? `${baseReaderUrl}#sec-${windowRange[0]}`
      : baseReaderUrl;
  const previewSections = keptSections.join("\n");
  const filteredNotes = filterNotesHtmlToRefs(previewSections, page.notesHtml);
  const previewHtml = joinPassageAndNotesHtml(previewSections, filteredNotes);

  return {
    role,
    pageId,
    title: page.title,
    sectionCount: page.sectionCount,
    citationRange: page.citationRange,
    readerUrl,
    url: readerUrl,
    previewHtml,
    label,
    reason,
    windowRange,
  };
}

function isBoundaryPageId(pageId: string): boolean {
  return pageId.split(".").some((seg) => /^[a-zA-Z]+$/.test(seg));
}

/**
 * Selects up to 3 non-overlapping, high-signal spot-check windows for a work:
 * - Slot 1 (`first` / `OPENING`): first `maxPreviewSections` citable rows of page 0.
 * - Slot 2 (`middle` / `FEATURED MARKUP` or `MIDPOINT`/`MID-PAGE`): highest-scoring
 *   non-overlapping window of `maxPreviewSections` citable rows across all pages.
 * - Slot 3 (`last` / `STRUCTURAL EDGE`, `FEATURED MARKUP`, or `CLOSING`): a
 *   non-overlapping structural boundary page, a window exercising unseen feature
 *   categories, or the last `maxPreviewSections` citable rows of the final page.
 */
export function selectWorkSpotChecks(
  v2Work: V2PreprocessedWork,
  maxPreviewSections = 5
): {
  first?: GalleryPageSpotCheck;
  middle?: GalleryPageSpotCheck;
  last?: GalleryPageSpotCheck;
  spotCheckPages: GalleryPageSpotCheck[];
} {
  const pages = v2Work.pages;
  if (pages.length === 0) {
    return { spotCheckPages: [] };
  }

  const parsedPages = pages.map((page, pageIdx) => {
    const pageId = Array.isArray(page.id) ? page.id.join(".") : page.id;
    const sections = splitPageSectionHtmls(page.singleHtml);
    const profiles = sections.map(profileSectionRow);
    const citableIndices: number[] = [];
    for (let i = 0; i < profiles.length; i++) {
      if (!profiles[i].isHeadingOnly) {
        citableIndices.push(i);
      }
    }
    const candidates: SpotWindowCandidate[] = [];
    const maxStart = Math.max(0, citableIndices.length - maxPreviewSections);
    for (let startCit = 0; startCit <= maxStart; startCit++) {
      const endCit =
        citableIndices.length === 0
          ? 0
          : Math.min(
              citableIndices.length - 1,
              startCit + maxPreviewSections - 1
            );
      let firstSecIdx =
        citableIndices.length === 0 ? 0 : citableIndices[startCit];
      while (firstSecIdx > 0 && profiles[firstSecIdx - 1].isHeadingOnly) {
        firstSecIdx--;
      }
      const lastSecIdx =
        citableIndices.length === 0
          ? Math.max(0, sections.length - 1)
          : citableIndices[endCit];
      const { score, categories, tags } =
        sections.length > 0
          ? scoreSectionSlice(
              profiles,
              firstSecIdx,
              lastSecIdx,
              pageIdx === 0 && startCit === 0
            )
          : { score: 0, categories: [], tags: [] };
      candidates.push({
        pageIdx,
        pageId,
        startCit,
        endCit,
        firstSecIdx,
        lastSecIdx,
        score,
        categories,
        tags,
      });
    }
    return { page, pageId, sections, profiles, citableIndices, candidates };
  });

  const overlaps = (a: SpotWindowCandidate, b: SpotWindowCandidate): boolean =>
    a.pageIdx === b.pageIdx && a.startCit <= b.endCit && b.startCit <= a.endCit;

  const slot1Cand = parsedPages[0].candidates[0];
  const first = buildSpotCheckWindow(
    v2Work,
    parsedPages[0].page,
    parsedPages[0].sections,
    parsedPages[0].citableIndices,
    "first",
    0,
    maxPreviewSections,
    "OPENING",
    slot1Cand.tags.length > 0
      ? `opening: ${slot1Cand.tags.join(" + ")}`
      : "opening rows"
  );

  // Single-page short work where Slot 1 already covers every citable row:
  // do not emit duplicate identical windows.
  if (
    pages.length === 1 &&
    parsedPages[0].citableIndices.length <= maxPreviewSections
  ) {
    return { first, spotCheckPages: [first] };
  }

  const allCandidates = parsedPages.flatMap((p) => p.candidates);
  const nonOverlappingSlot1 = allCandidates.filter(
    (c) => !overlaps(c, slot1Cand)
  );

  let slot2Cand: SpotWindowCandidate | undefined;
  let middle: GalleryPageSpotCheck | undefined;

  if (nonOverlappingSlot1.length > 0) {
    let best = nonOverlappingSlot1[0];
    for (const c of nonOverlappingSlot1) {
      if (c.score > best.score) {
        best = c;
      }
    }
    if (best.score > 0) {
      slot2Cand = best;
      const p = parsedPages[best.pageIdx];
      middle = buildSpotCheckWindow(
        v2Work,
        p.page,
        p.sections,
        p.citableIndices,
        "middle",
        best.startCit,
        maxPreviewSections,
        "FEATURED MARKUP",
        `featured: ${best.tags.join(" + ")}`
      );
    } else if (pages.length > 1) {
      let midPageIdx = Math.floor((pages.length - 1) / 2);
      if (
        midPageIdx === 0 &&
        !parsedPages[0].candidates.some((c) => !overlaps(c, slot1Cand))
      ) {
        midPageIdx = 1;
      }
      const p = parsedPages[midPageIdx];
      slot2Cand =
        p.candidates.find((c) => !overlaps(c, slot1Cand)) ?? p.candidates[0];
      middle = buildSpotCheckWindow(
        v2Work,
        p.page,
        p.sections,
        p.citableIndices,
        "middle",
        slot2Cand.startCit,
        maxPreviewSections,
        "MIDPOINT",
        "midpoint page"
      );
    } else {
      // Single-page work with uniform plain rows and > maxPreviewSections rows.
      const totalCit = parsedPages[0].citableIndices.length;
      const targetStart =
        totalCit >= 3 * maxPreviewSections
          ? Math.max(
              maxPreviewSections,
              Math.floor((totalCit - maxPreviewSections) / 2)
            )
          : maxPreviewSections;
      slot2Cand =
        nonOverlappingSlot1.find((c) => c.startCit >= targetStart) ??
        nonOverlappingSlot1[nonOverlappingSlot1.length - 1];
      const p = parsedPages[0];
      middle = buildSpotCheckWindow(
        v2Work,
        p.page,
        p.sections,
        p.citableIndices,
        "middle",
        slot2Cand.startCit,
        maxPreviewSections,
        "MID-PAGE",
        "mid-page window"
      );
    }
  }

  // Slot 3 (`last`): among windows not overlapping Slot 1 or Slot 2
  const nonOverlapping12 = nonOverlappingSlot1.filter(
    (c) => !slot2Cand || !overlaps(c, slot2Cand)
  );
  let last: GalleryPageSpotCheck | undefined;

  if (nonOverlapping12.length > 0) {
    const usedPages = new Set<number>([0]);
    if (slot2Cand) usedPages.add(slot2Cand.pageIdx);

    // 1. Prefer an unused structural boundary page (preface/prologus/epistula/argumentum).
    const boundaryCandidates = nonOverlapping12.filter(
      (c) => !usedPages.has(c.pageIdx) && isBoundaryPageId(c.pageId)
    );
    if (boundaryCandidates.length > 0) {
      let bestBoundary = boundaryCandidates[0];
      for (const c of boundaryCandidates) {
        if (c.score > bestBoundary.score) {
          bestBoundary = c;
        }
      }
      const p = parsedPages[bestBoundary.pageIdx];
      const reasonSuffix =
        bestBoundary.tags.length > 0
          ? `: ${bestBoundary.tags.join(" + ")}`
          : "";
      last = buildSpotCheckWindow(
        v2Work,
        p.page,
        p.sections,
        p.citableIndices,
        "last",
        bestBoundary.startCit,
        maxPreviewSections,
        "STRUCTURAL EDGE",
        `boundary page (${bestBoundary.pageId})${reasonSuffix}`
      );
    } else {
      // 2. Otherwise prefer a window with unseen feature categories.
      const seenCategories = new Set<string>([
        ...slot1Cand.categories,
        ...(slot2Cand?.categories ?? []),
      ]);
      const unseenCandidates = nonOverlapping12.filter(
        (c) =>
          c.score > 0 && c.categories.some((cat) => !seenCategories.has(cat))
      );
      if (unseenCandidates.length > 0) {
        let bestUnseen = unseenCandidates[0];
        for (const c of unseenCandidates) {
          if (c.score > bestUnseen.score) {
            bestUnseen = c;
          }
        }
        const p = parsedPages[bestUnseen.pageIdx];
        last = buildSpotCheckWindow(
          v2Work,
          p.page,
          p.sections,
          p.citableIndices,
          "last",
          bestUnseen.startCit,
          maxPreviewSections,
          "FEATURED MARKUP",
          `featured: ${bestUnseen.tags.join(" + ")}`
        );
      } else {
        // 3. Fallback: closing rows of the last page (or another non-overlapping window on the last page).
        const lastPageIdx = pages.length - 1;
        const lastPage = parsedPages[lastPageIdx];
        const closingCand = lastPage.candidates[lastPage.candidates.length - 1];
        if (
          closingCand &&
          !overlaps(closingCand, slot1Cand) &&
          (!slot2Cand || !overlaps(closingCand, slot2Cand))
        ) {
          last = buildSpotCheckWindow(
            v2Work,
            lastPage.page,
            lastPage.sections,
            lastPage.citableIndices,
            "last",
            closingCand.startCit,
            maxPreviewSections,
            "CLOSING",
            "closing rows"
          );
        } else {
          const altLastPageCand = lastPage.candidates.find(
            (c) =>
              !overlaps(c, slot1Cand) && (!slot2Cand || !overlaps(c, slot2Cand))
          );
          const fallbackCand =
            altLastPageCand ?? nonOverlapping12[nonOverlapping12.length - 1];
          const p = parsedPages[fallbackCand.pageIdx];
          last = buildSpotCheckWindow(
            v2Work,
            p.page,
            p.sections,
            p.citableIndices,
            "last",
            fallbackCand.startCit,
            maxPreviewSections,
            "CLOSING",
            "closing rows"
          );
        }
      }
    }
  }

  const spotCheckPages = [first, middle, last].filter(
    (p): p is GalleryPageSpotCheck => p !== undefined
  );
  return { first, middle, last, spotCheckPages };
}

function runPreprocessSingleWork(input: GalleryWorkInput): {
  work: ProcessedWork2;
  v2Work: V2PreprocessedWork;
} {
  if (input.precomputed) {
    return input.precomputed;
  }
  const patchMap: LibraryPatchMap = new Map();
  if (input.patches) {
    patchMap.set(input.workId, input.patches);
  }
  let captured:
    | { work: ProcessedWork2; v2Work: V2PreprocessedWork }
    | undefined;

  if (input.absPath && fs.existsSync(input.absPath)) {
    preprocessPerseusWorks([input.absPath], {
      patches: patchMap,
      onV2Work: (v2Work, work) => {
        captured = { work, v2Work };
      },
    });
  } else {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-gallery-"));
    try {
      const tmpPath = path.join(tmpDir, `${input.workId}.xml`);
      fs.writeFileSync(tmpPath, input.rawXml, "utf8");
      preprocessPerseusWorks([tmpPath], {
        patches: patchMap,
        onV2Work: (v2Work, work) => {
          captured = { work, v2Work };
        },
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  assert(
    captured !== undefined,
    `preprocessPerseusWorks produced no V2 output for '${input.workId}'`
  );
  return captured!;
}

/**
 * Processes a single TEI work through `preprocessPerseusWorks` (`processTei2`
 * + `preprocessWorkToV2`), extracting all markup kind occurrences/exemplars
 * and its per-work spot-check summary.
 */
export function analyzeWorkForGallery(
  input: GalleryWorkInput,
  maxExamplesPerWork = GALLERY_MAX_EXAMPLES_DEFAULT
): AnalyzedWorkGallery {
  const { work, v2Work } = runPreprocessSingleWork(input);
  const stripped = stripXmlProlog(input.rawXml);
  const rawTei = parseRawXml(stripped, { keepWhitespace: true });

  const indexed = indexWorkRender(work, v2Work);
  const body = rawTei.findDescendants("body")[0] ?? new XmlNode("body");
  const detachedNotes = collectDetachedNotes(body);

  const isVerseWork =
    work.textParts.length > 0 &&
    work.textParts[work.textParts.length - 1].toLowerCase() === "line";
  // Section ids of the raw tree, from the same citation spine as the
  // pipeline. Point levels (milestones, `<lb>`) are not sliced here, so text
  // under them resolves to its enclosing container's id.
  const rawSpine = buildCitationSpine(rawTei, body, { slicePoints: false });

  const kinds = new Map<string, WorkKindAccumulator>();
  const candidateLimit = Math.max(1, maxExamplesPerWork);

  const recordKind = (
    kind: string,
    category: MarkupCategory,
    resolvedSecId: string | undefined,
    inNote: boolean,
    buildExemplar: () => GalleryExemplar | undefined
  ) => {
    let acc = kinds.get(kind);
    if (!acc) {
      acc = {
        category,
        occurrences: 0,
        candidates: [],
        sameSectionFallbacks: [],
      };
      kinds.set(kind, acc);
    }
    acc.occurrences++;
    if (
      acc.candidates.length >= candidateLimit ||
      resolvedSecId === undefined
    ) {
      return;
    }
    const sameSection = acc.candidates.some(
      (c) => c.sectionId === resolvedSecId && Boolean(c.inNote) === inNote
    );
    if (sameSection && acc.sameSectionFallbacks.length >= candidateLimit) {
      return;
    }
    const ex = buildExemplar();
    if (!ex) {
      return;
    }
    if (!sameSection) {
      acc.candidates.push(ex);
    } else {
      acc.sameSectionFallbacks.push(ex);
    }
  };

  const textDepth = work.textParts.length;
  const secIdDepth = (dotSecId: string) =>
    dotSecId.length === 0 ? 0 : dotSecId.split(".").length;
  /**
   * Shallow nodes (section id above the leaf level) in document order, keyed
   * by `<sectionId>\0<name>`, used to tell apart repeated nodes with the same
   * text in one section (e.g. two `<label>Ausonio Paulinus</label>`).
   */
  const shallowNodesBySecAndName = new Map<string, XmlNode[]>();
  const needleCache = new Map<XmlNode, string>();
  const needleOf = (n: XmlNode) => {
    let needle = needleCache.get(n);
    if (needle === undefined) {
      needle = rowMatchNeedle(n);
      needleCache.set(n, needle);
    }
    return needle;
  };

  /**
   * Picks the one page row that renders `node` when its section id alone is
   * ambiguous: the id is shallower than the work's leaf level and has rows of
   * its own (heads, labels, notes between lines, so a stripped milestone
   * would otherwise land on one of them), or the id's rows are not
   * contiguous on the page. Matches the node's own text against the id's
   * rows (then the section's rows); for empty nodes such as milestones,
   * matches the text that follows them. Returns `undefined` when nothing
   * matches or the id is unambiguous.
   */
  const findTargetRowOffset = (
    node: XmlNode,
    loc: SectionRenderLocation,
    dotSecId: string,
    ancestors: XmlNode[]
  ): number | undefined => {
    const shallowWithOwnRows =
      secIdDepth(dotSecId) < textDepth &&
      indexed.bySectionId.get(dotSecId) === loc;
    if (!shallowWithOwnRows && isContiguous(loc.rowOffsetsInPage)) {
      return undefined;
    }
    const rowTexts = compactRowTexts(loc.pageRowHtmls);
    // Rows of the node's section or any subsection of it, in page order.
    const sectionRows: number[] = [];
    for (let o = 0; o < loc.pageRowHtmls.length; o++) {
      const rowSecId = loc.pageRowSecIds[o] ?? "";
      if (
        dotSecId.length === 0 ||
        rowSecId === dotSecId ||
        rowSecId.startsWith(`${dotSecId}.`)
      ) {
        sectionRows.push(o);
      }
    }
    const firstSectionRowWith = (text: string) =>
      sectionRows.find((o) => (rowTexts[o] ?? "").includes(text));
    const needle = needleOf(node);
    if (needle.length > 0) {
      const peers =
        shallowNodesBySecAndName.get(`${dotSecId}\u0000${node.name}`) ?? [];
      let ordinal = 0;
      for (const peer of peers) {
        if (peer === node) break;
        if (needleOf(peer) === needle) ordinal++;
      }
      for (const caseSensitive of [true, false]) {
        const fold = (s: string) => (caseSensitive ? s : s.toLowerCase());
        const foldedNeedle = fold(needle);
        const matches = loc.rowOffsetsInPage.filter((o) =>
          fold(rowTexts[o] ?? "").includes(foldedNeedle)
        );
        if (matches.length > 0) {
          return matches[Math.min(ordinal, matches.length - 1)];
        }
      }
      const sectionRow = firstSectionRowWith(needle);
      if (sectionRow !== undefined) {
        return sectionRow;
      }
    }
    const following = compactText(followingTeiTextNode(ancestors) ?? "").slice(
      0,
      ROW_MATCH_CHARS
    );
    if (following.length > 0) {
      return firstSectionRowWith(following);
    }
    return undefined;
  };

  const makeBodyExemplar = (
    node: XmlNode,
    loc: SectionRenderLocation | undefined,
    options?: {
      fullPage?: boolean;
      adjacentRows?: boolean;
      dotSecId?: string;
      ancestors?: XmlNode[];
    }
  ): GalleryExemplar | undefined => {
    if (!loc) {
      return undefined;
    }
    const targetRow =
      options?.dotSecId !== undefined && options.ancestors !== undefined
        ? findTargetRowOffset(node, loc, options.dotSecId, options.ancestors)
        : undefined;
    const targetOffsets = new Set(
      targetRow !== undefined ? [targetRow] : loc.rowOffsetsInPage
    );
    const markRows = (start: number, end: number) =>
      loc.pageRowHtmls
        .slice(start, end)
        .map((rowHtml, idx) =>
          targetOffsets.has(start + idx)
            ? markGalleryTargetRow(rowHtml)
            : rowHtml
        )
        .join("\n");
    let passageHtml: string;
    if (options?.fullPage) {
      passageHtml = markRows(0, loc.pageRowHtmls.length);
    } else if (options?.adjacentRows && targetOffsets.size > 0) {
      const firstOffset = targetRow ?? loc.rowOffsetsInPage[0];
      const start = Math.max(0, firstOffset - 1);
      const end = Math.min(loc.pageRowHtmls.length, firstOffset + 2);
      passageHtml = markRows(start, end);
    } else if (targetRow !== undefined) {
      // The matched row with one row of context before and after it.
      const start = Math.max(
        0,
        Math.min(targetRow - 1, loc.pageRowHtmls.length - 3)
      );
      const end = Math.min(loc.pageRowHtmls.length, start + 3);
      passageHtml = markRows(start, end);
    } else {
      const markedRows = loc.rowHtmls
        .slice(0, 3)
        .map((rowHtml, idx) =>
          idx === 0 ? markGalleryTargetRow(rowHtml) : rowHtml
        );
      passageHtml = markedRows.join("\n");
    }
    const sectionId =
      targetRow !== undefined
        ? loc.pageRowSecIds[targetRow] ?? loc.sectionId
        : loc.sectionId;
    const filteredNotes = filterNotesHtmlToRefs(passageHtml, loc.pageNotesHtml);
    const renderedHtml = joinPassageAndNotesHtml(passageHtml, filteredNotes);
    const readerUrl = buildReaderSectionUrl(
      v2Work.urlAuthor,
      v2Work.urlName,
      loc.pageId,
      sectionId
    );
    return {
      workId: input.workId,
      workTitle: v2Work.shortTitle ?? v2Work.title,
      author: v2Work.author,
      sectionId,
      pageId: loc.pageId,
      readerUrl,
      url: readerUrl,
      teiSnippet: serializeTeiSnippet(node),
      renderedHtml,
    };
  };

  const makeNoteExemplar = (
    node: XmlNode,
    noteId: number,
    customSnippet?: string
  ): GalleryExemplar | undefined => {
    const noteLoc = indexed.byNoteId.get(noteId);
    if (!noteLoc) {
      return undefined;
    }
    const readerUrl = buildReaderSectionUrl(
      v2Work.urlAuthor,
      v2Work.urlName,
      noteLoc.pageId,
      noteLoc.sectionId
    );
    const renderedHtml = joinPassageAndNotesHtml(
      markGalleryTargetRow(noteLoc.sectionHtml),
      noteLoc.noteHtml
    );
    return {
      workId: input.workId,
      workTitle: v2Work.shortTitle ?? v2Work.title,
      author: v2Work.author,
      sectionId: noteLoc.sectionId,
      pageId: noteLoc.pageId,
      readerUrl,
      url: readerUrl,
      teiSnippet: customSnippet ?? serializeTeiSnippet(node),
      renderedHtml,
      inNote: true,
    };
  };

  /**
   * Symmetric attribute extraction used in both body and note walks.
   */
  const recordElementAttributes = (
    node: XmlNode,
    resolvedSecId: string | undefined,
    inNote: boolean,
    buildEx: () => GalleryExemplar | undefined,
    buildAdjacentEx?: () => GalleryExemplar | undefined,
    buildFullPageEx?: () => GalleryExemplar | undefined
  ) => {
    if (node.name === "l") {
      const part = node.getAttr("part");
      if (part !== undefined) {
        recordKind(
          `l@part="${part}"`,
          "attr",
          resolvedSecId,
          inNote,
          buildAdjacentEx ?? buildEx
        );
        if (part !== "N") {
          recordKind(
            "l@part",
            "layout",
            resolvedSecId,
            inNote,
            buildFullPageEx ?? buildEx
          );
        }
      }
    }
    if (node.name === "foreign") {
      const lang = node.getAttr("xml:lang");
      if (lang !== undefined) {
        recordKind(
          `foreign@xml:lang="${lang}"`,
          "attr",
          resolvedSecId,
          inNote,
          buildEx
        );
      }
    }
    if (node.name === "milestone") {
      const unit = node.getAttr("unit");
      if (unit !== undefined) {
        recordKind(
          `milestone@unit="${unit}"`,
          "attr",
          resolvedSecId,
          inNote,
          buildEx
        );
      }
    }
    if (node.name === "w") {
      const wType = node.getAttr("type");
      if (wType !== undefined) {
        recordKind(`w@type="${wType}"`, "attr", resolvedSecId, inNote, buildEx);
      }
    }
  };

  let nextNoteId = 0;

  const walkNoteDescendants = (noteBody: XmlNode, noteId: number) => {
    const noteSecId = indexed.byNoteId.get(noteId)?.sectionId;
    for (const child of noteBody.children) {
      if (typeof child === "string") continue;
      if (child.name === "#comment") continue;

      const buildEx = () => makeNoteExemplar(child, noteId);
      recordKind(
        `note:${child.name}`,
        "note-element",
        noteSecId,
        true,
        buildEx
      );

      const rend = child.getAttr("rend");
      if (rend !== undefined) {
        const trimmed = rend.trim();
        if (trimmed.length > 0) {
          recordKind(
            `note:${child.name}@${trimmed}`,
            "note-rend",
            noteSecId,
            true,
            buildEx
          );
          const tokens = rendTokens(rend);
          if (tokens.length > 1) {
            for (const token of tokens) {
              recordKind(
                `note:${child.name}@${token}`,
                "note-rend",
                noteSecId,
                true,
                buildEx
              );
            }
          }
        }
      }

      recordElementAttributes(child, noteSecId, true, buildEx);
      walkNoteDescendants(child, noteId);
    }
  };

  const walkBody = (
    node: XmlNode,
    ancestors: XmlNode[],
    inheritedSecId: string
  ) => {
    if (node.name === "#comment") {
      return;
    }
    if (isVacuousNote(node)) {
      return;
    }
    if (node.name === "note" && detachedNotes.detachedNodes.has(node)) {
      // Detached `<note xml:id="...">` or referenced `<note n="...">` body;
      // walked when referenced via `<note target="...">`.
      return;
    }

    const dotSecId =
      CitationSpine.sectionIdOf(rawSpine, ancestors)[0].join(".") ||
      inheritedSecId;

    if (node.name === "note") {
      const noteId = nextNoteId++;
      const noteSecId = indexed.byNoteId.get(noteId)?.sectionId;
      const target = node.getAttr("target");
      const targetNode =
        target !== undefined
          ? detachedNotes.byTarget.get(target) ??
            detachedNotes.byTarget.get(target.replace(/^#/, ""))
          : undefined;
      const buildNoteEx = () => {
        const snippet =
          target !== undefined && targetNode !== undefined
            ? `${serializeTeiSnippet(node, 120)} → ${serializeTeiSnippet(
                targetNode,
                180
              )}`
            : serializeTeiSnippet(node);
        return makeNoteExemplar(node, noteId, snippet);
      };

      recordKind("note", "element", noteSecId, true, buildNoteEx);
      if (target !== undefined) {
        recordKind("note@target", "attr", noteSecId, true, buildNoteEx);
      }
      const place = node.getAttr("place");
      if (place !== undefined) {
        recordKind(
          `note@place="${place}"`,
          "attr",
          noteSecId,
          true,
          buildNoteEx
        );
      }
      if (
        node.getAttr("n") !== undefined ||
        targetNode?.getAttr("n") !== undefined
      ) {
        recordKind("note@n", "attr", noteSecId, true, buildNoteEx);
      }
      const rend = node.getAttr("rend");
      if (rend !== undefined && rend.trim().length > 0) {
        recordKind(`note@${rend.trim()}`, "rend", noteSecId, true, buildNoteEx);
      }

      const bodyToWalk = targetNode ?? node;
      walkNoteDescendants(bodyToWalk, noteId);
      return;
    }

    const loc = resolveSectionLocation(dotSecId, indexed);
    const resolvedSecId = loc?.sectionId;
    if (secIdDepth(dotSecId) < textDepth) {
      const peerKey = `${dotSecId}\u0000${node.name}`;
      let peers = shallowNodesBySecAndName.get(peerKey);
      if (!peers) {
        peers = [];
        shallowNodesBySecAndName.set(peerKey, peers);
      }
      peers.push(node);
    }
    const buildBodyEx = () =>
      makeBodyExemplar(node, loc, { dotSecId, ancestors });
    const buildAdjacentEx = () =>
      makeBodyExemplar(node, loc, { adjacentRows: true, dotSecId, ancestors });
    const buildFullPageEx = () =>
      makeBodyExemplar(node, loc, { fullPage: true, dotSecId, ancestors });

    if (!STRUCTURAL_CONTAINER_ELEMENTS.has(node.name)) {
      recordKind(node.name, "element", resolvedSecId, false, buildBodyEx);
    }

    const rend = node.getAttr("rend");
    if (rend !== undefined) {
      const trimmed = rend.trim();
      if (trimmed.length > 0) {
        recordKind(
          `${node.name}@${trimmed}`,
          "rend",
          resolvedSecId,
          false,
          buildBodyEx
        );
        const tokens = rendTokens(rend);
        if (tokens.length > 1) {
          for (const token of tokens) {
            recordKind(
              `${node.name}@${token}`,
              "rend",
              resolvedSecId,
              false,
              buildBodyEx
            );
          }
        }
      }
    }

    recordElementAttributes(
      node,
      resolvedSecId,
      false,
      buildBodyEx,
      buildAdjacentEx,
      buildFullPageEx
    );

    if (!isVerseWork) {
      const hasLgAncestor = ancestors.slice(0, -1).some((a) => a.name === "lg");
      if (node.name === "lg" || (node.name === "l" && !hasLgAncestor)) {
        recordKind(
          "embedded-verse",
          "layout",
          resolvedSecId,
          false,
          buildFullPageEx
        );
      }
    }

    if (
      node.name === "sp" ||
      node.name === "speaker" ||
      node.name === "stage" ||
      (node.name === "said" && node.getAttr("who") !== undefined)
    ) {
      recordKind(
        "dialogue-speaker",
        "layout",
        resolvedSecId,
        false,
        buildFullPageEx
      );
    }

    for (const child of node.children) {
      if (typeof child === "string") continue;
      walkBody(child, [...ancestors, child], dotSecId);
    }
  };

  walkBody(body, [body], "");

  const expectedNotes = work.notes?.length ?? 0;
  assert(
    nextNoteId === expectedNotes,
    `Note count mismatch in '${input.workId}': raw walk visited ${nextNoteId} notes, processTei2 produced ${expectedNotes}`
  );

  for (const acc of kinds.values()) {
    while (
      acc.candidates.length < candidateLimit &&
      acc.sameSectionFallbacks.length > 0
    ) {
      acc.candidates.push(acc.sameSectionFallbacks.shift()!);
    }
  }

  const citableRowCount = work.rows.filter(
    ([id]) => id.length === work.textParts.length
  ).length;

  const { first, middle, last, spotCheckPages } = selectWorkSpotChecks(v2Work);

  const spotCheck: GalleryWorkSpotCheck = {
    workId: input.workId,
    author: v2Work.author,
    title: v2Work.title,
    shortTitle: v2Work.shortTitle,
    urlAuthor: v2Work.urlAuthor,
    urlName: v2Work.urlName,
    onboarded: input.onboarded,
    rowCount: work.rows.length,
    citableRowCount,
    pageCount: v2Work.pages.length,
    textParts: [...work.textParts],
    markupKinds: [...kinds.keys()].sort(),
    pages: { first, middle, last },
    spotCheckPages,
  };

  return { spotCheck, kinds };
}

const CATEGORY_ORDER: Record<MarkupCategory, number> = {
  element: 0,
  "note-element": 1,
  rend: 2,
  "note-rend": 3,
  attr: 4,
  layout: 5,
};

/**
 * Selects up to `maxExamples` exemplars across works using round-robin
 * selection, spreading across distinct authors first, then distinct works
 * by the same author, and finally distinct sections within a work.
 */
export function selectDiverseExemplars(
  perWorkCandidates: GalleryExemplar[][],
  maxExamples: number
): GalleryExemplar[] {
  if (maxExamples <= 0) {
    return [];
  }
  const nonEmpty = perWorkCandidates.filter((list) => list.length > 0);
  if (nonEmpty.length === 0) {
    return [];
  }

  // Spread work lists across distinct authors first so common markup kinds
  // don't just pick multiple works from the alphabetically first author.
  const byAuthor = new Map<string, GalleryExemplar[][]>();
  for (const workList of nonEmpty) {
    const authorKey = workList[0].author || workList[0].workId.split(".")[0];
    let authorWorks = byAuthor.get(authorKey);
    if (!authorWorks) {
      authorWorks = [];
      byAuthor.set(authorKey, authorWorks);
    }
    authorWorks.push(workList);
  }
  const authorSpreadWorks: GalleryExemplar[][] = [];
  let authorRound = 0;
  while (authorSpreadWorks.length < nonEmpty.length) {
    let added = false;
    for (const authorWorks of byAuthor.values()) {
      if (authorRound < authorWorks.length) {
        authorSpreadWorks.push(authorWorks[authorRound]);
        added = true;
      }
    }
    if (!added) break;
    authorRound++;
  }

  const selected: GalleryExemplar[] = [];
  let round = 0;
  while (selected.length < maxExamples) {
    let addedInRound = false;
    for (const workList of authorSpreadWorks) {
      if (round < workList.length) {
        selected.push(workList[round]);
        addedInRound = true;
        if (selected.length >= maxExamples) {
          break;
        }
      }
    }
    if (!addedInRound) {
      break;
    }
    round++;
  }
  return selected;
}

export interface BuildGalleryFromWorksOptions {
  label?: string;
  root?: string;
  latinLitCommit?: string;
  morcusCommit?: string;
  includeCandidates?: boolean;
  maxExamples?: number;
}

/**
 * Pure aggregation over a list of `GalleryWorkInput` items, returning the
 * structured `GalleryReport`. Onboarded works (`input.onboarded === true`)
 * fail loudly if they cannot be processed; candidate works record their
 * failure in `report.failures`.
 */
export function buildGalleryReportFromInputs(
  inputs: GalleryWorkInput[],
  options: BuildGalleryFromWorksOptions = {}
): GalleryReport {
  const maxExamples = options.maxExamples ?? GALLERY_MAX_EXAMPLES_DEFAULT;
  const { analyses, failures } = analyzeGalleryInputs(inputs, maxExamples);
  return aggregateGalleryReport(analyses, failures, options);
}

/**
 * Builds the onboarding delta gallery: only works onboarded now but not in
 * `prior` (skipped candidates never appear), and only the markup kinds those
 * works exercise that no work onboarded in `prior` did. Exemplars come from
 * the newly onboarded works alone.
 */
export function buildDeltaGalleryReportFromInputs(
  inputs: GalleryWorkInput[],
  prior: GalleryReport,
  options: BuildGalleryFromWorksOptions = {}
): GalleryReport {
  const maxExamples = options.maxExamples ?? GALLERY_MAX_EXAMPLES_DEFAULT;
  const { analyses } = analyzeGalleryInputs(inputs, maxExamples);
  return deltaReportFromAnalyses(analyses, prior, options);
}

function analyzeGalleryInputs(
  inputs: GalleryWorkInput[],
  maxExamples: number
): { analyses: AnalyzedWorkGallery[]; failures: Record<string, string> } {
  const analyses: AnalyzedWorkGallery[] = [];
  const failures: Record<string, string> = {};
  const sortedInputs = [...inputs].sort((a, b) =>
    a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0
  );
  for (const input of sortedInputs) {
    try {
      analyses.push(analyzeWorkForGallery(input, Math.max(1, maxExamples)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (input.onboarded) {
        throw new Error(
          `Onboarded work '${
            input.workId
          }' failed gallery processing: ${firstLineOf(msg)}`
        );
      }
      failures[input.workId] = firstLineOf(msg).slice(0, 160);
    }
  }
  return { analyses, failures };
}

function deltaReportFromAnalyses(
  analyses: AnalyzedWorkGallery[],
  prior: GalleryReport,
  options: BuildGalleryFromWorksOptions
): GalleryReport {
  const priorWorks = (prior.works ?? []).filter((w) => w.onboarded);
  const priorOnboarded = new Set(priorWorks.map((w) => w.workId));
  const priorKinds = new Set(priorWorks.flatMap((w) => w.markupKinds ?? []));
  const newlyOnboarded = analyses.filter(
    (a) => a.spotCheck.onboarded && !priorOnboarded.has(a.spotCheck.workId)
  );
  return aggregateGalleryReport(
    newlyOnboarded,
    {},
    {
      ...options,
      label: `${options.label ?? "gallery"}-delta`,
      includeCandidates: false,
    },
    (kind) => !priorKinds.has(kind)
  );
}

function aggregateGalleryReport(
  analyses: AnalyzedWorkGallery[],
  failures: Record<string, string>,
  options: BuildGalleryFromWorksOptions,
  includeKind: (kind: string) => boolean = () => true
): GalleryReport {
  const maxExamples = options.maxExamples ?? GALLERY_MAX_EXAMPLES_DEFAULT;
  const label = options.label ?? "gallery";
  const root = options.root ?? "";
  const includeCandidates = Boolean(options.includeCandidates);

  const works: GalleryWorkSpotCheck[] = [];
  const kindMap = new Map<
    string,
    {
      category: MarkupCategory;
      workCount: number;
      occurrenceCount: number;
      perWorkCandidates: GalleryExemplar[][];
    }
  >();

  for (const analyzed of analyses) {
    works.push(analyzed.spotCheck);
    for (const [kind, acc] of analyzed.kinds.entries()) {
      if (!includeKind(kind)) continue;
      let globalAcc = kindMap.get(kind);
      if (!globalAcc) {
        globalAcc = {
          category: acc.category,
          workCount: 0,
          occurrenceCount: 0,
          perWorkCandidates: [],
        };
        kindMap.set(kind, globalAcc);
      }
      globalAcc.workCount++;
      globalAcc.occurrenceCount += acc.occurrences;
      if (acc.candidates.length > 0) {
        globalAcc.perWorkCandidates.push(acc.candidates);
      }
    }
  }

  const markupKinds: GalleryMarkupKind[] = [];
  for (const [kind, data] of kindMap.entries()) {
    markupKinds.push({
      kind,
      category: data.category,
      workCount: data.workCount,
      occurrenceCount: data.occurrenceCount,
      examples: selectDiverseExemplars(data.perWorkCandidates, maxExamples),
    });
  }

  markupKinds.sort(
    (a, b) =>
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      b.workCount - a.workCount ||
      b.occurrenceCount - a.occurrenceCount ||
      (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
  );

  const kindsByName: Record<string, GalleryMarkupKind> = {};
  for (const k of markupKinds) {
    kindsByName[k.kind] = k;
  }

  const onboardedCount = works.filter((w) => w.onboarded).length;
  const candidateCount = works.filter((w) => !w.onboarded).length;

  return {
    label,
    createdAt: new Date().toISOString(),
    root,
    latinLitCommit: options.latinLitCommit,
    morcusCommit: options.morcusCommit,
    includeCandidates,
    maxExamples,
    totals: {
      worksProcessed: works.length,
      onboardedCount,
      candidateCount,
      failedCount: Object.keys(failures).length,
      markupKindCount: markupKinds.length,
    },
    markupKinds,
    kindsByName,
    works,
    failures,
  };
}

function workIdToRelPath(workId: string): string {
  const parts = workId.split(".");
  if (parts.length !== 3) {
    throw new Error(`Invalid Perseus work ID '${workId}'`);
  }
  return `data/${parts[0]}/${parts[1]}/${workId}.xml`;
}

export interface DiscoveredGalleryFile {
  workId: string;
  absPath: string;
  onboarded: boolean;
}

/**
 * Selects the target Latin TEI files under `root`:
 * - When `works` is given: resolves those specific work IDs under `root`.
 * - Otherwise: includes all onboarded `LatinWorks` present in `root`, plus
 *   (when `includeCandidates` is true) all non-onboarded `perseus-lat*` files
 *   discovered under `root/data/`.
 */
export function selectGalleryWorkFiles(
  root: string,
  options: { works?: string[]; includeCandidates?: boolean } = {}
): DiscoveredGalleryFile[] {
  if (options.works && options.works.length > 0) {
    return options.works.map((rawWorkId) => {
      const workId = resolveWorkIdAlias(rawWorkId);
      const relPath = workIdToRelPath(workId);
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        throw new Error(`Work file not found for '${rawWorkId}' at ${absPath}`);
      }
      return {
        workId,
        absPath,
        onboarded: ONBOARDED_LATIN_WORK_IDS.has(workId),
      };
    });
  }

  const allSurveyed = surveyFiles(root).filter(
    (f) => !ENGLISH_TRANSLATION_IDS.has(f.workId)
  );
  const filtered = allSurveyed.filter((f) => {
    const isOnboarded = ONBOARDED_LATIN_WORK_IDS.has(f.workId);
    return options.includeCandidates ? true : isOnboarded;
  });

  return filtered.map((f) => ({
    workId: f.workId,
    absPath: f.absPath,
    onboarded: ONBOARDED_LATIN_WORK_IDS.has(f.workId),
  }));
}

// ---------------------------------------------------------------------------
// Markdown & Self-Contained HTML Gallery Formatting

const CATEGORY_TITLES: Record<MarkupCategory, string> = {
  element: "Content Elements (Body Only)",
  "note-element": "Note Elements (Inside `<note>`)",
  rend: "Element `@rend` Combinations (Body Only)",
  "note-rend": "Note `@rend` Combinations (Inside `<note>`)",
  attr: "Key Structural & Attribute Kinds",
  layout: "Complex Layout Passages (Full Page Context)",
};

export const CATEGORY_NAV_LABELS: Record<MarkupCategory, string> = {
  element: "Content Elements",
  "note-element": "Note Elements",
  rend: "Element @rend",
  "note-rend": "Note @rend",
  attr: "Attributes",
  layout: "Complex Layouts",
};

function escapeMdCell(s: string): string {
  return s.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

/** Formats the concise Markdown summary (`gallery.md`). */
export function formatGalleryMarkdown(report: GalleryReport): string {
  const lines: string[] = [];
  const P = (line = "") => lines.push(line);
  const t = report.totals;
  const failureEntries = Object.entries(report.failures).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  P(`# Library Exemplar Review Gallery: \`${report.label}\``);
  P();
  P(`- **Corpus root**: \`${report.root}\``);
  if (report.latinLitCommit || report.morcusCommit) {
    P(
      `- **Commits**: latinLit \`${
        report.latinLitCommit ?? "?"
      }\`, morcus-net \`${report.morcusCommit ?? "?"}\``
    );
  }
  P(
    `- **Works processed**: ${t.worksProcessed} (${
      t.onboardedCount
    } onboarded, ${t.candidateCount} candidate${
      t.failedCount > 0 ? `, ${t.failedCount} skipped/failed V1` : ""
    })`
  );
  P(
    `- **Markup kinds**: ${t.markupKindCount} (up to ${report.maxExamples} exemplars per kind)`
  );
  P();

  P(`## 1. Markup Kind Exemplars`);
  P();
  P(`| Kind | Category | Works | Occurrences | Sample Citations |`);
  P(`| --- | --- | ---: | ---: | --- |`);
  for (const k of report.markupKinds) {
    const samples = k.examples
      .map(
        (ex) =>
          `[\`${escapeMdCell(ex.workId)} ${escapeMdCell(ex.sectionId)}\`](${
            ex.readerUrl
          })`
      )
      .join(", ");
    P(
      `| \`${escapeMdCell(k.kind)}\` | ${k.category} | ${k.workCount} | ${
        k.occurrenceCount
      } | ${samples} |`
    );
  }
  P();

  for (const k of report.markupKinds) {
    P(
      `### \`${k.kind}\` (${k.category} — ${k.workCount} works, ${k.occurrenceCount}×)`
    );
    P();
    for (const ex of k.examples) {
      P(
        `- **${ex.author}, _${ex.workTitle}_** (\`${ex.workId}\`, §\`${ex.sectionId}\`, page \`${ex.pageId}\`) — [${ex.readerUrl}](${ex.readerUrl})`
      );
      P(`  - TEI: \`${ex.teiSnippet.replaceAll("`", "'")}\``);
    }
    P();
  }

  P(`## 2. Per-Work Spot-Check Index`);
  P();
  P(
    `| Work ID | Author | Title | Status | Rows (Citable) | Pages | First | Middle | Last | Kinds |`
  );
  P(`| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: |`);
  for (const w of report.works) {
    const pageLink = (p?: GalleryPageSpotCheck) =>
      p ? `[\`${escapeMdCell(p.pageId)}\`](${p.readerUrl})` : "—";
    P(
      `| \`${escapeMdCell(w.workId)}\` | ${escapeMdCell(
        w.author
      )} | ${escapeMdCell(w.shortTitle ?? w.title)} | ${
        w.onboarded ? "onboarded" : "**candidate**"
      } | ${w.rowCount} (${w.citableRowCount}) | ${w.pageCount} | ${pageLink(
        w.pages.first
      )} | ${pageLink(w.pages.middle)} | ${pageLink(w.pages.last)} | ${
        w.markupKinds.length
      } |`
    );
  }
  P();

  if (failureEntries.length > 0) {
    P(`## 3. Skipped / Failed Candidate Works (${failureEntries.length})`);
    P();
    P(`| Work ID | Error |`);
    P(`| --- | --- |`);
    for (const [workId, errMsg] of failureEntries) {
      P(`| \`${escapeMdCell(workId)}\` | ${escapeMdCell(errMsg)} |`);
    }
    P();
  }

  return lines.join("\n") + "\n";
}

function kindAnchorId(kind: string, category: MarkupCategory): string {
  const safe = `${category}-${kind}`.replace(
    /[^a-zA-Z0-9_-]/g,
    (c) => `_${c.charCodeAt(0).toString(16)}_`
  );
  return `kind-${safe}`;
}

/**
 * Core reader typography, indentation, and apparatus styles scoped strictly to
 * `.reader-passage` and `.reader-notes` (matching `reader_text.css` and
 * `reader_notes.css` in production so body vs note styling is faithfully
 * reproduced in `index.html`).
 */
const GALLERY_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f8f7f4;
  --surface: #ffffff;
  --surface-muted: #f2efe9;
  --border: #dfd9ce;
  --border-strong: #c5bcad;
  --text: #1f1e1b;
  --reading-text: #1c1b18;
  --text-muted: #656056;
  --primary: #7a2e1d;
  --primary-light: #f6e7e3;
  --link: #1f5787;
  --code-bg: #f4f1ea;
  --badge-bg: #ebe6dc;
  --candidate-bg: #e3f2e8;
  --candidate-fg: #1b5e37;
  --reviewed-bg: #f1f8e9;
  --reviewed-surface: #fdfefd;
  --reviewed-border: #a5d6a7;
  --reviewed-fg: #2e7d32;
  --diff-del-bg: #fecaca;
  --diff-del-fg: #7f1d1d;
  --diff-del-border: #f87171;
  --diff-ins-bg: #bbf7d0;
  --diff-ins-fg: #14532d;
  --diff-ins-border: #4ade80;
  --diff-change-bg: #fef3c7;
  --diff-change-fg: #92400e;
  --diff-change-border: #fcd34d;
  --diff-unpaired-bg: #f3e8ff;
  --diff-unpaired-fg: #6b21a8;
  --diff-unpaired-border: #d8b4fe;
  --diff-citation-bg: #e0f2fe;
  --diff-citation-fg: #075985;
  --diff-citation-border: #7dd3fc;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-serif: "eb garamond", "Palatino Linotype", Palatino, Georgia, serif;
  --font-text: "eb garamond", "Palatino Linotype", Palatino, Georgia, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --reader-base: 1.12rem;
}

html[data-theme="dark"],
body[data-theme="dark"] {
  color-scheme: dark;
  --bg: #141413;
  --surface: #1e1e1c;
  --surface-muted: #282724;
  --border: #3a3833;
  --border-strong: #524e47;
  --text: #e8e4dc;
  --reading-text: #ede9e0;
  --text-muted: #a39d90;
  --primary: #e07a5f;
  --primary-light: #36221c;
  --link: #6cb4ee;
  --code-bg: #191917;
  --badge-bg: #32302c;
  --candidate-bg: #1b3826;
  --candidate-fg: #81c995;
  --reviewed-bg: #18281d;
  --reviewed-surface: #1d3023;
  --reviewed-border: #2d5a38;
  --reviewed-fg: #81c995;
  --diff-del-bg: rgba(239, 68, 68, 0.25);
  --diff-del-fg: #fca5a5;
  --diff-del-border: #dc2626;
  --diff-ins-bg: rgba(34, 197, 94, 0.25);
  --diff-ins-fg: #86efac;
  --diff-ins-border: #16a34a;
  --diff-change-bg: rgba(245, 158, 11, 0.25);
  --diff-change-fg: #fde68a;
  --diff-change-border: #d97706;
  --diff-unpaired-bg: rgba(168, 85, 247, 0.25);
  --diff-unpaired-fg: #d8b4fe;
  --diff-unpaired-border: #9333ea;
  --diff-citation-bg: rgba(14, 165, 233, 0.25);
  --diff-citation-fg: #7dd3fc;
  --diff-citation-border: #0369a1;
}

html[data-theme="light"],
body[data-theme="light"] {
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]),
  body:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #141413;
    --surface: #1e1e1c;
    --surface-muted: #282724;
    --border: #3a3833;
    --border-strong: #524e47;
    --text: #e8e4dc;
    --reading-text: #ede9e0;
    --text-muted: #a39d90;
    --primary: #e07a5f;
    --primary-light: #36221c;
    --link: #6cb4ee;
    --code-bg: #191917;
    --badge-bg: #32302c;
    --candidate-bg: #1b3826;
    --candidate-fg: #81c995;
    --reviewed-bg: #18281d;
    --reviewed-surface: #1d3023;
    --reviewed-border: #2d5a38;
    --reviewed-fg: #81c995;
    --diff-del-bg: rgba(239, 68, 68, 0.25);
    --diff-del-fg: #fca5a5;
    --diff-del-border: #dc2626;
    --diff-ins-bg: rgba(34, 197, 94, 0.25);
    --diff-ins-fg: #86efac;
    --diff-ins-border: #16a34a;
    --diff-change-bg: rgba(245, 158, 11, 0.25);
    --diff-change-fg: #fde68a;
    --diff-change-border: #d97706;
    --diff-unpaired-bg: rgba(168, 85, 247, 0.25);
    --diff-unpaired-fg: #d8b4fe;
    --diff-unpaired-border: #9333ea;
    --diff-citation-bg: rgba(14, 165, 233, 0.25);
    --diff-citation-fg: #7dd3fc;
    --diff-citation-border: #0369a1;
  }
}

* {
  box-sizing: border-box;
}

html {
  scroll-padding-top: var(--gallery-header-h, 8.5rem);
}

section[id],
article[id],
details[id] {
  scroll-margin-top: var(--gallery-header-h, 8.5rem);
}

body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  line-height: 1.5;
}

.gallery-header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 1.25rem 2rem;
  position: sticky;
  top: 0;
  z-index: 50;
}

.gallery-header-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  max-width: 1400px;
  margin: 0 auto;
}

.gallery-title {
  margin: 0;
  font-size: 1.35rem;
  font-family: var(--font-serif);
}

.gallery-meta {
  font-size: 0.85rem;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.gallery-controls {
  max-width: 1400px;
  margin: 0.75rem auto 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.82rem;
}

.gallery-progress-badge {
  background: var(--badge-bg);
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.8rem;
  border: 1px solid var(--border);
}

.gallery-control-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  font-size: 0.8rem;
}

.gallery-btn {
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.8rem;
  font-family: var(--font-sans);
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.gallery-btn:hover {
  background: var(--surface);
  border-color: var(--primary);
  color: var(--primary);
}

.gallery-nav {
  max-width: 1400px;
  margin: 0.75rem auto 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.gallery-nav a {
  color: var(--link);
  text-decoration: none;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: var(--surface-muted);
  border: 1px solid var(--border);
}

.gallery-nav a:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.gallery-nav a[data-cat-done="true"] {
  opacity: 0.85;
  background: var(--reviewed-bg);
  border-color: var(--reviewed-border);
  color: var(--reviewed-fg);
}

.gallery-main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem 2rem 4rem;
}

.gallery-section-heading {
  font-family: var(--font-serif);
  font-size: 1.5rem;
  border-bottom: 2px solid var(--border-strong);
  padding-bottom: 0.4rem;
  margin: 2.25rem 0 1rem;
}

.category-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 1.15rem;
  margin: 1.75rem 0 0.75rem;
  color: var(--primary);
}

.category-heading-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  font-weight: normal;
}

.cat-progress {
  background: var(--badge-bg);
  color: var(--text-muted);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  border: 1px solid var(--border);
}

.cat-all-reviewed-banner {
  display: none;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0 1.25rem;
  background: var(--surface-muted);
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.88rem;
  font-style: italic;
}

body[data-hide-reviewed="true"] section[data-all-reviewed="true"] .cat-all-reviewed-banner {
  display: block;
}

body[data-hide-reviewed="true"] section[data-all-reviewed="true"] .kind-card {
  display: none;
}

.kind-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 1.25rem;
  overflow: hidden;
}

.kind-card-header {
  background: var(--surface-muted);
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
}

.kind-name {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 600;
}

.kind-badges {
  display: flex;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.badge {
  background: var(--badge-bg);
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-family: var(--font-mono);
}

.badge-candidate {
  background: var(--candidate-bg);
  color: var(--candidate-fg);
  font-weight: 600;
}

:is(.badge-status-changed, .diff-status-changed) {
  background: var(--diff-change-bg);
  color: var(--diff-change-fg);
  border: 1px solid var(--diff-change-border);
}

:is(.badge-status-newly-rendered, .diff-status-newly-rendered) {
  background: var(--diff-ins-bg);
  color: var(--diff-ins-fg);
  border: 1px solid var(--diff-ins-border);
}

:is(.badge-status-no-longer-rendered, .diff-status-no-longer-rendered) {
  background: var(--diff-del-bg);
  color: var(--diff-del-fg);
  border: 1px solid var(--diff-del-border);
}

:is(.badge-status-unpaired, .diff-status-unpaired) {
  background: var(--diff-unpaired-bg);
  color: var(--diff-unpaired-fg);
  border: 1px solid var(--diff-unpaired-border);
}

:is(.badge-citation-change, .diff-citation-change) {
  background: var(--diff-citation-bg);
  color: var(--diff-citation-fg);
  border: 1px solid var(--diff-citation-border);
}

.exemplar-list {
  display: flex;
  flex-direction: column;
}

.exemplar-item {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
}

.exemplar-item:last-child {
  border-bottom: none;
}

.exemplar-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.84rem;
}

.exemplar-link {
  color: var(--link);
  font-family: var(--font-mono);
  text-decoration: none;
  font-size: 0.8rem;
}

.exemplar-link:hover {
  text-decoration: underline;
}

.exemplar-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 900px) {
  .exemplar-grid {
    grid-template-columns: 1fr;
  }
}

.tei-snippet {
  margin: 0;
  padding: 0.65rem 0.8rem;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.reader-preview {
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  max-height: 28rem;
  overflow-y: auto;
  position: relative;
}

.reader-section.gallery-target,
.reader-preview .gallery-target {
  /* Normal reader colors with zero outline or background highlight */
}

/* ==========================================================================
   Core Reader Typography, Indentation & Apparatus Classes
   Scoped to .reader-passage and .reader-notes exactly as in production
   (src/web/ui/reader/reader_text.css & reader_notes.css)
   ========================================================================== */

.reader-passage {
  font-family: var(--font-text);
  font-size: var(--reader-base);
  line-height: 1.65;
  color: var(--reading-text);
}

.reader-paragraph {
  margin: 0;
  text-align: left;
}

.reader-section {
  display: grid;
  grid-template-columns: minmax(2.75rem, max-content) minmax(0, 1fr);
  gap: 0.85rem;
  align-items: baseline;
  padding: 0.1rem 0.25rem;
}

.reader-gutter {
  text-align: center;
  font-size: 0.82em;
  user-select: none;
}

.reader-gutter .section-anchor {
  color: var(--text-muted);
  text-decoration: none;
}

.reader-gutter .section-anchor.latent {
  opacity: 0.45;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-line,
:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-block {
  display: block;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-block {
  margin: 0;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .text-muted {
  color: var(--text-muted);
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .indent {
  display: block;
  padding-left: 1.5em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .indent-para {
  display: block;
  padding-left: 0;
  text-indent: 1.5em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .blockquote {
  display: block;
  margin: 0.4em 0 0.4em 1.5em;
  font-style: italic;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .center {
  display: block;
  text-align: center;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-subheading {
  font-family: var(--font-serif);
  font-size: 1em;
  font-weight: 600;
  text-align: center;
  margin: 0.6em 0 0.4em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-list {
  margin: 0.4em 0;
  padding-left: 1.5em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .italic {
  font-style: italic;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .bold {
  font-weight: 600;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .smallcaps {
  font-variant-caps: small-caps;
  letter-spacing: 0.02em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .uppercase {
  text-transform: uppercase;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .overline {
  text-decoration: overline;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .superscript {
  vertical-align: super;
  font-size: smaller;
  line-height: 0;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .line-space {
  display: block;
  height: 0.75em;
}

:is(.reader-passage, .reader-notes, .reader-translation-text) .reader-gap {
  font-style: italic;
  opacity: 0.7;
}

a.reader-note-ref {
  color: var(--text-muted);
  text-decoration: none;
  font-family: var(--font-sans);
  white-space: nowrap;
}

a.reader-note-ref sup {
  font-size: 0.75em;
  line-height: 0;
}

.reader-notes {
  margin-top: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--border);
  color: var(--text-muted);
  font-family: var(--font-text);
  font-size: 0.88rem;
  line-height: 1.55;
}

.reader-notes-heading,
.reader-notes-subheading {
  margin: 0 0 0.35rem;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.reader-notes-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.reader-note {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0.15rem 0;
}

.reader-note-backref {
  color: var(--link);
  text-align: right;
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.reader-note-body {
  min-width: 0;
}

/* ==========================================================================
   Per-Work Spot-Check Table & Cards
   ========================================================================== */

.work-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.work-table th,
.work-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.work-table th {
  background: var(--surface-muted);
  font-weight: 600;
}

.work-details {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 0.85rem;
  padding: 0.65rem 1rem;
}

.work-details summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.92rem;
}

.spot-pages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
  margin-top: 0.75rem;
}

.spot-page-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.65rem 0.8rem;
  background: var(--bg);
}

.spot-page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}

.review-toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-family: var(--font-sans);
  font-weight: normal;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.review-toggle-label input[type="checkbox"] {
  cursor: pointer;
  margin: 0;
}

.kind-card[data-reviewed="true"],
.kind-card.is-reviewed {
  border-color: var(--reviewed-border);
}

.kind-card[data-reviewed="true"] .kind-card-header,
.kind-card.is-reviewed .kind-card-header {
  background: var(--reviewed-bg);
  border-bottom: none;
  border-radius: 7px;
}

.kind-card[data-reviewed="true"] .exemplar-list,
.kind-card.is-reviewed .exemplar-list,
.kind-card[data-reviewed="true"] .kind-card-footer,
.kind-card.is-reviewed .kind-card-footer {
  display: none;
}

.kind-card-footer {
  background: var(--surface-muted);
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  border-bottom-left-radius: 7px;
  border-bottom-right-radius: 7px;
}

.work-details-footer {
  padding: 0.5rem 0.5rem 0.25rem;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  border-top: 1px solid var(--border);
  margin-top: 0.75rem;
}

.work-details[data-reviewed="true"],
.work-details.is-reviewed {
  border-color: var(--reviewed-border);
  background: var(--reviewed-surface);
}

.work-details[data-reviewed="true"] summary,
.work-details.is-reviewed summary {
  color: var(--reviewed-fg);
}

tr[data-reviewed="true"],
tr.is-reviewed {
  background: var(--reviewed-bg);
  color: var(--text-muted);
}

body[data-hide-reviewed="true"] .kind-card[data-reviewed="true"],
body[data-hide-reviewed="true"] .kind-card.is-reviewed,
body[data-hide-reviewed="true"] .work-details[data-reviewed="true"],
body[data-hide-reviewed="true"] .work-details.is-reviewed,
body[data-hide-reviewed="true"] tr[data-reviewed="true"],
body[data-hide-reviewed="true"] tr.is-reviewed {
  display: none;
}
`;

/** Formats the self-contained HTML review gallery (`index.html`). */
export function formatGalleryHtml(report: GalleryReport): string {
  const t = report.totals;
  const categories: MarkupCategory[] = [
    "element",
    "note-element",
    "rend",
    "note-rend",
    "attr",
    "layout",
  ];
  const failureEntries = Object.entries(report.failures).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  const navLinks: string[] = [];
  for (const cat of categories) {
    if (report.markupKinds?.some((k) => k.category === cat)) {
      navLinks.push(
        `<a href="#cat-${he.escape(cat)}">${CATEGORY_NAV_LABELS[cat]}</a>`
      );
    }
  }
  if ((report.works?.length ?? 0) > 0) {
    navLinks.push(
      `<a href="#spot-check-index">Per-Work Spot-Check Index (${t.worksProcessed})</a>`
    );
  }
  if (failureEntries.length > 0) {
    navLinks.push(
      `<a href="#failures">Failed Candidates (${failureEntries.length})</a>`
    );
  }

  const categorySectionsHtml = categories
    .map((cat, catIdx) => {
      const items = report.markupKinds.filter((k) => k.category === cat);
      if (items.length === 0) {
        return "";
      }
      const cardsHtml = items
        .map((k, kindIdx) => {
          const anchorId = kindAnchorId(k.kind, k.category);
          const examplesHtml = k.examples
            .map((ex, exIdx) => {
              const previewScope = `ex-${catIdx}-${kindIdx}-${exIdx}`;
              const scopedHtml = scopePreviewHtmlIds(
                sanitizeReaderHtmlFragment(ex.renderedHtml),
                previewScope
              );
              return `<div class="exemplar-item">
              <div class="exemplar-meta">
                <span><strong>${he.escape(ex.author)}</strong>, <em>${he.escape(
                ex.workTitle
              )}</em> (<code>${he.escape(
                ex.workId
              )}</code> &middot; page <code>${he.escape(
                ex.pageId
              )}</code> &middot; &sect;<code>${he.escape(
                ex.sectionId
              )}</code>)${
                ex.inNote ? ' <span class="badge">note</span>' : ""
              }</span>
                <a class="exemplar-link" href="${he.escape(
                  ex.readerUrl
                )}">${he.escape(ex.readerUrl)}</a>
              </div>
              <div class="exemplar-grid">
                <pre class="tei-snippet"><code>${he.escape(
                  ex.teiSnippet
                )}</code></pre>
                <div class="reader-preview reader-view">${scopedHtml}</div>
              </div>
            </div>`;
            })
            .join("\n");

          return `<article class="kind-card" id="${he.escape(
            anchorId
          )}" data-kind="${he.escape(k.kind)}" data-category="${he.escape(
            k.category
          )}" data-review-id="kind:${he.escape(k.category)}:${he.escape(
            k.kind
          )}">
          <header class="kind-card-header">
            <span class="kind-name">${he.escape(k.kind)}</span>
            <div class="kind-badges">
              <span class="badge">${he.escape(k.category)}</span>
              <span class="badge">${k.workCount} ${
            k.workCount === 1 ? "work" : "works"
          }</span>
              <span class="badge">${k.occurrenceCount}&times;</span>
              <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="kind:${he.escape(
                k.category
              )}:${he.escape(k.kind)}" /> Reviewed</label>
            </div>
          </header>
          <div class="exemplar-list">
            ${examplesHtml}
          </div>
          <footer class="kind-card-footer">
            <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="kind:${he.escape(
              k.category
            )}:${he.escape(k.kind)}" /> Reviewed</label>
          </footer>
        </article>`;
        })
        .join("\n");

      return `<section id="cat-${he.escape(cat)}">
        <h3 class="category-heading">
          <span>${he.escape(CATEGORY_TITLES[cat])} (${items.length})</span>
          <span class="category-heading-controls">
            <span class="cat-progress" data-cat-progress="${he.escape(
              cat
            )}">0 / ${items.length}</span>
            <button type="button" class="gallery-btn mark-cat-btn" data-mark-cat="${he.escape(
              cat
            )}">Mark section reviewed</button>
          </span>
        </h3>
        <div class="cat-all-reviewed-banner">All items in this section reviewed</div>
        ${cardsHtml}
      </section>`;
    })
    .filter(Boolean)
    .join("\n");

  const worksTableRowsHtml = report.works
    .map((w) => {
      const pageAnchor = (p?: GalleryPageSpotCheck) => {
        if (!p) return "&mdash;";
        const winStart = p.windowRange?.[0];
        const citeStart = p.citationRange[0];
        const suffix =
          winStart && winStart !== citeStart
            ? ` (&sect;${he.escape(winStart)})`
            : "";
        return `<a class="exemplar-link" href="${he.escape(
          p.readerUrl
        )}">${he.escape(p.pageId)}${suffix}</a>`;
      };
      return `<tr data-work-id="${he.escape(
        w.workId
      )}" data-review-id="work:${he.escape(w.workId)}">
        <td><label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="work:${he.escape(
          w.workId
        )}" /> Reviewed</label></td>
        <td><a class="exemplar-link" href="#work-${he.escape(
          w.workId
        )}"><code>${he.escape(w.workId)}</code></a></td>
        <td>${he.escape(w.author)}</td>
        <td>${he.escape(w.shortTitle ?? w.title)}</td>
        <td>${
          w.onboarded
            ? '<span class="badge">onboarded</span>'
            : '<span class="badge badge-candidate">candidate</span>'
        }</td>
        <td>${w.rowCount} (${w.citableRowCount})</td>
        <td>${w.pageCount}</td>
        <td>${pageAnchor(w.pages.first)}</td>
        <td>${pageAnchor(w.pages.middle)}</td>
        <td>${pageAnchor(w.pages.last)}</td>
        <td>${w.markupKinds.length}</td>
      </tr>`;
    })
    .join("\n");

  const worksCardsHtml = report.works
    .map((w, workIdx) => {
      const kindsListHtml = w.markupKinds
        .map((kName) => {
          const kObj = report.kindsByName[kName];
          const href = kObj
            ? `#${he.escape(kindAnchorId(kObj.kind, kObj.category))}`
            : "#markup-kinds";
          return `<a class="badge" href="${href}">${he.escape(kName)}</a>`;
        })
        .join(" ");

      const spotPagesHtml = w.spotCheckPages
        .map((p, pageIdx) => {
          const previewScope = `spot-${workIdx}-${pageIdx}`;
          const scopedHtml = scopePreviewHtmlIds(
            sanitizeReaderHtmlFragment(p.previewHtml),
            previewScope
          );
          const slotLabel = p.label ?? p.role.toUpperCase();
          const range = p.windowRange ?? p.citationRange;
          const reasonBadge = p.reason
            ? ` <span class="badge">${he.escape(p.reason)}</span>`
            : "";
          return `<div class="spot-page-card">
          <div class="spot-page-header">
            <span><strong>${he.escape(slotLabel)}</strong>: ${he.escape(
            p.title
          )} (<code>${he.escape(p.pageId)}</code>, &sect;${he.escape(
            range[0]
          )}&ndash;${he.escape(range[1])})${reasonBadge}</span>
            <a class="exemplar-link" href="${he.escape(
              p.readerUrl
            )}">${he.escape(p.readerUrl)}</a>
          </div>
          <div class="reader-preview reader-view">${scopedHtml}</div>
        </div>`;
        })
        .join("\n");

      return `<details class="work-details" id="work-${he.escape(
        w.workId
      )}" data-work-id="${he.escape(
        w.workId
      )}" data-review-id="work:${he.escape(w.workId)}">
        <summary>
          <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="work:${he.escape(
            w.workId
          )}" /> Reviewed</label>
          <code>${he.escape(w.workId)}</code> &mdash; ${he.escape(
        w.author
      )}, <em>${he.escape(w.shortTitle ?? w.title)}</em>
          ${
            w.onboarded
              ? '<span class="badge">onboarded</span>'
              : '<span class="badge badge-candidate">candidate</span>'
          }
          (${w.pageCount} pages, ${w.citableRowCount} citable rows, ${
        w.markupKinds.length
      } markup kinds)
        </summary>
        <p style="margin: 0.5rem 0; font-size: 0.82rem;"><strong>Markup kinds:</strong> ${kindsListHtml}</p>
        <div class="spot-pages-grid">
          ${spotPagesHtml}
        </div>
        <footer class="work-details-footer">
          <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="work:${he.escape(
            w.workId
          )}" /> Reviewed</label>
        </footer>
      </details>`;
    })
    .join("\n");

  const failuresSectionHtml =
    failureEntries.length > 0
      ? `<section id="failures">
      <h2 class="gallery-section-heading">3. Skipped / Failed Candidate Works (${
        failureEntries.length
      })</h2>
      <table class="work-table">
        <thead>
          <tr>
            <th>Work ID</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${failureEntries
            .map(
              ([workId, errMsg]) => `<tr>
            <td><code>${he.escape(workId)}</code></td>
            <td>${he.escape(errMsg)}</td>
          </tr>`
            )
            .join("\n")}
        </tbody>
      </table>
    </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Morcus Library Exemplar Review Gallery — ${he.escape(
    report.label
  )}</title>
  <style>${GALLERY_CSS}</style>
  <script>
    (function () {
      try {
        var t = localStorage.getItem("morcus-gallery-theme");
        var isDark =
          t === "dark" ||
          (!t &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
          document.documentElement.setAttribute("data-theme", "dark");
        } else if (t === "light") {
          document.documentElement.setAttribute("data-theme", "light");
        }
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <header class="gallery-header">
    <div class="gallery-header-top">
      <h1 class="gallery-title">Morcus Library Exemplar Review Gallery: <code>${he.escape(
        report.label
      )}</code></h1>
      <div class="gallery-meta">
        <span><strong>Works:</strong> ${t.worksProcessed} (${
    t.onboardedCount
  } onboarded, ${t.candidateCount} candidates${
    t.failedCount > 0 ? `, ${t.failedCount} skipped/failed` : ""
  })</span>
        <span><strong>Markup kinds:</strong> ${t.markupKindCount}</span>
        <span><strong>Max examples/kind:</strong> ${report.maxExamples}</span>
      </div>
    </div>
    <div class="gallery-controls">
      <span id="gallery-review-progress" class="gallery-progress-badge">Reviewed: 0 / ${
        t.markupKindCount
      } kinds &middot; 0 / ${t.worksProcessed} works</span>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-dark-mode" /> Dark mode</label>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-hide-reviewed" /> Hide reviewed</label>
      <button type="button" id="gallery-reset-reviewed" class="gallery-btn">Reset progress</button>
    </div>
    <nav class="gallery-nav" aria-label="Gallery navigation">${
      navLinks.length > 0 ? `\n      ${navLinks.join("\n      ")}\n    ` : ""
    }</nav>
  </header>
  <main class="gallery-main">
    <section id="markup-kinds">
      <h2 class="gallery-section-heading">1. Markup Kind Exemplars (${
        t.markupKindCount
      })</h2>
      ${categorySectionsHtml}
    </section>
    <section id="spot-check-index">
      <h2 class="gallery-section-heading">2. Per-Work Spot-Check Index (${
        t.worksProcessed
      } works)</h2>
      <table class="work-table">
        <thead>
          <tr>
            <th>Reviewed</th>
            <th>Work ID</th>
            <th>Author</th>
            <th>Title</th>
            <th>Status</th>
            <th>Rows (Citable)</th>
            <th>Pages</th>
            <th>First</th>
            <th>Middle</th>
            <th>Last</th>
            <th>Kinds</th>
          </tr>
        </thead>
        <tbody>
          ${worksTableRowsHtml}
        </tbody>
      </table>
      ${worksCardsHtml}
    </section>
    ${failuresSectionHtml}
  </main>
  <script>
    document.querySelectorAll(".reader-preview").forEach(function (preview) {
      if (preview.scrollHeight <= preview.clientHeight) return;
      var target = preview.querySelector(".gallery-target");
      if (target) {
        preview.scrollTop = Math.max(
          0,
          target.offsetTop - Math.floor(preview.clientHeight / 3)
        );
      }
    });

    function updateHeaderHeight() {
      var header = document.querySelector(".gallery-header");
      if (header) {
        document.documentElement.style.setProperty(
          "--gallery-header-h",
          (header.offsetHeight + 16) + "px"
        );
      }
    }
    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);
    if (typeof ResizeObserver !== "undefined") {
      var headerEl = document.querySelector(".gallery-header");
      if (headerEl) {
        new ResizeObserver(updateHeaderHeight).observe(headerEl);
      }
    }

    var GALLERY_LABEL = ${JSON.stringify(report.label).replace(
      /</g,
      "\\u003c"
    )};
    var storageKey = "morcus-gallery-reviewed:" + GALLERY_LABEL;
    var reviewedSet = new Set();

    function findReviewElements(id) {
      var results = [];
      var all = document.querySelectorAll("[data-review-id]");
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute("data-review-id") === id) {
          results.push(all[i]);
        }
      }
      return results;
    }

    // Stop propagation on summary click when clicking review toggle label inside summary
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest(".work-details > summary .review-toggle-label")) {
        e.stopPropagation();
      }
    }, true);

    function applyReviewedState(id, isReviewed) {
      if (isReviewed) {
        reviewedSet.add(id);
      } else {
        reviewedSet.delete(id);
      }

      var elements = findReviewElements(id);
      elements.forEach(function (el) {
        if (el.tagName === "INPUT" && el.type === "checkbox") {
          el.checked = isReviewed;
        } else {
          if (isReviewed) {
            el.setAttribute("data-reviewed", "true");
            el.classList.add("is-reviewed");
          } else {
            el.removeAttribute("data-reviewed");
            el.classList.remove("is-reviewed");
          }
        }
      });
    }

    function updateProgress() {
      var totalKinds = document.querySelectorAll(".kind-card").length;
      var reviewedKinds = document.querySelectorAll('.kind-card[data-reviewed="true"]').length;
      var totalWorks = document.querySelectorAll(".work-details").length;
      var reviewedWorks = document.querySelectorAll('.work-details[data-reviewed="true"]').length;

      var progressBadge = document.getElementById("gallery-review-progress");
      if (progressBadge) {
        progressBadge.textContent = "Reviewed: " + reviewedKinds + " / " + totalKinds + " kinds · " + reviewedWorks + " / " + totalWorks + " works";
      }

      // Update per-category progress
      document.querySelectorAll('section[id^="cat-"]').forEach(function (section) {
        var cat = section.id.slice(4);
        var catCards = section.querySelectorAll(".kind-card");
        var totalInCat = catCards.length;
        var reviewedInCat = section.querySelectorAll('.kind-card[data-reviewed="true"]').length;

        var catCounter = section.querySelector('.cat-progress[data-cat-progress="' + cat + '"]');
        if (catCounter) {
          catCounter.textContent = reviewedInCat + " / " + totalInCat;
        }

        var markBtn = section.querySelector('.mark-cat-btn[data-mark-cat="' + cat + '"]');
        var allDone = totalInCat > 0 && reviewedInCat === totalInCat;
        if (allDone) {
          section.setAttribute("data-all-reviewed", "true");
          if (markBtn) markBtn.textContent = "Unmark section";
        } else {
          section.removeAttribute("data-all-reviewed");
          if (markBtn) markBtn.textContent = "Mark section reviewed";
        }

        var navLink = document.querySelector('.gallery-nav a[href="#' + section.id + '"]');
        if (navLink) {
          if (!navLink.getAttribute("data-orig-text")) {
            navLink.setAttribute("data-orig-text", navLink.textContent);
          }
          var baseText = navLink.getAttribute("data-orig-text");
          if (allDone) {
            navLink.setAttribute("data-cat-done", "true");
            navLink.textContent = baseText + " ✓";
          } else {
            navLink.removeAttribute("data-cat-done");
            navLink.textContent = baseText;
          }
        }
      });

      var spotLink = document.querySelector('.gallery-nav a[href="#spot-check-index"]');
      if (spotLink) {
        if (!spotLink.getAttribute("data-orig-text")) {
          spotLink.setAttribute("data-orig-text", spotLink.textContent);
        }
        var baseSpot = spotLink.getAttribute("data-orig-text");
        if (totalWorks > 0 && reviewedWorks === totalWorks) {
          spotLink.setAttribute("data-cat-done", "true");
          spotLink.textContent = baseSpot + " ✓";
        } else {
          spotLink.removeAttribute("data-cat-done");
          spotLink.textContent = baseSpot;
        }
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(reviewedSet)));
      } catch (err) {}
    }

    // Load from localStorage
    try {
      var saved = localStorage.getItem(storageKey);
      if (saved) {
        var arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          arr.forEach(function (id) {
            applyReviewedState(id, true);
          });
        }
      }
      var savedHide = localStorage.getItem(storageKey + ":hide");
      if (savedHide === "true") {
        var hideCb = document.getElementById("gallery-hide-reviewed");
        if (hideCb) hideCb.checked = true;
        document.body.setAttribute("data-hide-reviewed", "true");
      }
    } catch (err) {}

    var THEME_KEY = "morcus-gallery-theme";
    var darkModeCheckbox = document.getElementById("gallery-dark-mode");
    function initGalleryTheme() {
      var savedTheme = null;
      try {
        savedTheme = localStorage.getItem(THEME_KEY);
      } catch (e) {}

      var isDark = false;
      if (savedTheme === "dark" || savedTheme === "light") {
        isDark = savedTheme === "dark";
        document.documentElement.setAttribute("data-theme", savedTheme);
        if (document.body) {
          document.body.setAttribute("data-theme", savedTheme);
        }
      } else {
        isDark = Boolean(
          window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
        );
        if (isDark) {
          document.documentElement.setAttribute("data-theme", "dark");
          if (document.body) {
            document.body.setAttribute("data-theme", "dark");
          }
        }
      }
      if (darkModeCheckbox) {
        darkModeCheckbox.checked = isDark;
      }
    }
    initGalleryTheme();

    if (darkModeCheckbox) {
      darkModeCheckbox.addEventListener("change", function () {
        var theme = darkModeCheckbox.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        if (document.body) {
          document.body.setAttribute("data-theme", theme);
        }
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (err) {}
      });
    }

    updateProgress();

    // Event listeners
    document.addEventListener("change", function (e) {
      var target = e.target;
      if (!target) return;
      if (target.classList && target.classList.contains("review-checkbox")) {
        var id = target.getAttribute("data-review-id");
        if (id) {
          applyReviewedState(id, target.checked);
          updateProgress();
        }
      } else if (target.id === "gallery-dark-mode") {
        var theme = target.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        if (document.body) {
          document.body.setAttribute("data-theme", theme);
        }
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (err) {}
      } else if (target.id === "gallery-hide-reviewed") {
        if (target.checked) {
          document.body.setAttribute("data-hide-reviewed", "true");
          try {
            localStorage.setItem(storageKey + ":hide", "true");
          } catch (err) {}
        } else {
          document.body.removeAttribute("data-hide-reviewed");
          try {
            localStorage.removeItem(storageKey + ":hide");
          } catch (err) {}
        }
      } else if (target.id === "gallery-highlight-diff") {
        if (target.checked) {
          document.body.setAttribute("data-highlight-diff", "true");
        } else {
          document.body.removeAttribute("data-highlight-diff");
        }
      }
    });

    function highlightTextDiff(bTextNode, aTextNode) {
      var bStr = bTextNode.nodeValue || "";
      var aStr = aTextNode.nodeValue || "";
      if (bStr === aStr) return;
      var p = 0;
      var minL = Math.min(bStr.length, aStr.length);
      while (p < minL && bStr.charAt(p) === aStr.charAt(p)) p++;
      var s = 0;
      while (s < minL - p && bStr.charAt(bStr.length - 1 - s) === aStr.charAt(aStr.length - 1 - s)) s++;

      function wrapMid(textNode, str, pref, suff) {
        var mid = str.slice(pref, str.length - suff);
        if (!mid) return;
        var frag = document.createDocumentFragment();
        if (pref > 0) frag.appendChild(document.createTextNode(str.slice(0, pref)));
        var mark = document.createElement("mark");
        mark.className = "diff-text-changed";
        mark.textContent = mid;
        frag.appendChild(mark);
        if (suff > 0) frag.appendChild(document.createTextNode(str.slice(str.length - suff)));
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
      }
      wrapMid(bTextNode, bStr, p, s);
      wrapMid(aTextNode, aStr, p, s);
    }

    function isBlockKind(kind) {
      if (!kind) return true;
      return kind === "p" || kind.indexOf("p@") === 0 || kind === "ab" || kind.indexOf("ab@") === 0;
    }

    function filterDomChildren(node, kind) {
      var list = Array.prototype.slice.call(node.childNodes);
      return list.filter(function (c) {
        if (c.nodeType === 1 && c.tagName === "P" && c.children.length === 0 && (!c.textContent || c.textContent.trim() === "")) {
          if (isBlockKind(kind)) {
            c.classList.add("diff-node-changed");
          }
          return false;
        }
        return true;
      });
    }

    function isInsertedHeadingSection(el) {
      return (
        el &&
        el.nodeType === 1 &&
        el.classList &&
        el.classList.contains("reader-section") &&
        !el.id &&
        Boolean(el.querySelector(".reader-subheading"))
      );
    }

    function alignSectionChildren(bList, aList) {
      var bHasHeading = bList.some(isInsertedHeadingSection);
      var aHasHeading = aList.some(isInsertedHeadingSection);
      if (!bHasHeading && aHasHeading) {
        var filteredA = [];
        for (var i = 0; i < aList.length; i++) {
          if (isInsertedHeadingSection(aList[i])) {
            aList[i].classList.add("diff-node-changed");
            if (
              i + 1 < aList.length &&
              aList[i + 1].nodeType === 3 &&
              (!aList[i + 1].nodeValue || aList[i + 1].nodeValue.trim() === "")
            ) {
              i++;
            }
            continue;
          }
          filteredA.push(aList[i]);
        }
        return [bList, filteredA];
      }
      return [bList, aList];
    }

    function diffDomPair(bNode, aNode, kind) {
      if (!bNode && !aNode) return;
      if (!bNode && aNode) {
        if (aNode.nodeType === 1) {
          aNode.classList.add("diff-node-changed");
        } else if (
          aNode.nodeType === 3 &&
          (aNode.nodeValue || "").trim() !== "" &&
          aNode.parentNode &&
          aNode.parentNode.nodeType === 1
        ) {
          aNode.parentNode.classList.add("diff-node-changed");
        }
        return;
      }
      if (bNode && !aNode) {
        if (bNode.nodeType === 1) {
          bNode.classList.add("diff-node-changed");
        } else if (
          bNode.nodeType === 3 &&
          (bNode.nodeValue || "").trim() !== "" &&
          bNode.parentNode &&
          bNode.parentNode.nodeType === 1
        ) {
          bNode.parentNode.classList.add("diff-node-changed");
        }
        return;
      }
      if (!bNode || !aNode) return;
      if (bNode.nodeType === 3 && aNode.nodeType === 3) {
        highlightTextDiff(bNode, aNode);
        return;
      }
      if (bNode.nodeType === 1 && aNode.nodeType === 1) {
        var isParagraphWrapperDiff =
          bNode.tagName === "P" && aNode.tagName === "P" && !isBlockKind(kind);
        if (
          !isParagraphWrapperDiff &&
          (bNode.tagName !== aNode.tagName || bNode.className !== aNode.className)
        ) {
          bNode.classList.add("diff-node-changed");
          aNode.classList.add("diff-node-changed");
        }
        var aligned = alignSectionChildren(
          filterDomChildren(bNode, kind),
          filterDomChildren(aNode, kind)
        );
        var bChildren = aligned[0];
        var aChildren = aligned[1];
        var maxC = Math.max(bChildren.length, aChildren.length);
        for (var i = 0; i < maxC; i++) {
          diffDomPair(bChildren[i], aChildren[i], kind);
        }
      } else {
        if (bNode.nodeType === 1) bNode.classList.add("diff-node-changed");
        if (aNode.nodeType === 1) aNode.classList.add("diff-node-changed");
      }
    }

    document.querySelectorAll(".exemplar-item").forEach(function (item) {
      var bScope = item.querySelector(".before-scope");
      var aScope = item.querySelector(".after-scope");
      if (!bScope || !aScope) return;
      var card = item.closest(".kind-card");
      var kind = card ? card.getAttribute("data-kind") : null;
      var inNote = item.getAttribute("data-in-note") === "true";
      var bRoot = inNote
        ? bScope.querySelector(".reader-notes") || bScope
        : kind
        ? bScope.querySelector(".reader-passage") || bScope
        : bScope;
      var aRoot = inNote
        ? aScope.querySelector(".reader-notes") || aScope
        : kind
        ? aScope.querySelector(".reader-passage") || aScope
        : aScope;
      diffDomPair(bRoot, aRoot, kind);
      if (!item.querySelector(".diff-node-changed, .diff-text-changed")) {
        item.querySelectorAll(".reader-block").forEach(function (el) {
          el.classList.add("diff-css-changed");
        });
      }
    });

    document.addEventListener("click", function (e) {
      var target = e.target;
      if (!target) return;
      if (target.classList && target.classList.contains("mark-cat-btn")) {
        var cat = target.getAttribute("data-mark-cat");
        if (!cat) return;
        var section = document.getElementById("cat-" + cat);
        if (!section) return;
        var cards = section.querySelectorAll(".kind-card");
        var allReviewed = section.getAttribute("data-all-reviewed") === "true";
        var setTo = !allReviewed;
        cards.forEach(function (card) {
          var id = card.getAttribute("data-review-id");
          if (id) {
            applyReviewedState(id, setTo);
          }
        });
        updateProgress();
      }
    });

    var resetBtn = document.getElementById("gallery-reset-reviewed");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var ids = Array.from(reviewedSet);
        ids.forEach(function (id) {
          applyReviewedState(id, false);
        });
        reviewedSet.clear();
        try {
          localStorage.removeItem(storageKey);
        } catch (err) {}
        updateProgress();
      });
    }
  </script>
</body>
</html>
`;
}

/**
 * Strips preview scoping prefixes (`ex-\d+-\d+-\d+-` and `spot-\d+-\d+-`)
 * so markup can be compared semantically across before and after reports.
 */
export function normalizePreviewHtml(html: string): string {
  return html.replace(/(?:ex|spot)-\d+(?:-\d+)+-/g, "").trim();
}

/**
 * Replaces footnote numbers in note references and note ids with `#`, so a
 * note added or dropped earlier on the page (which renumbers every later
 * note) does not count as a change to unrelated body markup.
 */
export function normalizeNoteRefNumbers(html: string): string {
  return html
    .replace(/\bnoteref-n\d+/g, "noteref-n#")
    .replace(/\bnote-n\d+/g, "note-n#")
    .replace(/(aria-label="(?:Back to )?[Nn]ote )\d+/g, "$1#")
    .replace(/\bdata-note-id="[^"]*"/g, 'data-note-id="#"')
    .replace(/>\[\d+\]</g, ">[#]<");
}

const READER_LINE_OPEN_RE = /^<span\b[^>]*\bclass="reader-line\b/;
const READER_LINE_COUNT_RE = /<span\b[^>]*\bclass="reader-line\b/g;
const VOID_HTML_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
/** Marks Before lines trimmed by `alignBeforeLinesToAfter`. */
export const ELIDED_LINES_HTML =
  '<span class="reader-line gallery-elided">…</span>';

interface MiniHtmlNode {
  open: string;
  close: string;
  children: Array<MiniHtmlNode | string>;
  isLine: boolean;
  /** Appended after `close` when serializing. */
  after?: string;
}

/** A forgiving tag-balanced parse of reader HTML, enough to drop subtrees. */
function parseMiniHtml(html: string): MiniHtmlNode {
  const root: MiniHtmlNode = {
    open: "",
    close: "",
    children: [],
    isLine: false,
  };
  const stack: Array<{ node: MiniHtmlNode; name: string }> = [
    { node: root, name: "" },
  ];
  for (const tok of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    const top = stack[stack.length - 1].node;
    const tag = tok.match(/^<(\/?)([a-zA-Z][\w-]*)/);
    if (!tag) {
      top.children.push(tok);
      continue;
    }
    const name = tag[2].toLowerCase();
    if (tag[1] === "/") {
      const idx = stack.map((s) => s.name).lastIndexOf(name);
      if (idx <= 0) {
        top.children.push(tok);
        continue;
      }
      stack[idx].node.close = tok;
      stack.length = idx;
      continue;
    }
    if (VOID_HTML_ELEMENTS.has(name) || tok.endsWith("/>")) {
      top.children.push(tok);
      continue;
    }
    const node: MiniHtmlNode = {
      open: tok,
      close: "",
      children: [],
      isLine: READER_LINE_OPEN_RE.test(tok),
    };
    top.children.push(node);
    stack.push({ node, name });
  }
  return root;
}

function serializeMiniHtml(node: MiniHtmlNode | string): string {
  if (typeof node === "string") return node;
  return (
    node.open +
    node.children.map(serializeMiniHtml).join("") +
    node.close +
    (node.after ?? "")
  );
}

function collectMiniLines(node: MiniHtmlNode, out: MiniHtmlNode[]): void {
  for (const child of node.children) {
    if (typeof child === "string") continue;
    if (child.isLine) {
      out.push(child);
    } else {
      collectMiniLines(child, out);
    }
  }
}

function splitPassageAndNotes(html: string): {
  passage: string;
  notes?: string;
} {
  const asideIdx = html.indexOf('<aside class="reader-notes"');
  return asideIdx >= 0
    ? { passage: html.slice(0, asideIdx).trim(), notes: html.slice(asideIdx) }
    : { passage: html };
}

/**
 * When After split a multi-line container into per-line rows (e.g. a poem
 * that was one `<div class="reader-section">` is now one row per line), the
 * After preview shows a few lines while Before shows the whole poem. Trims
 * Before's `reader-line`s to the window of lines After shows, ending with
 * `ELIDED_LINES_HTML`, so the preview and markup diff don't report the rest
 * of the poem as deleted.
 *
 * Returns `undefined` when Before needs no trimming: After has no lines, or
 * no single Before section has more lines than the whole After preview, or
 * Before has fewer than 4 lines more than After.
 */
export function alignBeforeLinesToAfter(
  beforeHtml: string,
  afterHtml: string
): string | undefined {
  const before = splitPassageAndNotes(beforeHtml);
  const after = splitPassageAndNotes(afterHtml);
  const afterRoot = parseMiniHtml(after.passage);
  const afterLines: MiniHtmlNode[] = [];
  collectMiniLines(afterRoot, afterLines);
  const beforeRoot = parseMiniHtml(before.passage);
  const beforeLines: MiniHtmlNode[] = [];
  collectMiniLines(beforeRoot, beforeLines);
  const maxBeforeLinesPerSection = Math.max(
    0,
    ...splitPageSectionHtmls(before.passage).map(
      (sec) => sec.match(READER_LINE_COUNT_RE)?.length ?? 0
    )
  );
  if (
    afterLines.length === 0 ||
    beforeLines.length < afterLines.length + 4 ||
    maxBeforeLinesPerSection <= afterLines.length
  ) {
    return undefined;
  }

  const lineText = (line: MiniHtmlNode) =>
    compactText(renderedRowText(serializeMiniHtml(line)));
  const beforeTexts = beforeLines.map(lineText);
  const matched: number[] = [];
  let from = 0;
  for (const text of afterLines.map(lineText)) {
    if (text.length === 0) continue;
    const idx = beforeTexts.indexOf(text, from);
    if (idx >= 0) {
      matched.push(idx);
      from = idx + 1;
    }
  }
  let start = matched.length > 0 ? matched[0] : 0;
  let end =
    matched.length > 0
      ? matched[matched.length - 1]
      : Math.min(beforeLines.length, afterLines.length) - 1;
  if (end - start + 1 > afterLines.length + 2) {
    end = start + afterLines.length - 1;
  }
  start = Math.max(0, start);
  const kept = new Set(beforeLines.slice(start, end + 1));

  // Keeps lines in the window, containers holding a kept line, and other
  // content only where no dropped line precedes or follows it among its
  // siblings (so a label between two kept lines stays, a heading before the
  // window goes).
  const hasLines = (n: MiniHtmlNode | string) =>
    typeof n !== "string" && (n.isLine || n.children.some(hasLines));
  const prune = (node: MiniHtmlNode): boolean => {
    const status = node.children.map((child) => {
      if (typeof child === "string" || !hasLines(child)) return "none";
      if (child.isLine) return kept.has(child) ? "kept" : "dropped";
      return prune(child) ? "kept" : "dropped";
    });
    const keptChildren: Array<MiniHtmlNode | string> = [];
    for (let i = 0; i < node.children.length; i++) {
      if (status[i] === "kept") {
        keptChildren.push(node.children[i]);
        continue;
      }
      if (status[i] === "dropped") continue;
      let prev = "none";
      for (let j = i - 1; j >= 0 && prev === "none"; j--) prev = status[j];
      let next = "none";
      for (let j = i + 1; j < status.length && next === "none"; j++) {
        next = status[j];
      }
      if (prev !== "dropped" && next !== "dropped") {
        keptChildren.push(node.children[i]);
      }
    }
    node.children = keptChildren;
    return status.includes("kept");
  };
  prune(beforeRoot);
  if (end < beforeLines.length - 1) {
    beforeLines[end].after = ELIDED_LINES_HTML;
  }
  const passage = serializeMiniHtml(beforeRoot).trim();
  return joinPassageAndNotesHtml(
    passage,
    before.notes !== undefined
      ? filterNotesHtmlToRefs(passage, before.notes)
      : undefined
  );
}

/**
 * Scopes standard CSS rule blocks under a prefix selector (e.g. `.before-scope`).
 */
export function scopeCssRules(css: string, prefix: string): string {
  if (!css || css.trim().length === 0) return "";
  return css.replace(
    /([^{};]+)\{([^}]+)\}/g,
    (match, selector, declarations) => {
      const trimmed = selector.trim();
      if (
        trimmed.startsWith("@") ||
        trimmed.startsWith(":root") ||
        trimmed.startsWith("from") ||
        trimmed.startsWith("to") ||
        /^\d+%/.test(trimmed)
      ) {
        return match;
      }
      const scopedSelectors = trimmed
        .split(",")
        .map((s: string) => `${prefix} ${s.trim()}`)
        .join(", ");
      return `${scopedSelectors} {${declarations}}`;
    }
  );
}

function tokenizeHtmlForDiff(html: string): string[] {
  if (!html) return [];
  return html.match(/<[^>]+>|\s+|[^\s<]+/g) ?? [];
}

interface HtmlDiffOpEq {
  type: "eq";
  tokens: string[];
}

interface HtmlDiffOpDiff {
  type: "diff";
  b: string[];
  a: string[];
  prevTokens: string[];
  nextTokens: string[];
}

type HtmlDiffOp = HtmlDiffOpEq | HtmlDiffOpDiff;

function computeHtmlDiffOps(
  beforeHtml: string,
  afterHtml: string
): HtmlDiffOp[] {
  const bTokens = tokenizeHtmlForDiff(beforeHtml);
  const aTokens = tokenizeHtmlForDiff(afterHtml);
  const ops: HtmlDiffOp[] = [];

  let i = 0;
  let j = 0;
  const ANCHOR_LEN = 3;
  const MAX_LOOKAHEAD = 160;

  const matchesAnchor = (bi: number, aj: number): boolean => {
    if (bi + ANCHOR_LEN > bTokens.length || aj + ANCHOR_LEN > aTokens.length) {
      return false;
    }
    for (let k = 0; k < ANCHOR_LEN; k++) {
      if (bTokens[bi + k] !== aTokens[aj + k]) return false;
    }
    return true;
  };

  while (i < bTokens.length || j < aTokens.length) {
    if (i < bTokens.length && j < aTokens.length && bTokens[i] === aTokens[j]) {
      const eqStart = i;
      while (
        i < bTokens.length &&
        j < aTokens.length &&
        bTokens[i] === aTokens[j]
      ) {
        i++;
        j++;
      }
      ops.push({ type: "eq", tokens: bTokens.slice(eqStart, i) });
      continue;
    }

    // Look ahead for the nearest 3-token resync anchor
    let foundBi = -1;
    let foundAj = -1;
    const maxDist = Math.min(
      MAX_LOOKAHEAD,
      Math.max(bTokens.length - i, aTokens.length - j)
    );
    outer: for (let dist = 1; dist <= maxDist; dist++) {
      for (let db = 0; db <= dist; db++) {
        const da = dist - db;
        if (matchesAnchor(i + db, j + da)) {
          foundBi = i + db;
          foundAj = j + da;
          break outer;
        }
      }
    }

    if (foundBi >= 0 && foundAj >= 0) {
      ops.push({
        type: "diff",
        b: bTokens.slice(i, foundBi),
        a: aTokens.slice(j, foundAj),
        prevTokens: bTokens.slice(Math.max(0, i - 4), i),
        nextTokens: bTokens.slice(foundBi, foundBi + 4),
      });
      i = foundBi;
      j = foundAj;
    } else {
      // Compare common suffix on the remainder
      let suffix = 0;
      while (
        suffix < bTokens.length - i &&
        suffix < aTokens.length - j &&
        bTokens[bTokens.length - 1 - suffix] ===
          aTokens[aTokens.length - 1 - suffix]
      ) {
        suffix++;
      }
      ops.push({
        type: "diff",
        b: bTokens.slice(i, bTokens.length - suffix),
        a: aTokens.slice(j, aTokens.length - suffix),
        prevTokens: bTokens.slice(Math.max(0, i - 4), i),
        nextTokens: bTokens.slice(
          bTokens.length - suffix,
          bTokens.length - suffix + 4
        ),
      });
      if (suffix > 0) {
        ops.push({
          type: "eq",
          tokens: bTokens.slice(bTokens.length - suffix),
        });
      }
      break;
    }
  }

  // Slide pure insertions/deletions left across identical trailing tokens of
  // the preceding `eq` run so tag-bounded insertions (e.g. an inserted `<h3>`
  // before another `<h3>`) start on the opening tag boundary.
  for (let idx = 1; idx < ops.length; idx++) {
    const prev = ops[idx - 1];
    const cur = ops[idx];
    if (prev.type !== "eq" || cur.type !== "diff") continue;
    const isPureIns = cur.b.length === 0 && cur.a.length > 0;
    const isPureDel = cur.a.length === 0 && cur.b.length > 0;
    if (!isPureIns && !isPureDel) continue;
    const side = isPureIns ? cur.a : cur.b;
    const shifted: string[] = [];
    while (
      prev.tokens.length > 0 &&
      side.length > 0 &&
      prev.tokens[prev.tokens.length - 1] === side[side.length - 1]
    ) {
      const tok = side.pop()!;
      prev.tokens.pop();
      side.unshift(tok);
      shifted.unshift(tok);
    }
    if (shifted.length > 0) {
      const next = ops[idx + 1];
      if (next && next.type === "eq") {
        next.tokens.unshift(...shifted);
      } else {
        ops.splice(idx + 1, 0, { type: "eq", tokens: shifted });
      }
    }
  }

  return ops.filter((op) => op.type !== "eq" || op.tokens.length > 0);
}

function stripParagraphWrappers(s: string): string {
  return s
    .replace(/<\/?p(?:\s+[^>]*)?>/g, "")
    .replace(/<span class="indent indent-para">/g, "")
    .replace(/<\/span>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Determines whether a specific HTML diff op actually pertains to the cited
 * `kind` and `teiSnippet` of a gallery exemplar, rather than being a collateral
 * change to another element in the same section or footnote.
 */
function isDiffOpRelevantToExemplar(
  op: HtmlDiffOpDiff,
  kind: string,
  teiSnippet: string,
  inNote: boolean
): boolean {
  const bStr = op.b.join("");
  const aStr = op.a.join("");
  const prevStr = op.prevTokens.join("");
  const nextStr = op.nextTokens.join("");
  const combined = `${bStr} ${aStr}`;

  if (inNote) {
    // 1. Space before superscript/subscript removed
    if (
      bStr.trim() === "" &&
      aStr.trim() === "" &&
      (nextStr.includes('class="superscript"') || nextStr.includes("<sub"))
    ) {
      return (
        kind.includes("sup") || kind.includes("super") || kind.includes("sub")
      );
    }
    // 2. Space inserted for <pb/> in note
    if (bStr === "" && aStr.trim() === "" && aStr.length > 0) {
      return kind === "note:pb" || kind.startsWith("note:pb@");
    }
    // 3. [gap] -> reader-gap in note
    if (combined.includes("[gap]") || combined.includes("reader-gap")) {
      return kind === "note:gap" || kind.startsWith("note:gap@");
    }
    // 4. <span class="smallcaps"> -> <span class="smallcaps overline">
    if (combined.includes("overline") && combined.includes("smallcaps")) {
      return (
        (kind === "note:num" ||
          (kind.startsWith("note:num@") && kind.includes("overline"))) &&
        teiSnippet.includes("overline")
      );
    }
    // 5. <p class="reader-block"> -> <span class="reader-line"> in note verse
    if (combined.includes("reader-line") && combined.includes("reader-block")) {
      return (
        kind === "note:l" ||
        kind.startsWith("note:l@") ||
        kind === "note:quote" ||
        kind.startsWith("note:quote@")
      );
    }
    // 6. <emph> in note -> <span class="italic">
    if (combined.includes('class="italic"')) {
      return kind === "note:emph" || kind.startsWith("note:emph@");
    }
    return kind === "note" || kind.startsWith("note@");
  }

  // Body exemplar:
  // 1. Pure paragraph / reader-block / indent-para wrapper change
  if (stripParagraphWrappers(bStr) === stripParagraphWrappers(aStr)) {
    return (
      kind === "p" ||
      kind.startsWith("p@") ||
      kind === "ab" ||
      kind.startsWith("ab@")
    );
  }

  // 2. Speaker label <strong> -> <strong class="smallcaps">
  const stripStrong = (s: string) =>
    stripParagraphWrappers(s.replace(/<\/?strong(?:\s+[^>]*)?>/g, ""));
  if (combined.includes("<strong") && stripStrong(bStr) === stripStrong(aStr)) {
    return (
      (kind === "label" ||
        kind.startsWith("label@") ||
        kind === "dialogue-speaker" ||
        kind === "said") &&
      teiSnippet.includes("smallcaps")
    );
  }

  // 3. Blockquote outer quote “ or ” removed
  const stripQuotes = (s: string) =>
    stripParagraphWrappers(s.replace(/[“”]/g, ""));
  if (
    (bStr.includes("“") ||
      bStr.includes("”") ||
      aStr.includes("“") ||
      aStr.includes("”")) &&
    stripQuotes(bStr) === stripQuotes(aStr)
  ) {
    return (
      ((kind === "quote" ||
        (kind.startsWith("quote@") && kind.includes("blockquote"))) &&
        (teiSnippet.includes("align(blockquote)") ||
          teiSnippet.includes("blockquote"))) ||
      kind === "embedded-verse"
    );
  }

  // 4. Book/division <head> (<h3 class="reader-subheading">...</h3>)
  if (
    combined.includes("reader-subheading") ||
    prevStr.includes("reader-subheading") ||
    nextStr.includes("reader-subheading")
  ) {
    return kind === "head" || kind.startsWith("head@");
  }

  // 5. Greek Beta Code conversion (ASCII -> Greek Unicode)
  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(aStr)) {
    const baseTag = kind.split("@")[0];
    return (
      (baseTag === "quote" ||
        baseTag === "cit" ||
        baseTag === "bibl" ||
        baseTag === "foreign") &&
      (teiSnippet.includes("grc") || teiSnippet.includes("greek"))
    );
  }

  // 6. Verse stanza wrapper (<div class="reader-lg">...</div>) change is only relevant to lg
  if (combined.includes("reader-lg")) {
    const stripLgWrapper = (s: string) =>
      s.replace(/<\/?div(?:\s+class="reader-lg")?>/g, "").trim();
    if (stripLgWrapper(bStr) === stripLgWrapper(aStr)) {
      const baseTag = kind.split("@")[0];
      return baseTag === "lg";
    }
  }

  return true;
}

/**
 * Produces token-highlighted HTML strings for Before and After HTML snippets,
 * wrapping changed tokens in `<mark class="diff-token-del">` / `<mark class="diff-token-ins">`
 * and collapsing unchanged runs longer than 16 tokens to `<span class="diff-ellipsis"> … </span>`.
 * When `isOpRelevant` is provided, collateral diff ops where `isOpRelevant(op)` is false
 * are folded into the surrounding unchanged context so only the exemplar's own change is highlighted.
 */
function formatHtmlDiffPair(
  beforeHtml: string,
  afterHtml: string,
  isOpRelevant?: (op: HtmlDiffOpDiff) => boolean
): { beforeRichHtml: string; afterRichHtml: string } {
  // Unhighlighted runs keep each side's own tokens: a folded collateral op
  // shows its Before tokens in the Before pane and its After tokens in the
  // After pane, never one side's tokens in both.
  type PlainRun = { type: "plain"; b: string[]; a: string[] };
  const ops: Array<PlainRun | HtmlDiffOpDiff> = [];
  for (const op of computeHtmlDiffOps(beforeHtml, afterHtml)) {
    const plain =
      op.type === "eq" || (isOpRelevant !== undefined && !isOpRelevant(op));
    if (plain) {
      const b = op.type === "eq" ? op.tokens : op.b;
      const a = op.type === "eq" ? op.tokens : op.a;
      const last = ops[ops.length - 1];
      if (last && last.type === "plain") {
        last.b.push(...b);
        last.a.push(...a);
      } else {
        ops.push({ type: "plain", b: [...b], a: [...a] });
      }
    } else {
      ops.push(op);
    }
  }

  const CONTEXT_TOKENS = 8;
  const bParts: string[] = [];
  const aParts: string[] = [];
  const esc = (toks: string[]) => toks.map((t) => he.escape(t)).join("");

  /** Renders one side of an unhighlighted run, collapsing long stretches. */
  const plainSide = (toks: string[], isFirst: boolean, isLast: boolean) => {
    if (isFirst && isLast) {
      // Identical (CSS-only change): show up to 24 tokens
      const ell =
        toks.length > 24 ? '<span class="diff-ellipsis"> …</span>' : "";
      return esc(toks.slice(0, 24)) + ell;
    }
    if (isFirst) {
      const ell =
        toks.length > CONTEXT_TOKENS
          ? '<span class="diff-ellipsis">… </span>'
          : "";
      return ell + esc(toks.slice(Math.max(0, toks.length - CONTEXT_TOKENS)));
    }
    if (isLast) {
      const ell =
        toks.length > CONTEXT_TOKENS
          ? '<span class="diff-ellipsis"> …</span>'
          : "";
      return esc(toks.slice(0, CONTEXT_TOKENS)) + ell;
    }
    if (toks.length > CONTEXT_TOKENS * 2) {
      return `${esc(
        toks.slice(0, CONTEXT_TOKENS)
      )}<span class="diff-ellipsis"> … </span>${esc(
        toks.slice(toks.length - CONTEXT_TOKENS)
      )}`;
    }
    return esc(toks);
  };

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type === "plain") {
      const isFirst = idx === 0;
      const isLast = idx === ops.length - 1;
      bParts.push(plainSide(op.b, isFirst, isLast));
      aParts.push(plainSide(op.a, isFirst, isLast));
    } else {
      if (op.b.length > 0) {
        bParts.push(`<mark class="diff-token-del">${esc(op.b)}</mark>`);
      }
      if (op.a.length > 0) {
        aParts.push(`<mark class="diff-token-ins">${esc(op.a)}</mark>`);
      }
    }
  }

  return {
    beforeRichHtml: bParts.join(""),
    afterRichHtml: aParts.join(""),
  };
}

export type DiffExemplarStatus =
  | "changed"
  | "newly-rendered"
  | "no-longer-rendered"
  | "unpaired";

export interface DiffExemplarItem {
  /** The kind whose card shows this exemplar. */
  kind: string;
  author: string;
  workTitle: string;
  workId: string;
  sectionId: string;
  pageId: string;
  readerUrl: string;
  teiSnippet: string;
  beforeHtml: string;
  afterHtml: string;
  diffBeforeHtml: string;
  diffAfterHtml: string;
  inNote: boolean;
  markupChanged: boolean;
  /** The reader stylesheet differs and this exemplar uses `.reader-block`. */
  cssChanged: boolean;
  /** False when there is no Before HTML to compare against. */
  paired: boolean;
  /** Lifecycle status of this exemplar between Before and After. */
  status: DiffExemplarStatus;
  /** Non-empty when section citation IDs split or changed (e.g. `§31 → §31.18–31.19`). */
  citationIdChange?: string;
  /** Other kinds whose exemplar is this same passage (shown once). */
  alsoKinds: string[];
}

export interface DiffKindCard {
  kind: string;
  category: MarkupCategory;
  changedExemplars: DiffExemplarItem[];
}

/**
 * An After exemplar whose work, or whose kind, the Before gallery doesn't
 * have at all: new coverage rather than a change, so there is nothing to diff.
 */
export interface DiffNewCoverageItem {
  kinds: string[];
  category: MarkupCategory;
  reason: "work" | "kind";
  exemplar: GalleryExemplar;
  previewHtml: string;
}

export interface GalleryDiffOptions {
  /**
   * `library render` output (directory with `index.json`) of the Before
   * pipeline. With `afterRenderDir`, exemplars on a page whose HTML and notes
   * are byte-identical in both renders are dropped.
   */
  beforeRenderDir?: string;
  /** `library render` output of the After pipeline. */
  afterRenderDir?: string;
}

/** Why exemplars were left out of Section 1, shown in its heading. */
interface DiffExemplarFilterCounts {
  nonRendering: number;
  identicalRender: number;
  unchangedSpotCheck: number;
  unchangedTargetRows: number;
  unchangedOnPage: number;
  contextOnly: number;
  spacerArtifact: number;
  duplicates: number;
}

/**
 * Returns true for TEI marker kinds (`milestone*`, `lb`, `pb`) that do not
 * emit visible semantic wrapper elements in the reader DOM.
 */
export function isNonRenderingMarkerKind(kind: string): boolean {
  const base = kind.split("@")[0];
  return base === "milestone" || base === "lb" || base === "pb";
}

function unwrapSectionChrome(secHtml: string, keepLgWrapper = false): string {
  const openMatch =
    /^<div class="reader-section(?:\s+([^"]*))?"(?:\s+id="[^"]*")?>\s*<div class="reader-gutter">[\s\S]*?<\/div>\s*<div class="reader-passage">/.exec(
      secHtml
    );
  const extraClasses = (openMatch?.[1] ?? "")
    .split(/\s+/)
    .filter(
      (c) =>
        c.length > 0 &&
        c !== "gallery-target" &&
        c !== "section-verse" &&
        c !== "section-prose"
    )
    .join(" ");
  let inner = secHtml
    .replace(
      /^<div class="reader-section(?:\s+[^"]*)?"(?:\s+id="[^"]*")?>\s*<div class="reader-gutter">[\s\S]*?<\/div>\s*<div class="reader-passage">/,
      ""
    )
    .replace(/<\/div>\s*<\/div>\s*$/, "")
    .trim();
  if (!keepLgWrapper) {
    const lgMatch = /^<div class="reader-lg">\s*([\s\S]*?)\s*<\/div>$/.exec(
      inner
    );
    if (lgMatch && !lgMatch[1].includes("</div>")) {
      inner = lgMatch[1].trim();
    }
  }
  return extraClasses ? `<div class="${extraClasses}">${inner}</div>` : inner;
}

/**
 * Strips section citation wrappers (`.reader-section`, `id="sec-..."`,
 * `.reader-gutter`, `.reader-passage`, `gallery-target`, `gallery-elided`)
 * so that citation-gutter splits do not drown out node-level HTML diffs or
 * trigger context-only false positives.
 */
export function normalizeCitationChrome(
  html: string,
  ignoreNoteNumbers: boolean,
  keepLgWrapper = false
): string {
  const withoutElided = html.split(ELIDED_LINES_HTML).join("");
  const secs = splitPageSectionHtmls(withoutElided);
  const body =
    secs.length > 0
      ? secs.map((s) => unwrapSectionChrome(s, keepLgWrapper)).join("\n")
      : withoutElided.trim();
  let norm = normalizePreviewHtml(body).replace(
    /\bclass="(?:gallery-target\s+reader-note|reader-note\s+gallery-target)"/g,
    'class="reader-note"'
  );
  if (ignoreNoteNumbers) {
    norm = normalizeNoteRefNumbers(norm);
  }
  return norm.replace(/>\s*\n\s*</g, ">\n<").trim();
}

function extractRowSecId(rowHtml: string): string | undefined {
  const m = /^<div class="reader-section(?:\s+[^"]*)?"\s+id="sec-([^"]+)"/.exec(
    rowHtml.trim()
  );
  return m?.[1];
}

function extractSectionIds(html: string): string[] {
  const ids: string[] = [];
  for (const sec of splitPageSectionHtmls(html)) {
    const id = extractRowSecId(sec);
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function formatCitationRange(ids: string[]): string {
  if (ids.length === 0) return "";
  if (ids.length === 1) return `§${ids[0]}`;
  return `§${ids[0]}–${ids[ids.length - 1]}`;
}

function computeCitationIdChange(
  beforeHtml: string,
  afterHtml: string
): string | undefined {
  const bIds = extractSectionIds(beforeHtml);
  const aIds = extractSectionIds(afterHtml);
  if (bIds.length === 0 && aIds.length === 0) return undefined;
  if (bIds.length === 0) return `unanchored → ${formatCitationRange(aIds)}`;
  if (aIds.length === 0) return `${formatCitationRange(bIds)} → unanchored`;
  const bFmt = formatCitationRange(bIds);
  const aFmt = formatCitationRange(aIds);
  return bFmt !== aFmt ? `${bFmt} → ${aFmt}` : undefined;
}

interface LocatedRenderWindow {
  status: "matched" | "missing-target";
  html: string;
}

/**
 * Locates the passage/note window for `ex` directly from a `library render`
 * directory (`<renderDir>/<workId>/<pageId>.html` and `.notes.html`).
 *
 * - Returns `{ status: "matched", html }` when the target row or note item is
 *   found on the rendered page.
 * - Returns `{ status: "missing-target", html }` when the page exists and the
 *   surrounding context rows match, but the target row/note itself is absent
 *   (e.g. a newly rendered `<head>` title on page 1, or a dropped note).
 * - Returns `undefined` when the work or page is not in `renderDir`.
 */
export function makeRenderWindowLocator(
  renderDir: string
): (ex: GalleryExemplar, inNote: boolean) => LocatedRenderWindow | undefined {
  const index: RenderIndex = readRenderIndex(renderDir);
  const pageCache = new Map<
    string,
    { sections: string[]; notesHtml?: string } | null
  >();

  const loadPage = (workId: string, pageId: string) => {
    const key = `${workId}\u0000${pageId}`;
    if (pageCache.has(key)) {
      return pageCache.get(key) ?? undefined;
    }
    const work = index.works[workId];
    const page =
      work?.pages.find((p) => p.id === pageId) ??
      (work?.pages.length === 1 ? work.pages[0] : undefined);
    if (!work || !page) {
      pageCache.set(key, null);
      return undefined;
    }
    const stem = page.file || pageFileStem(pageId);
    const htmlPath = path.join(renderDir, workId, `${stem}.html`);
    if (!fs.existsSync(htmlPath)) {
      pageCache.set(key, null);
      return undefined;
    }
    const rawHtml = fs.readFileSync(htmlPath, "utf8");
    const notesPath = path.join(renderDir, workId, `${stem}.notes.html`);
    const notesHtml = fs.existsSync(notesPath)
      ? fs.readFileSync(notesPath, "utf8")
      : undefined;
    const loaded = {
      sections: splitPageSectionHtmls(rawHtml),
      notesHtml,
    };
    pageCache.set(key, loaded);
    return loaded;
  };

  const addTargetClass = (rowHtml: string): string =>
    rowHtml.includes("gallery-target")
      ? rowHtml
      : rowHtml.replace(
          /^<div class="reader-section\b/,
          '<div class="reader-section gallery-target'
        );

  const matchRowIndex = (
    sections: string[],
    row: string,
    fallbackSecId?: string
  ): number => {
    const rowId = extractRowSecId(row) ?? fallbackSecId;
    if (rowId) {
      const idx = sections.findIndex((s) => extractRowSecId(s) === rowId);
      if (idx >= 0) return idx;
    }
    const fullText = compactText(renderedRowText(row));
    if (fullText.length > 0) {
      const exactIdx = sections.findIndex(
        (s) => compactText(renderedRowText(s)) === fullText
      );
      if (exactIdx >= 0) return exactIdx;
    }
    const needle = fullText.slice(0, 48);
    if (needle.length >= 12) {
      const idx = sections.findIndex((s) =>
        compactText(renderedRowText(s)).includes(needle)
      );
      if (idx >= 0) return idx;
    }
    if (rowId && rowId.includes(".")) {
      const parts = rowId.split(".");
      for (let len = parts.length - 1; len >= 1; len--) {
        const prefix = parts.slice(0, len).join(".");
        const idx = sections.findIndex((s) => extractRowSecId(s) === prefix);
        if (idx >= 0) return idx;
      }
    }
    return -1;
  };

  return (ex, inNote) => {
    const loaded = loadPage(ex.workId, ex.pageId);
    if (!loaded) return undefined;
    const { sections, notesHtml } = loaded;
    const { passage: exPassage, notes: exNotes } = splitPassageAndNotes(
      ex.renderedHtml
    );
    const exRows = splitPageSectionHtmls(exPassage);
    const targetRows = exRows.filter((r) => r.includes("gallery-target"));
    const contextRows = exRows.filter((r) => !r.includes("gallery-target"));

    if (inNote) {
      const exNoteItems = extractNoteListItems(exNotes);
      const targetNote =
        exNoteItems.find((item) => item.includes("gallery-target")) ??
        exNoteItems[0];
      const targetNoteText = targetNote
        ? compactText(
            normalizeNoteRefNumbers(targetNote).replace(/<[^>]+>/g, " ")
          )
        : compactText(ex.teiSnippet.replace(/<[^>]+>/g, " "));
      const pageNoteItems = extractNoteListItems(notesHtml);
      const matchedNoteIdx =
        targetNoteText.length > 0
          ? pageNoteItems.findIndex(
              (item) =>
                compactText(
                  normalizeNoteRefNumbers(item).replace(/<[^>]+>/g, " ")
                ) === targetNoteText
            )
          : -1;
      const passageRow = targetRows[0] ?? exRows[0];
      const secIdx = passageRow
        ? matchRowIndex(sections, passageRow, ex.sectionId)
        : -1;
      const passageSlice = secIdx >= 0 ? addTargetClass(sections[secIdx]) : "";
      if (matchedNoteIdx >= 0) {
        const markedNote = pageNoteItems[matchedNoteIdx].replace(
          /^<li\b([^>]*)>/,
          (_m, attrs: string) =>
            /\bclass="/.test(attrs)
              ? `<li${attrs.replace(/\bclass="/, 'class="gallery-target ')}>`
              : `<li class="gallery-target"${attrs}>`
        );
        return {
          status: "matched",
          html: joinPassageAndNotesHtml(
            passageSlice,
            `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${markedNote}</ol></aside>`
          ),
        };
      }
      return passageSlice
        ? { status: "missing-target", html: passageSlice }
        : undefined;
    }

    // Body exemplar: match target rows first.
    const matchedTargetIndices: number[] = [];
    for (const tRow of targetRows.length > 0 ? targetRows : exRows) {
      // Do not fall back to prefix matching when the target row is an un-id'd heading row.
      const isHeadingRow =
        tRow.includes("reader-subheading") && !extractRowSecId(tRow);
      const idx = matchRowIndex(
        sections,
        tRow,
        isHeadingRow ? undefined : ex.sectionId
      );
      if (idx >= 0 && !matchedTargetIndices.includes(idx)) {
        matchedTargetIndices.push(idx);
      }
    }

    const matchedContextIndices: number[] = [];
    for (const cRow of contextRows) {
      const idx = matchRowIndex(sections, cRow);
      if (idx >= 0 && !matchedContextIndices.includes(idx)) {
        matchedContextIndices.push(idx);
      }
    }

    // If an un-id'd heading row changed its text on the same page right before
    // a matched context row, pair it with the existing un-id'd heading row at
    // that position so it is treated as `matched` ("Changed"), not `missing-target`.
    if (matchedTargetIndices.length === 0 && matchedContextIndices.length > 0) {
      const firstCtxIdx = Math.min(...matchedContextIndices);
      const hasUnanchoredHeadingTarget = (
        targetRows.length > 0 ? targetRows : exRows
      ).some((r) => r.includes("reader-subheading") && !extractRowSecId(r));
      if (
        hasUnanchoredHeadingTarget &&
        firstCtxIdx > 0 &&
        sections[firstCtxIdx - 1].includes("reader-subheading") &&
        !extractRowSecId(sections[firstCtxIdx - 1])
      ) {
        matchedTargetIndices.push(firstCtxIdx - 1);
      }
    }

    if (matchedTargetIndices.length > 0) {
      const allIndices = Array.from(
        new Set([...matchedTargetIndices, ...matchedContextIndices])
      ).sort((a, b) => a - b);
      const selected = allIndices.map((idx) =>
        matchedTargetIndices.includes(idx)
          ? addTargetClass(sections[idx])
          : sections[idx]
      );
      let passage = selected.join("\n");
      const aligned = alignBeforeLinesToAfter(passage, exPassage);
      if (aligned) {
        passage = aligned;
      }
      const html =
        notesHtml && ex.renderedHtml.includes('<aside class="reader-notes"')
          ? joinPassageAndNotesHtml(
              passage,
              filterNotesHtmlToRefs(passage, notesHtml)
            )
          : passage;
      return { status: "matched", html };
    }

    if (matchedContextIndices.length > 0) {
      matchedContextIndices.sort((a, b) => a - b);
      const passage = matchedContextIndices
        .map((idx) => sections[idx])
        .join("\n");
      const html =
        notesHtml && ex.renderedHtml.includes('<aside class="reader-notes"')
          ? joinPassageAndNotesHtml(
              passage,
              filterNotesHtmlToRefs(passage, notesHtml)
            )
          : passage;
      return { status: "missing-target", html };
    }

    return undefined;
  };
}

/**
 * Returns whether `(workId, pageId)` has byte-identical page HTML and notes
 * in two `library render` outputs, using the content hashes in their
 * `index.json`. `undefined` when either render lacks the work or the page.
 */
export function makeRenderPageComparator(
  beforeRenderDir: string,
  afterRenderDir: string
): (workId: string, pageId: string) => boolean | undefined {
  const beforeIndex: RenderIndex = readRenderIndex(beforeRenderDir);
  const afterIndex: RenderIndex = readRenderIndex(afterRenderDir);
  const pageOf = (index: RenderIndex, workId: string, pageId: string) =>
    index.works[workId]?.pages.find((p) => p.id === pageId);
  return (workId, pageId) => {
    const b = pageOf(beforeIndex, workId, pageId);
    const a = pageOf(afterIndex, workId, pageId);
    if (!b || !a) return undefined;
    return b.html === a.html && (b.notes ?? "") === (a.notes ?? "");
  };
}

function stripGalleryTargetClass(rowHtml: string): string {
  return rowHtml.replace(
    /^(<div class="reader-section) gallery-target\b/,
    "$1"
  );
}

/**
 * The rows (and, for note exemplars, the note items) an exemplar is about:
 * its `gallery-target` rows without the marker class. Context rows around
 * them are left out.
 */
function exemplarTargetParts(html: string, inNote: boolean): string[] {
  const { passage, notes } = splitPassageAndNotes(html);
  const parts = splitPageSectionHtmls(passage)
    .filter((row) => row.includes("gallery-target"))
    .map(stripGalleryTargetClass);
  if (inNote) {
    parts.push(...extractNoteListItems(notes));
  }
  return parts;
}

/** All rows and note items of a preview, without the target marker class. */
function previewParts(html: string): string[] {
  const { passage, notes } = splitPassageAndNotes(html);
  return [
    ...splitPageSectionHtmls(passage).map(stripGalleryTargetClass),
    ...extractNoteListItems(notes),
  ];
}

function findSpotCheckPages(
  work: GalleryWorkSpotCheck | undefined,
  pageId: string
): GalleryPageSpotCheck[] {
  if (!work) return [];
  const all = [
    ...(work.spotCheckPages ?? []),
    work.pages?.first,
    work.pages?.middle,
    work.pages?.last,
  ];
  const out: GalleryPageSpotCheck[] = [];
  const seen = new Set<string>();
  for (const p of all) {
    if (!p || p.pageId !== pageId) continue;
    const key = `${p.role}\u0000${p.readerUrl}\u0000${p.previewHtml}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function spotWindowStartId(p: GalleryPageSpotCheck): string {
  if (p.windowRange?.[0]) return p.windowRange[0];
  const secIds = extractSectionIds(p.previewHtml);
  if (secIds.length > 0) return secIds[0];
  return p.citationRange[0] ?? "";
}

function isTopOfPageSpotWindow(p: GalleryPageSpotCheck): boolean {
  if (p.readerUrl.includes("#sec-")) return false;
  if (
    p.windowRange &&
    p.citationRange[0] &&
    p.windowRange[0] !== p.citationRange[0]
  ) {
    return false;
  }
  return true;
}

function spotWindowsMatch(
  a: GalleryPageSpotCheck,
  b: GalleryPageSpotCheck
): boolean {
  if (a.pageId !== b.pageId) return false;
  if (isTopOfPageSpotWindow(a) && isTopOfPageSpotWindow(b)) {
    const aSecIds = extractSectionIds(a.previewHtml);
    const bSecIds = extractSectionIds(b.previewHtml);
    if (aSecIds.length > 0 && bSecIds.length > 0) {
      const a0 = aSecIds[0];
      const b0 = bSecIds[0];
      return a0 === b0 || a0.startsWith(`${b0}.`) || b0.startsWith(`${a0}.`);
    }
    return true;
  }
  return spotWindowStartId(a) === spotWindowStartId(b);
}

/**
 * Cuts an exemplar preview down for display: around the target row on a
 * full-page preview, and to the target note (or the notes the passage
 * references). Body exemplars keep notes only if `keepBodyNotes`.
 */
function compactExemplarPreview(
  h: string,
  isNote: boolean,
  keepBodyNotes: boolean
): string {
  const asideIdx = h.indexOf('<aside class="reader-notes"');
  let passage = asideIdx >= 0 ? h.slice(0, asideIdx).trim() : h;
  const notes = asideIdx >= 0 ? h.slice(asideIdx) : undefined;
  // If full-page layout (more than 5 reader-section blocks), keep +-2 around gallery-target
  const secStarts = Array.from(
    passage.matchAll(/<div class="reader-section(?:\s+[^"]*)?"/g),
    (m) => m.index ?? 0
  );
  if (secStarts.length > 5) {
    const chunks = secStarts.map((s, idx) =>
      passage.slice(
        s,
        idx + 1 < secStarts.length ? secStarts[idx + 1] : passage.length
      )
    );
    const targetIdx = Math.max(
      0,
      chunks.findIndex((c) => c.includes("gallery-target"))
    );
    passage = chunks
      .slice(Math.max(0, targetIdx - 2), Math.min(chunks.length, targetIdx + 3))
      .join("\n");
  }
  if (!isNote && !keepBodyNotes) {
    return passage;
  }
  if (!notes) {
    return passage;
  }
  const items = extractNoteListItems(notes);
  if (items.length > 3) {
    const targetNotes = items.filter((item) => item.includes("gallery-target"));
    if (targetNotes.length > 0) {
      return joinPassageAndNotesHtml(
        passage,
        `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${targetNotes.join(
          ""
        )}</ol></aside>`
      );
    }
  }
  return joinPassageAndNotesHtml(
    passage,
    filterNotesHtmlToRefs(passage, notes)
  );
}

export interface DiffSpotPageItem {
  role: "first" | "middle" | "last";
  title: string;
  pageId: string;
  citationRange: [string, string];
  readerUrl: string;
  beforeHtml: string;
  afterHtml: string;
  markupChanged: boolean;
  /** The reader stylesheet differs and the page uses `.reader-block`. */
  cssChanged: boolean;
  /** False when the Before gallery has no spot-check page in this role. */
  hasBefore: boolean;
  label?: string;
  reason?: string;
  windowRange?: [string, string];
}

export interface DiffWorkCard {
  workId: string;
  author: string;
  title: string;
  shortTitle?: string;
  changedPages: DiffSpotPageItem[];
}

/**
 * Compares two GalleryReport instances (`before` and `after`) and generates a
 * self-contained Before/After Diff Inspector HTML document (`diff.html`).
 *
 * For every exemplar or spot-check page that changed (markup or CSS styling),
 * it displays:
 * - Card header with kind/work, badge showing changed count, and "Reviewed" checkbox
 * - Comparison grid: Source TEI XML, Before, and After
 * - `<details class="html-diff-details">` raw HTML markup diff
 * - Review tracking controls with localStorage and hide-reviewed support
 *
 * Exemplars are left out of "Changed Markup Kind Exemplars" when nothing they
 * are about changed: their page is byte-identical in the Before and After
 * `library render` outputs (`options.beforeRenderDir`/`afterRenderDir`), or
 * their target rows are unchanged in both galleries' spot-check page, in the
 * paired Before exemplar, or (for rows with text) anywhere the Before gallery
 * shows that page. A passage chosen for several kinds is shown once.
 * Exemplars from works or kinds the Before gallery doesn't have are listed
 * separately as new coverage, without a Before pane.
 */
export function renderGalleryDiffHtml(
  before: GalleryReport,
  after: GalleryReport,
  beforeReaderCss?: string,
  afterReaderCss?: string,
  options: GalleryDiffOptions = {}
): string {
  const hasCssChanges =
    (beforeReaderCss !== undefined || afterReaderCss !== undefined) &&
    (beforeReaderCss ?? "") !== (afterReaderCss ?? "");

  const beforeKinds = before.markupKinds ?? [];
  const afterKinds = after.markupKinds ?? [];

  const beforeKindsMap = new Map<string, GalleryMarkupKind>();
  for (const k of beforeKinds) {
    beforeKindsMap.set(`${k.category}:${k.kind}`, k);
  }

  const pageUnchangedInRenders =
    options.beforeRenderDir !== undefined &&
    options.afterRenderDir !== undefined
      ? makeRenderPageComparator(
          options.beforeRenderDir,
          options.afterRenderDir
        )
      : undefined;
  const locateInBeforeRender =
    options.beforeRenderDir !== undefined
      ? makeRenderWindowLocator(options.beforeRenderDir)
      : undefined;
  const locateInAfterRender =
    options.afterRenderDir !== undefined
      ? makeRenderWindowLocator(options.afterRenderDir)
      : undefined;

  // Works the Before side knows about at all: in its spot-checks, among its
  // exemplars, or in its render.
  const beforeWorksById = new Map<string, GalleryWorkSpotCheck>();
  for (const w of before.works ?? []) {
    beforeWorksById.set(w.workId, w);
  }
  const afterWorksById = new Map<string, GalleryWorkSpotCheck>();
  for (const w of after.works ?? []) {
    afterWorksById.set(w.workId, w);
  }
  const beforeWorkIds = new Set<string>(beforeWorksById.keys());
  for (const k of beforeKinds) {
    for (const ex of k.examples) beforeWorkIds.add(ex.workId);
  }
  if (options.beforeRenderDir !== undefined) {
    for (const workId of Object.keys(
      readRenderIndex(options.beforeRenderDir).works
    )) {
      beforeWorkIds.add(workId);
    }
  }
  const afterWorkIds = new Set<string>(afterWorksById.keys());
  const afterKindsMap = new Map<string, GalleryMarkupKind>();
  for (const k of afterKinds) {
    afterKindsMap.set(`${k.category}:${k.kind}`, k);
    for (const ex of k.examples) afterWorkIds.add(ex.workId);
  }
  if (options.afterRenderDir !== undefined) {
    for (const workId of Object.keys(
      readRenderIndex(options.afterRenderDir).works
    )) {
      afterWorkIds.add(workId);
    }
  }

  // Every row and note item the Before and After galleries show for a page,
  // from all their exemplars and spot-check previews, keyed by `<workId>\0<pageId>`.
  const beforePartsByPage = new Map<string, string[]>();
  const addBeforeParts = (workId: string, pageId: string, html: string) => {
    const key = `${workId}\u0000${pageId}`;
    let parts = beforePartsByPage.get(key);
    if (!parts) {
      parts = [];
      beforePartsByPage.set(key, parts);
    }
    parts.push(...previewParts(html));
  };
  for (const k of beforeKinds) {
    for (const ex of k.examples) {
      addBeforeParts(ex.workId, ex.pageId, ex.renderedHtml);
    }
  }
  for (const w of before.works ?? []) {
    const spotPages = [
      ...(w.spotCheckPages ?? []),
      w.pages?.first,
      w.pages?.middle,
      w.pages?.last,
    ];
    const seenSpot = new Set<string>();
    for (const page of spotPages) {
      if (!page) continue;
      const spotKey = `${page.pageId}\u0000${page.role}\u0000${page.readerUrl}\u0000${page.previewHtml}`;
      if (seenSpot.has(spotKey)) continue;
      seenSpot.add(spotKey);
      addBeforeParts(w.workId, page.pageId, page.previewHtml);
    }
  }

  const afterPartsByPage = new Map<string, string[]>();
  const addAfterParts = (workId: string, pageId: string, html: string) => {
    const key = `${workId}\u0000${pageId}`;
    let parts = afterPartsByPage.get(key);
    if (!parts) {
      parts = [];
      afterPartsByPage.set(key, parts);
    }
    parts.push(...previewParts(html));
  };
  for (const k of afterKinds) {
    for (const ex of k.examples) {
      addAfterParts(ex.workId, ex.pageId, ex.renderedHtml);
    }
  }
  for (const w of after.works ?? []) {
    const spotPages = [
      ...(w.spotCheckPages ?? []),
      w.pages?.first,
      w.pages?.middle,
      w.pages?.last,
    ];
    const seenSpot = new Set<string>();
    for (const page of spotPages) {
      if (!page) continue;
      const spotKey = `${page.pageId}\u0000${page.role}\u0000${page.readerUrl}\u0000${page.previewHtml}`;
      if (seenSpot.has(spotKey)) continue;
      seenSpot.add(spotKey);
      addAfterParts(w.workId, page.pageId, page.previewHtml);
    }
  }
  const hasText = (part: string) =>
    compactText(renderedRowText(part)).length > 0;

  const diffKinds: DiffKindCard[] = [];
  const newCoverage: DiffNewCoverageItem[] = [];
  const filtered: DiffExemplarFilterCounts = {
    nonRendering: 0,
    identicalRender: 0,
    unchangedSpotCheck: 0,
    unchangedTargetRows: 0,
    unchangedOnPage: 0,
    contextOnly: 0,
    spacerArtifact: 0,
    duplicates: 0,
  };
  const shownByPassage = new Map<string, DiffExemplarItem>();
  const newCoverageByPassage = new Map<string, DiffNewCoverageItem>();
  const passageKey = (ex: GalleryExemplar, inNote: boolean, html: string) =>
    [ex.workId, ex.pageId, String(inNote), normalizePreviewHtml(html)].join(
      "\u0000"
    );

  const extractTargetScopeOnly = (h: string, inNote: boolean): string => {
    const asideIdx = h.indexOf('<aside class="reader-notes"');
    if (inNote) {
      if (asideIdx < 0) return h;
      const items = extractNoteListItems(h.slice(asideIdx));
      const target =
        items.find((item) => item.includes("gallery-target")) ??
        (items.length === 1 ? items[0] : undefined);
      return target ?? h.slice(asideIdx);
    }
    return asideIdx >= 0 ? h.slice(0, asideIdx).trim() : h;
  };

  for (const afterKind of afterKinds) {
    const beforeKind =
      beforeKindsMap.get(`${afterKind.category}:${afterKind.kind}`) ??
      beforeKindsMap.get(afterKind.kind);

    if (isNonRenderingMarkerKind(afterKind.kind)) {
      // Non-rendering markers (`milestone*`, `lb`, `pb`) do not emit visible
      // semantic wrapper elements. Still record new coverage if the work/kind
      // is new, otherwise skip from Section 1.
      for (const afterEx of afterKind.examples) {
        const inNote =
          Boolean(afterEx.inNote) ||
          afterKind.category === "note-element" ||
          afterKind.category === "note-rend";
        if (!beforeWorkIds.has(afterEx.workId) || beforeKind === undefined) {
          const previewHtml = compactExemplarPreview(
            afterEx.renderedHtml,
            inNote,
            true
          );
          const key = passageKey(afterEx, inNote, previewHtml);
          const seen = newCoverageByPassage.get(key);
          if (seen) {
            if (!seen.kinds.includes(afterKind.kind)) {
              seen.kinds.push(afterKind.kind);
            }
          } else {
            const item: DiffNewCoverageItem = {
              kinds: [afterKind.kind],
              category: afterKind.category,
              reason: beforeWorkIds.has(afterEx.workId) ? "kind" : "work",
              exemplar: afterEx,
              previewHtml,
            };
            newCoverageByPassage.set(key, item);
            newCoverage.push(item);
          }
        } else {
          filtered.nonRendering++;
        }
      }
      continue;
    }

    const changedExemplars: DiffExemplarItem[] = [];

    for (let i = 0; i < afterKind.examples.length; i++) {
      const afterEx = afterKind.examples[i];
      const inNote =
        Boolean(afterEx.inNote) ||
        afterKind.category === "note-element" ||
        afterKind.category === "note-rend";

      // New coverage: nothing in Before to compare with.
      if (!beforeWorkIds.has(afterEx.workId) || beforeKind === undefined) {
        const previewHtml = compactExemplarPreview(
          afterEx.renderedHtml,
          inNote,
          true
        );
        const key = passageKey(afterEx, inNote, previewHtml);
        const seen = newCoverageByPassage.get(key);
        if (seen) {
          if (!seen.kinds.includes(afterKind.kind)) {
            seen.kinds.push(afterKind.kind);
          }
          continue;
        }
        const item: DiffNewCoverageItem = {
          kinds: [afterKind.kind],
          category: afterKind.category,
          reason: beforeWorkIds.has(afterEx.workId) ? "kind" : "work",
          exemplar: afterEx,
          previewHtml,
        };
        newCoverageByPassage.set(key, item);
        newCoverage.push(item);
        continue;
      }

      // The reader page is byte-identical in both pipelines' renders.
      if (pageUnchangedInRenders?.(afterEx.workId, afterEx.pageId) === true) {
        filtered.identicalRender++;
        continue;
      }

      // Footnote renumbering is noise for body markup kinds.
      const ignoreNoteNumbers = !inNote && !afterKind.kind.startsWith("note");
      const normalizePart = (h: string) => {
        const norm = normalizePreviewHtml(h);
        return ignoreNoteNumbers ? normalizeNoteRefNumbers(norm) : norm;
      };
      const targetParts = exemplarTargetParts(afterEx.renderedHtml, inNote).map(
        normalizePart
      );

      // The target rows are unchanged on the page: both galleries' spot-check
      // previews of the page (built the same way in both) are identical and
      // contain them.
      const beforeSpots = findSpotCheckPages(
        beforeWorksById.get(afterEx.workId),
        afterEx.pageId
      );
      const afterSpots = findSpotCheckPages(
        afterWorksById.get(afterEx.workId),
        afterEx.pageId
      );
      let matchedUnchangedSpot = false;
      if (
        targetParts.length > 0 &&
        beforeSpots.length > 0 &&
        afterSpots.length > 0
      ) {
        for (const afterSpot of afterSpots) {
          const normAfterSpot = normalizePreviewHtml(afterSpot.previewHtml);
          if (
            beforeSpots.some(
              (bs) => normalizePreviewHtml(bs.previewHtml) === normAfterSpot
            )
          ) {
            const spotParts = new Set(
              previewParts(afterSpot.previewHtml).map(normalizePart)
            );
            if (targetParts.every((p) => spotParts.has(p))) {
              matchedUnchangedSpot = true;
              break;
            }
          }
        }
      }
      if (matchedUnchangedSpot) {
        filtered.unchangedSpotCheck++;
        continue;
      }

      // Pair only exemplars of the same work: by section, else by TEI snippet.
      // Pairing by position could diff two unrelated works.
      const sameWork = (beforeKind?.examples ?? []).filter(
        (e) =>
          e.workId === afterEx.workId &&
          Boolean(e.inNote) === Boolean(afterEx.inNote)
      );
      const matchingBeforeEx =
        sameWork.find(
          (e) =>
            e.sectionId === afterEx.sectionId &&
            e.teiSnippet === afterEx.teiSnippet
        ) ??
        sameWork.find((e) => e.sectionId === afterEx.sectionId) ??
        sameWork.find((e) => e.teiSnippet === afterEx.teiSnippet);

      // The target rows appear unchanged among the paired Before exemplar's
      // rows (the two galleries may cut different windows around them).
      if (matchingBeforeEx && targetParts.length > 0) {
        const beforeParts = new Set(
          previewParts(matchingBeforeEx.renderedHtml).map(normalizePart)
        );
        if (targetParts.every((p) => beforeParts.has(p))) {
          filtered.unchangedTargetRows++;
          continue;
        }
      }

      // Locate directly in `beforeRenderDir` when available (`R1`).
      const beforeLocated = locateInBeforeRender?.(afterEx, inNote);
      if (beforeLocated?.status === "matched" && targetParts.length > 0) {
        const locatedParts = new Set(
          previewParts(beforeLocated.html).map(normalizePart)
        );
        if (targetParts.every((p) => locatedParts.has(p))) {
          filtered.unchangedOnPage++;
          continue;
        }
      }

      // The target rows appear verbatim elsewhere on the same page in the
      // Before gallery (another kind's exemplar, or the spot-check preview).
      // Only rows with text count: an empty spacer row matches anywhere.
      if (targetParts.length > 0 && targetParts.every(hasText)) {
        const pagePool = new Set(
          (
            beforePartsByPage.get(`${afterEx.workId}\u0000${afterEx.pageId}`) ??
            []
          ).map(normalizePart)
        );
        if (targetParts.every((p) => pagePool.has(p))) {
          filtered.unchangedOnPage++;
          continue;
        }
      }

      // Guard against old gallery locator artifacts that captured only empty
      // `<span class="line-space">` spacer rows instead of the stanza text.
      if (
        beforeLocated === undefined &&
        matchingBeforeEx !== undefined &&
        !previewParts(matchingBeforeEx.renderedHtml).some(hasText) &&
        targetParts.some(hasText)
      ) {
        filtered.spacerArtifact++;
        continue;
      }

      const rawBeforeHtml =
        beforeLocated?.html ?? matchingBeforeEx?.renderedHtml ?? "";
      const hasBeforeHtml = rawBeforeHtml.trim().length > 0;
      const status: DiffExemplarStatus = !hasBeforeHtml
        ? "unpaired"
        : beforeLocated?.status === "missing-target"
        ? "newly-rendered"
        : "changed";

      const afterHtml = afterEx.renderedHtml;
      const keepBodyNotes = rawBeforeHtml.includes(
        '<aside class="reader-notes"'
      );
      const compareAfter = compactExemplarPreview(
        afterHtml,
        inNote,
        keepBodyNotes
      );
      const compactBefore = compactExemplarPreview(
        rawBeforeHtml,
        inNote,
        keepBodyNotes
      );
      const compareBefore =
        (hasBeforeHtml && beforeLocated?.status !== "missing-target"
          ? alignBeforeLinesToAfter(compactBefore, compareAfter)
          : undefined) ?? compactBefore;

      const keepLgWrapper = afterKind.kind.split("@")[0] === "lg";
      const normBefore = normalizeCitationChrome(
        extractTargetScopeOnly(compareBefore, inNote),
        ignoreNoteNumbers,
        keepLgWrapper
      );
      const normAfter = normalizeCitationChrome(
        extractTargetScopeOnly(compareAfter, inNote),
        ignoreNoteNumbers,
        keepLgWrapper
      );
      const headingRowShifted =
        hasBeforeHtml &&
        beforeLocated?.status !== "missing-target" &&
        !inNote &&
        normBefore.includes("reader-subheading") !==
          normAfter.includes("reader-subheading") &&
        afterKind.kind !== "head" &&
        !afterKind.kind.startsWith("head@");
      // A footnote marker added or dropped in the passage (e.g. an OCR margin
      // note removed) is a note change, not a change to body markup such as
      // `hi@sup`, whose `<sup>` it would otherwise match.
      const forRelevance = (h: string) =>
        ignoreNoteNumbers
          ? h.replace(/<a class="reader-note-ref"[^>]*>[\s\S]*?<\/a>/g, "")
          : h;
      const relevanceBefore = forRelevance(normBefore);
      const relevanceAfter = forRelevance(normAfter);
      const allOps =
        hasBeforeHtml &&
        relevanceBefore !== relevanceAfter &&
        !headingRowShifted
          ? computeHtmlDiffOps(relevanceBefore, relevanceAfter)
          : [];
      const relevantDiffOps = allOps.filter(
        (op): op is HtmlDiffOpDiff =>
          op.type === "diff" &&
          isDiffOpRelevantToExemplar(
            op,
            afterKind.kind,
            afterEx.teiSnippet,
            inNote
          )
      );
      const markupChanged =
        status === "newly-rendered" ||
        status === "unpaired" ||
        relevantDiffOps.length > 0;
      const isBlockKind =
        afterKind.kind === "p" ||
        afterKind.kind.startsWith("p@") ||
        afterKind.kind === "ab" ||
        afterKind.kind.startsWith("ab@");
      const cssChanged =
        hasCssChanges &&
        isBlockKind &&
        (/\breader-block\b/.test(normBefore) ||
          /\breader-block\b/.test(normAfter));

      if (!(markupChanged || cssChanged)) {
        filtered.contextOnly++;
        continue;
      }
      const key = passageKey(afterEx, inNote, compareAfter);
      const seen = shownByPassage.get(key);
      if (seen) {
        if (
          afterKind.kind !== seen.kind &&
          !seen.alsoKinds.includes(afterKind.kind)
        ) {
          seen.alsoKinds.push(afterKind.kind);
        }
        filtered.duplicates++;
        continue;
      }
      const citationIdChange =
        !inNote && status === "changed"
          ? computeCitationIdChange(compareBefore, compareAfter)
          : undefined;
      const item: DiffExemplarItem = {
        kind: afterKind.kind,
        author: afterEx.author,
        workTitle: afterEx.workTitle,
        workId: afterEx.workId,
        sectionId: afterEx.sectionId,
        pageId: afterEx.pageId,
        readerUrl: afterEx.readerUrl,
        teiSnippet: afterEx.teiSnippet,
        beforeHtml: compareBefore,
        afterHtml: compareAfter,
        diffBeforeHtml: normBefore,
        diffAfterHtml: normAfter,
        inNote,
        markupChanged,
        cssChanged,
        paired: hasBeforeHtml,
        status,
        citationIdChange,
        alsoKinds: [],
      };
      shownByPassage.set(key, item);
      changedExemplars.push(item);
    }

    if (changedExemplars.length > 0) {
      diffKinds.push({
        kind: afterKind.kind,
        category: afterKind.category,
        changedExemplars,
      });
    }
  }

  // Scan `beforeKinds` for exemplars whose markup was removed in After ("No longer rendered").
  for (const beforeKind of beforeKinds) {
    if (isNonRenderingMarkerKind(beforeKind.kind)) continue;
    const afterKind =
      afterKindsMap.get(`${beforeKind.category}:${beforeKind.kind}`) ??
      afterKinds.find((k) => k.kind === beforeKind.kind);
    const removedExemplars: DiffExemplarItem[] = [];

    for (const beforeEx of beforeKind.examples) {
      if (!afterWorkIds.has(beforeEx.workId)) continue;
      if (pageUnchangedInRenders?.(beforeEx.workId, beforeEx.pageId) === true) {
        continue;
      }
      const inNote =
        Boolean(beforeEx.inNote) ||
        beforeKind.category === "note-element" ||
        beforeKind.category === "note-rend" ||
        beforeKind.kind === "note" ||
        beforeKind.kind.startsWith("note@");
      const afterWork = afterWorksById.get(beforeEx.workId);
      const afterWorkKinds = afterWork?.markupKinds;
      const isNoteKind = inNote;
      const afterKindHasWork = (afterKind?.examples ?? []).some(
        (e) =>
          e.workId === beforeEx.workId &&
          Boolean(e.inNote) === Boolean(beforeEx.inNote)
      );
      const kindDroppedInWork =
        !afterKindHasWork &&
        (afterKind === undefined ||
          (afterWorkKinds !== undefined &&
            afterWorkKinds.length > 0 &&
            !afterWorkKinds.includes(beforeKind.kind) &&
            (!isNoteKind ||
              !afterWorkKinds.some(
                (k) => k === "note" || k.startsWith("note@")
              ))));
      const afterLocated = locateInAfterRender?.(beforeEx, inNote);
      const targetMissingInAfterRender =
        afterLocated?.status === "missing-target";

      if (!kindDroppedInWork && !targetMissingInAfterRender) {
        continue;
      }

      const compareBefore = compactExemplarPreview(
        beforeEx.renderedHtml,
        inNote,
        true
      );
      let compareAfter = "";
      if (afterLocated?.html) {
        compareAfter = compactExemplarPreview(afterLocated.html, inNote, true);
      } else {
        const afterPageParts =
          afterPartsByPage.get(`${beforeEx.workId}\u0000${beforeEx.pageId}`) ??
          [];
        const observedSec = afterPageParts.find(
          (p) =>
            p.startsWith('<div class="reader-section') &&
            extractRowSecId(p) === beforeEx.sectionId
        );
        if (observedSec) {
          compareAfter = observedSec.replace(
            /^<div class="reader-section\b/,
            '<div class="reader-section gallery-target'
          );
        }
      }
      // Never synthesize an After pane by stripping tags from Before: if no
      // observed After HTML exists in `afterRenderDir` or `after` previews, skip.
      if (!compareAfter.trim()) {
        continue;
      }
      const ignoreNoteNumbers = !inNote && !beforeKind.kind.startsWith("note");
      const normBefore = normalizeCitationChrome(
        extractTargetScopeOnly(compareBefore, inNote),
        ignoreNoteNumbers
      );
      const normAfter =
        inNote && !compareAfter.includes('<aside class="reader-notes"')
          ? ""
          : normalizeCitationChrome(
              extractTargetScopeOnly(compareAfter, inNote),
              ignoreNoteNumbers
            );
      if (normBefore === normAfter) continue;

      const key = passageKey(beforeEx, inNote, compareBefore);
      if (shownByPassage.has(key)) continue;
      const item: DiffExemplarItem = {
        kind: beforeKind.kind,
        author: beforeEx.author,
        workTitle: beforeEx.workTitle,
        workId: beforeEx.workId,
        sectionId: beforeEx.sectionId,
        pageId: beforeEx.pageId,
        readerUrl: beforeEx.readerUrl,
        teiSnippet: beforeEx.teiSnippet,
        beforeHtml: compareBefore,
        afterHtml: compareAfter,
        diffBeforeHtml: normBefore,
        diffAfterHtml: normAfter,
        inNote,
        markupChanged: true,
        cssChanged: false,
        paired: true,
        status: "no-longer-rendered",
        alsoKinds: [],
      };
      shownByPassage.set(key, item);
      removedExemplars.push(item);
      if (removedExemplars.length >= 3) break;
    }

    if (removedExemplars.length > 0) {
      const existingCard = diffKinds.find(
        (k) => k.kind === beforeKind.kind && k.category === beforeKind.category
      );
      if (existingCard) {
        existingCard.changedExemplars.push(...removedExemplars);
      } else {
        diffKinds.push({
          kind: beforeKind.kind,
          category: beforeKind.category,
          changedExemplars: removedExemplars,
        });
      }
    }
  }

  // Change-driven exemplar discovery directly from changed pages between
  // `beforeRenderDir` and `afterRenderDir` (`B3`).
  if (
    options.beforeRenderDir !== undefined &&
    options.afterRenderDir !== undefined
  ) {
    const beforeIndex = readRenderIndex(options.beforeRenderDir);
    const afterIndex = readRenderIndex(options.afterRenderDir);
    const addTargetRowClass = (rowHtml: string): string =>
      rowHtml.includes("gallery-target")
        ? rowHtml
        : rowHtml.replace(
            /^<div class="reader-section\b/,
            '<div class="reader-section gallery-target'
          );
    const markNoteTarget = (noteLi: string): string =>
      noteLi.replace(/^<li\b([^>]*)>/, (_m, attrs: string) =>
        /\bclass="/.test(attrs)
          ? `<li${attrs.replace(/\bclass="/, 'class="gallery-target ')}>`
          : `<li class="gallery-target"${attrs}>`
      );
    const extractNoteId = (noteLi: string): string | undefined =>
      /\bid="(note-[^"]+)"/.exec(noteLi)?.[1];
    const extractNoteBody = (noteLi: string): string => {
      const m =
        /<div class="reader-note-body">([\s\S]*?)<\/div>\s*<\/li>/i.exec(
          noteLi
        );
      return (m ? m[1] : "").trim();
    };
    const extractNotePlainText = (noteLi: string): string =>
      compactText(extractNoteBody(noteLi).replace(/<[^>]+>/g, " "));
    const NO_SOURCE_TEI_LABEL = "No source TEI (found from the render diff)";
    const candidateRoots = Array.from(
      new Set(
        [after.root, before.root, afterIndex.root, beforeIndex.root].filter(
          (r): r is string => Boolean(r && r.trim().length > 0)
        )
      )
    );
    interface CachedWorkNoteTags {
      emptyNoteNTags: Array<{ xml: string; nCompact: string }>;
      noteTags: Array<{ xml: string; textCompact: string }>;
    }
    interface CachedWorkPTag {
      xml: string;
      textCompact: string;
    }
    const workPTagsCache = new Map<string, CachedWorkPTag[] | null>();
    const workNoteTagsCache = new Map<string, CachedWorkNoteTags | null>();
    const stripXmlNotesLinear = (xmlFrag: string): string => {
      let out = "";
      let pos = 0;
      const openRe = /<note\b[^>]*>/g;
      let m: RegExpExecArray | null;
      while ((m = openRe.exec(xmlFrag)) !== null) {
        out += xmlFrag.slice(pos, m.index);
        const openTag = m[0];
        const openEnd = m.index + openTag.length;
        if (openTag.endsWith("/>")) {
          pos = openEnd;
        } else {
          const closeIdx = xmlFrag.indexOf("</note>", openEnd);
          if (closeIdx >= 0) {
            pos = closeIdx + 7;
            openRe.lastIndex = pos;
          } else {
            pos = openEnd;
          }
        }
      }
      out += xmlFrag.slice(pos);
      return out;
    };
    const extractXmlNoteTagsLinear = (rawXml: string): string[] => {
      const notes: string[] = [];
      const openRe = /<note\b[^>]*>/g;
      let m: RegExpExecArray | null;
      while ((m = openRe.exec(rawXml)) !== null) {
        const openTag = m[0];
        const openEnd = m.index + openTag.length;
        if (openTag.endsWith("/>")) {
          notes.push(openTag);
        } else {
          const closeIdx = rawXml.indexOf("</note>", openEnd);
          if (closeIdx >= 0) {
            const end = closeIdx + 7;
            notes.push(rawXml.slice(m.index, end));
            openRe.lastIndex = end;
          }
        }
      }
      return notes;
    };
    const stripXmlTagsAndNotes = (xmlFrag: string): string =>
      compactText(
        he.decode(
          stripXmlNotesLinear(xmlFrag.replace(/<!--[\s\S]*?-->/g, "")).replace(
            /<[^>]+>/g,
            ""
          )
        )
      );
    const stripXmlTagsOnly = (xmlFrag: string): string =>
      compactText(
        he.decode(
          xmlFrag.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")
        )
      );
    const resolveWorkXmlPath = (wId: string): string | undefined => {
      if (candidateRoots.length === 0) return undefined;
      try {
        const relPath = workIdToRelPath(wId);
        return candidateRoots
          .map((r) => path.join(r, relPath))
          .find((p) => fs.existsSync(p));
      } catch {
        return undefined;
      }
    };
    const getWorkPTags = (wId: string): CachedWorkPTag[] | null => {
      if (workPTagsCache.has(wId)) {
        return workPTagsCache.get(wId)!;
      }
      const xmlPath = resolveWorkXmlPath(wId);
      if (!xmlPath) {
        workPTagsCache.set(wId, null);
        return null;
      }
      const rawXml = fs.readFileSync(xmlPath, "utf8");
      const rawPTags =
        rawXml.match(/<(?:p|ab)\b[^>]*>[\s\S]*?<\/(?:p|ab)>/g) ?? [];
      const pTags = rawPTags.map((xml) => ({
        xml,
        textCompact: stripXmlTagsAndNotes(xml),
      }));
      workPTagsCache.set(wId, pTags);
      return pTags;
    };
    const getWorkNoteTags = (wId: string): CachedWorkNoteTags | null => {
      if (workNoteTagsCache.has(wId)) {
        return workNoteTagsCache.get(wId)!;
      }
      const xmlPath = resolveWorkXmlPath(wId);
      if (!xmlPath) {
        workNoteTagsCache.set(wId, null);
        return null;
      }
      const rawXml = fs.readFileSync(xmlPath, "utf8");
      const rawNotes = extractXmlNoteTagsLinear(rawXml);
      const emptyNoteNTags: Array<{ xml: string; nCompact: string }> = [];
      const noteTags: Array<{ xml: string; textCompact: string }> = [];
      for (const xml of rawNotes) {
        const textCompact = stripXmlTagsOnly(xml);
        noteTags.push({ xml, textCompact });
        if (textCompact === "") {
          const nAttr = /\bn="([^"]*)"/.exec(xml)?.[1];
          if (nAttr !== undefined) {
            emptyNoteNTags.push({
              xml,
              nCompact: compactText(he.decode(nAttr)),
            });
          }
        }
      }
      const entry: CachedWorkNoteTags = { emptyNoteNTags, noteTags };
      workNoteTagsCache.set(wId, entry);
      return entry;
    };

    const canAddDiscovered = (
      category: MarkupCategory,
      kind: string,
      status: DiffExemplarStatus,
      wId: string
    ): boolean => {
      const card = diffKinds.find(
        (k) => k.kind === kind && k.category === category
      );
      const sameStatusInCard =
        card?.changedExemplars.filter((e) => e.status === status) ?? [];
      return (
        sameStatusInCard.length < 3 &&
        !sameStatusInCard.some((e) => e.workId === wId)
      );
    };

    const addDiscoveredExemplar = (
      category: MarkupCategory,
      item: DiffExemplarItem
    ) => {
      if (!canAddDiscovered(category, item.kind, item.status, item.workId)) {
        return;
      }
      let card = diffKinds.find(
        (k) => k.kind === item.kind && k.category === category
      );
      const keyHtml =
        item.status === "no-longer-rendered" ? item.beforeHtml : item.afterHtml;
      const key = [
        item.workId,
        item.pageId,
        String(item.inNote),
        normalizePreviewHtml(keyHtml),
      ].join("\u0000");
      if (shownByPassage.has(key)) return;
      shownByPassage.set(key, item);
      if (!card) {
        card = {
          kind: item.kind,
          category,
          changedExemplars: [],
        };
        diffKinds.push(card);
      }
      card.changedExemplars.push(item);
    };

    const afterGalleryWorkIds = new Set<string>(afterWorksById.keys());
    for (const k of afterKinds) {
      for (const ex of k.examples) afterGalleryWorkIds.add(ex.workId);
    }
    const discoveryWorkIds =
      afterGalleryWorkIds.size > 0
        ? Object.keys(beforeIndex.works)
            .filter((wId) => afterGalleryWorkIds.has(wId))
            .sort()
        : Object.keys(beforeIndex.works).sort();

    for (const workId of discoveryWorkIds) {
      const bWork = beforeIndex.works[workId];
      const aWork = afterIndex.works[workId];
      if (!bWork || !aWork) continue;
      const aPageById = new Map(aWork.pages.map((p) => [p.id, p]));
      const spotWork =
        afterWorksById.get(workId) ?? beforeWorksById.get(workId);
      const author = spotWork?.author ?? aWork.author;
      const workTitle =
        spotWork?.shortTitle ??
        spotWork?.title ??
        aWork.shortTitle ??
        aWork.title;
      const pageUrl = (pageId: string) =>
        `/work/${aWork.urlAuthor}/${aWork.urlName}${
          pageId ? `/${pageId}` : ""
        }`;

      for (const bPage of bWork.pages) {
        const wantP = canAddDiscovered("element", "p", "changed", workId);
        const wantNoteNChanged = canAddDiscovered(
          "attr",
          "note@n",
          "changed",
          workId
        );
        const wantNoteNewly = canAddDiscovered(
          "element",
          "note",
          "newly-rendered",
          workId
        );
        const wantNoteNRemoved = canAddDiscovered(
          "attr",
          "note@n",
          "no-longer-rendered",
          workId
        );
        if (
          !wantP &&
          !wantNoteNChanged &&
          !wantNoteNewly &&
          !wantNoteNRemoved
        ) {
          break;
        }
        const aPage = aPageById.get(bPage.id);
        if (!aPage) continue;
        const htmlChanged = wantP && bPage.html !== aPage.html;
        const notesChanged =
          (wantNoteNChanged || wantNoteNewly || wantNoteNRemoved) &&
          (bPage.notes ?? "") !== (aPage.notes ?? "");
        if (!htmlChanged && !notesChanged) continue;

        const bStem = bPage.file || pageFileStem(bPage.id);
        const aStem = aPage.file || pageFileStem(aPage.id);
        const bHtmlPath = path.join(
          options.beforeRenderDir,
          workId,
          `${bStem}.html`
        );
        const aHtmlPath = path.join(
          options.afterRenderDir,
          workId,
          `${aStem}.html`
        );
        if (!fs.existsSync(bHtmlPath) || !fs.existsSync(aHtmlPath)) continue;
        const bRawHtml = fs.readFileSync(bHtmlPath, "utf8");
        const aRawHtml = fs.readFileSync(aHtmlPath, "utf8");
        const bSecs = splitPageSectionHtmls(bRawHtml);
        const aSecs = splitPageSectionHtmls(aRawHtml);

        if (htmlChanged && bSecs.length === aSecs.length && wantP) {
          for (let idx = 0; idx < aSecs.length; idx++) {
            if (bSecs[idx] === aSecs[idx]) continue;
            // 1. `<span class="reader-line">` -> `<p class="reader-block">` (`p`)
            if (
              bSecs[idx].includes('class="reader-line"') &&
              !bSecs[idx].includes('class="reader-block"') &&
              aSecs[idx].includes('class="reader-block"')
            ) {
              const rowText = compactText(renderedRowText(aSecs[idx]));
              const pTags = getWorkPTags(workId);
              let teiSnippet = NO_SOURCE_TEI_LABEL;
              if (pTags !== null) {
                const matchedTag =
                  pTags.find((t) => t.textCompact === rowText) ??
                  (rowText.length >= 10
                    ? pTags.find((t) =>
                        t.textCompact.includes(
                          rowText.slice(0, ROW_MATCH_CHARS)
                        )
                      )
                    : undefined);
                if (!matchedTag) continue;
                teiSnippet = serializeTeiSnippet(
                  parseRawXml(matchedTag.xml, { keepWhitespace: true })
                );
              }
              const start = Math.max(0, idx - 1);
              const end = Math.min(aSecs.length, idx + 2);
              const beforeHtml = bSecs
                .slice(start, end)
                .map((s, i) => (start + i === idx ? addTargetRowClass(s) : s))
                .join("\n");
              const afterHtml = aSecs
                .slice(start, end)
                .map((s, i) => (start + i === idx ? addTargetRowClass(s) : s))
                .join("\n");
              const sectionId =
                extractRowSecId(aSecs[idx]) ??
                extractRowSecId(aSecs.find((s) => extractRowSecId(s)) ?? "") ??
                aPage.citationRange[0] ??
                bPage.id;
              addDiscoveredExemplar("element", {
                kind: "p",
                author,
                workTitle,
                workId,
                sectionId,
                pageId: bPage.id,
                readerUrl: pageUrl(bPage.id),
                teiSnippet,
                beforeHtml,
                afterHtml,
                diffBeforeHtml: normalizeCitationChrome(beforeHtml, true),
                diffAfterHtml: normalizeCitationChrome(afterHtml, true),
                inNote: false,
                markupChanged: true,
                cssChanged: false,
                paired: true,
                status: "changed",
                alsoKinds: [],
              });
              break;
            }
          }
        }

        if (notesChanged) {
          const bNotesPath = path.join(
            options.beforeRenderDir,
            workId,
            `${bStem}.notes.html`
          );
          const aNotesPath = path.join(
            options.afterRenderDir,
            workId,
            `${aStem}.notes.html`
          );
          const bNotesHtml = fs.existsSync(bNotesPath)
            ? fs.readFileSync(bNotesPath, "utf8")
            : undefined;
          const aNotesHtml = fs.existsSync(aNotesPath)
            ? fs.readFileSync(aNotesPath, "utf8")
            : undefined;
          const bNoteItems = extractNoteListItems(bNotesHtml);
          const aNoteItems = extractNoteListItems(aNotesHtml);
          const countNoteRefs = (secHtml: string): number =>
            (secHtml.match(/class="reader-note-ref"/g) ?? []).length;
          const matchRefSec = (
            targetSec: string,
            candidateSecs: string[]
          ): string | undefined => {
            const secId = extractRowSecId(targetSec);
            if (secId) {
              const byId = candidateSecs.find(
                (s) => extractRowSecId(s) === secId
              );
              if (byId) return byId;
            }
            const compact = compactText(renderedRowText(targetSec));
            if (compact.length > 0) {
              return candidateSecs.find(
                (s) => compactText(renderedRowText(s)) === compact
              );
            }
            return undefined;
          };

          // 3a. Note body changed on a paired section (empty Before note -> `@n` label in After)
          if (
            bNoteItems.length > 0 &&
            aNoteItems.length > 0 &&
            wantNoteNChanged
          ) {
            for (const aItem of aNoteItems) {
              const aBody = extractNotePlainText(aItem);
              if (aBody.length === 0) continue;
              const aNoteId = extractNoteId(aItem);
              const aRefSec = aNoteId
                ? aSecs.find((s) => s.includes(`href="#${aNoteId}"`))
                : undefined;
              if (!aRefSec) continue;
              const bRefSec = matchRefSec(aRefSec, bSecs);
              if (!bRefSec) continue;
              const bItem = bNoteItems.find((item) => {
                const bNoteId = extractNoteId(item);
                return (
                  Boolean(bNoteId && bRefSec.includes(`href="#${bNoteId}"`)) &&
                  extractNotePlainText(item) === ""
                );
              });
              if (!bItem) continue;
              const xmlTags = getWorkNoteTags(workId);
              let teiSnippet = NO_SOURCE_TEI_LABEL;
              if (xmlTags !== null) {
                const matched = xmlTags.emptyNoteNTags.find(
                  (t) => t.nCompact === aBody
                );
                if (!matched) continue;
                teiSnippet = serializeTeiSnippet(
                  parseRawXml(matched.xml, { keepWhitespace: true })
                );
              }
              const markedB = markNoteTarget(bItem);
              const markedA = markNoteTarget(aItem);
              const beforeHtml = joinPassageAndNotesHtml(
                addTargetRowClass(bRefSec),
                `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${markedB}</ol></aside>`
              );
              const afterHtml = joinPassageAndNotesHtml(
                addTargetRowClass(aRefSec),
                `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${markedA}</ol></aside>`
              );
              const sectionId =
                extractRowSecId(aRefSec) ?? aPage.citationRange[0] ?? bPage.id;
              addDiscoveredExemplar("attr", {
                kind: "note@n",
                author,
                workTitle,
                workId,
                sectionId,
                pageId: bPage.id,
                readerUrl: pageUrl(bPage.id),
                teiSnippet,
                beforeHtml,
                afterHtml,
                diffBeforeHtml: normalizeCitationChrome(markedB, false),
                diffAfterHtml: normalizeCitationChrome(markedA, false),
                inNote: true,
                markupChanged: true,
                cssChanged: false,
                paired: true,
                status: "changed",
                alsoKinds: [],
              });
              break;
            }
          }

          // 3b. Note newly rendered in After (`aNoteItems.length > bNoteItems.length`)
          if (aNoteItems.length > bNoteItems.length && wantNoteNewly) {
            const bBodies = new Set(bNoteItems.map(extractNotePlainText));
            for (const addedNote of aNoteItems) {
              const aBody = extractNotePlainText(addedNote);
              if (aBody.length === 0 || bBodies.has(aBody)) continue;
              const aNoteId = extractNoteId(addedNote);
              const aRefSec = aNoteId
                ? aSecs.find((s) => s.includes(`href="#${aNoteId}"`))
                : undefined;
              if (!aRefSec) continue;
              const bRefSec = matchRefSec(aRefSec, bSecs);
              if (
                !bRefSec ||
                countNoteRefs(aRefSec) <= countNoteRefs(bRefSec)
              ) {
                continue;
              }
              const xmlTags = getWorkNoteTags(workId);
              let teiSnippet = NO_SOURCE_TEI_LABEL;
              if (xmlTags !== null) {
                const matched = xmlTags.noteTags.find(
                  (t) => t.textCompact === aBody
                );
                if (!matched) continue;
                teiSnippet = serializeTeiSnippet(
                  parseRawXml(matched.xml, { keepWhitespace: true })
                );
              }
              const markedA = markNoteTarget(addedNote);
              const afterHtml = joinPassageAndNotesHtml(
                addTargetRowClass(aRefSec),
                `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${markedA}</ol></aside>`
              );
              const beforeHtml = bRefSec;
              const sectionId =
                extractRowSecId(aRefSec) ?? aPage.citationRange[0] ?? bPage.id;
              addDiscoveredExemplar("element", {
                kind: "note",
                author,
                workTitle,
                workId,
                sectionId,
                pageId: bPage.id,
                readerUrl: pageUrl(bPage.id),
                teiSnippet,
                beforeHtml,
                afterHtml,
                diffBeforeHtml: "",
                diffAfterHtml: normalizeCitationChrome(markedA, false),
                inNote: true,
                markupChanged: true,
                cssChanged: false,
                paired: true,
                status: "newly-rendered",
                alsoKinds: [],
              });
              break;
            }
          }

          // 3c. Vacuous / OCR margin note removed in After (`bNoteItems.length > aNoteItems.length`)
          if (bNoteItems.length > aNoteItems.length && wantNoteNRemoved) {
            const aBodies = new Set(aNoteItems.map(extractNotePlainText));
            for (const removedNote of bNoteItems) {
              const bBody = extractNotePlainText(removedNote);
              if (aBodies.has(bBody) && bNoteItems.length > 1) continue;
              const bNoteId = extractNoteId(removedNote);
              const bRefSec = bNoteId
                ? bSecs.find((s) => s.includes(`href="#${bNoteId}"`))
                : undefined;
              if (!bRefSec) continue;
              const aRefSec = matchRefSec(bRefSec, aSecs);
              if (
                !aRefSec ||
                countNoteRefs(aRefSec) >= countNoteRefs(bRefSec)
              ) {
                continue;
              }
              const xmlTags = getWorkNoteTags(workId);
              let teiSnippet = NO_SOURCE_TEI_LABEL;
              let kind = "note@n";
              let category: MarkupCategory = "attr";
              if (xmlTags !== null) {
                let matchedNode: XmlNode | undefined;
                for (const t of xmlTags.noteTags) {
                  if (t.textCompact !== bBody) continue;
                  const parsed = parseRawXml(t.xml, { keepWhitespace: true });
                  if (isVacuousNote(parsed)) {
                    matchedNode = parsed;
                    break;
                  }
                }
                if (!matchedNode) continue;
                teiSnippet = serializeTeiSnippet(matchedNode);
                if (matchedNode.getAttr("n") === undefined) {
                  kind = "note";
                  category = "element";
                }
              }
              const markedB = markNoteTarget(removedNote);
              const beforeHtml = joinPassageAndNotesHtml(
                addTargetRowClass(bRefSec),
                `<aside class="reader-notes" role="doc-endnotes"><ol class="reader-notes-list">${markedB}</ol></aside>`
              );
              const afterHtml = addTargetRowClass(aRefSec);
              const sectionId =
                extractRowSecId(bRefSec) ?? bPage.citationRange[0] ?? bPage.id;
              addDiscoveredExemplar(category, {
                kind,
                author,
                workTitle,
                workId,
                sectionId,
                pageId: bPage.id,
                readerUrl: pageUrl(bPage.id),
                teiSnippet,
                beforeHtml,
                afterHtml,
                diffBeforeHtml: normalizeCitationChrome(markedB, false),
                diffAfterHtml: "",
                inNote: true,
                markupChanged: true,
                cssChanged: false,
                paired: true,
                status: "no-longer-rendered",
                alsoKinds: [],
              });
              break;
            }
          }
        }
      }
    }
  }

  // Spot-check works comparison
  const beforeWorks = before.works ?? [];
  const afterWorks = after.works ?? [];
  const beforeWorksMap = new Map<string, GalleryWorkSpotCheck>();
  for (const w of beforeWorks) {
    beforeWorksMap.set(w.workId, w);
  }

  const diffWorks: DiffWorkCard[] = [];
  const roles: Array<"first" | "middle" | "last"> = ["first", "middle", "last"];
  let skippedUncomparableSpotWindows = 0;

  for (const afterWork of afterWorks) {
    const beforeWork = beforeWorksMap.get(afterWork.workId);
    const changedPages: DiffSpotPageItem[] = [];

    for (const role of roles) {
      const afterPage =
        afterWork.pages?.[role] ??
        afterWork.spotCheckPages?.find((p) => p.role === role);
      if (!afterPage) {
        continue;
      }

      if (
        pageUnchangedInRenders?.(afterWork.workId, afterPage.pageId) === true &&
        !hasCssChanges
      ) {
        continue;
      }

      const beforeCandidates = findSpotCheckPages(beforeWork, afterPage.pageId);
      const matchedBeforePage = beforeCandidates.find((bp) =>
        spotWindowsMatch(bp, afterPage)
      );

      let rawBeforeHtml = matchedBeforePage?.previewHtml ?? "";
      let hasBefore = matchedBeforePage !== undefined;

      if (!matchedBeforePage && locateInBeforeRender) {
        const { passage: apPassage, notes: apNotes } = splitPassageAndNotes(
          afterPage.previewHtml
        );
        const markedRows = splitPageSectionHtmls(apPassage).map((r) =>
          r.includes("gallery-target")
            ? r
            : r.replace(
                /^<div class="reader-section\b/,
                '<div class="reader-section gallery-target'
              )
        );
        const synthEx: GalleryExemplar = {
          workId: afterWork.workId,
          workTitle: afterWork.title,
          author: afterWork.author,
          sectionId: spotWindowStartId(afterPage),
          pageId: afterPage.pageId,
          readerUrl: afterPage.readerUrl,
          url: afterPage.url,
          teiSnippet: "",
          renderedHtml: joinPassageAndNotesHtml(markedRows.join("\n"), apNotes),
        };
        const located = locateInBeforeRender(synthEx, false);
        if (located?.status === "matched") {
          const { passage: locPassage, notes: locNotes } = splitPassageAndNotes(
            located.html
          );
          const cleanPassage = splitPageSectionHtmls(locPassage)
            .map(stripGalleryTargetClass)
            .join("\n");
          rawBeforeHtml = joinPassageAndNotesHtml(cleanPassage, locNotes);
          hasBefore = true;
        }
      }

      // If `beforeWork` exists, sampled a different page/window for this slot,
      // and `beforeRenderDir` is unavailable to slice the matching window from,
      // do not produce a bogus diff comparing two unrelated passages.
      if (!hasBefore && beforeWork !== undefined) {
        skippedUncomparableSpotWindows++;
        continue;
      }

      const rawAfterHtml = afterPage.previewHtml;
      // A poem split into per-line rows: show Before's lines in After's window.
      const alignedBeforeHtml = hasBefore
        ? alignBeforeLinesToAfter(rawBeforeHtml, rawAfterHtml)
        : undefined;
      const windowedBeforeHtml = alignedBeforeHtml ?? rawBeforeHtml;
      const beforeAsideIdx = windowedBeforeHtml.indexOf(
        '<aside class="reader-notes"'
      );
      const afterAsideIdx = rawAfterHtml.indexOf('<aside class="reader-notes"');
      const beforePassage =
        beforeAsideIdx >= 0
          ? windowedBeforeHtml.slice(0, beforeAsideIdx).trim()
          : windowedBeforeHtml;
      const beforeNotes =
        beforeAsideIdx >= 0
          ? windowedBeforeHtml.slice(beforeAsideIdx)
          : undefined;
      let afterPassage =
        afterAsideIdx >= 0
          ? rawAfterHtml.slice(0, afterAsideIdx).trim()
          : rawAfterHtml;
      const afterNotes =
        afterAsideIdx >= 0 ? rawAfterHtml.slice(afterAsideIdx) : undefined;

      const isHeadingSection = (sec: string) =>
        sec.includes("reader-subheading") && !sec.includes("cite-local");
      const beforeSecs = splitPageSectionHtmls(beforePassage);
      const afterSecs = splitPageSectionHtmls(afterPassage);
      const beforeCitCount = beforeSecs.filter(
        (s) => !isHeadingSection(s)
      ).length;
      const afterCitCount = afterSecs.filter(
        (s) => !isHeadingSection(s)
      ).length;
      if (
        alignedBeforeHtml === undefined &&
        beforeCitCount > 0 &&
        afterCitCount > beforeCitCount
      ) {
        const trimmedAfterSecs: string[] = [];
        let cit = 0;
        for (const sec of afterSecs) {
          trimmedAfterSecs.push(sec);
          if (!isHeadingSection(sec)) {
            cit++;
            if (cit >= beforeCitCount) {
              break;
            }
          }
        }
        afterPassage = trimmedAfterSecs.join("\n");
      }

      const beforeHtml =
        beforeNotes !== undefined
          ? joinPassageAndNotesHtml(
              beforePassage,
              filterNotesHtmlToRefs(beforePassage, beforeNotes)
            )
          : beforePassage;
      const afterHtml =
        afterNotes !== undefined
          ? joinPassageAndNotesHtml(
              afterPassage,
              filterNotesHtmlToRefs(afterPassage, afterNotes)
            )
          : afterPassage;

      const normBefore = normalizePreviewHtml(beforeHtml);
      const normAfter = normalizePreviewHtml(afterHtml);
      const markupChanged = hasBefore && normBefore !== normAfter;
      const cssChanged =
        hasCssChanges &&
        (/\breader-block\b/.test(beforeHtml) ||
          /\breader-block\b/.test(afterHtml));

      if (markupChanged || cssChanged || !hasBefore) {
        changedPages.push({
          role,
          title: afterPage.title,
          pageId: afterPage.pageId,
          citationRange: afterPage.citationRange,
          readerUrl: afterPage.readerUrl,
          beforeHtml,
          afterHtml,
          markupChanged,
          cssChanged,
          hasBefore,
          label: afterPage.label,
          reason: afterPage.reason,
          windowRange: afterPage.windowRange,
        });
      }
    }

    if (changedPages.length > 0) {
      diffWorks.push({
        workId: afterWork.workId,
        author: afterWork.author,
        title: afterWork.title,
        shortTitle: afterWork.shortTitle,
        changedPages,
      });
    }
  }

  let totalChangedExemplars = 0;
  for (const k of diffKinds) {
    totalChangedExemplars += k.changedExemplars.length;
  }
  let totalChangedSpotPages = 0;
  for (const w of diffWorks) {
    totalChangedSpotPages += w.changedPages.length;
  }
  const totalChangedKinds = diffKinds.length;
  const totalChangedWorks = diffWorks.length;

  let globalExIdx = 0;
  const kindsCardsHtml = diffKinds
    .map((k, kindIdx) => {
      const anchorId = `diff-kind-${kindIdx}`;
      const reviewId = `diff-kind:${k.category}:${k.kind}`;
      const exemplarsHtml = k.changedExemplars
        .map((ex) => {
          const exIdx = globalExIdx++;
          const beforeScope = `diff-${exIdx}-b`;
          const afterScope = `diff-${exIdx}-a`;
          const scopedBefore = scopePreviewHtmlIds(
            sanitizeReaderHtmlFragment(ex.beforeHtml),
            beforeScope
          );
          const scopedAfter = scopePreviewHtmlIds(
            sanitizeReaderHtmlFragment(ex.afterHtml),
            afterScope
          );

          // An unpaired exemplar has no Before HTML: show all of After as
          // inserted rather than folding "irrelevant" insertions into context,
          // which would copy After's tokens into the Before pane.
          const diffPair = formatHtmlDiffPair(
            ex.diffBeforeHtml,
            ex.diffAfterHtml,
            ex.paired && ex.status === "changed"
              ? (op) =>
                  isDiffOpRelevantToExemplar(
                    op,
                    k.kind,
                    ex.teiSnippet,
                    ex.inNote
                  )
              : undefined
          );
          const summaryNote =
            ex.status === "unpaired"
              ? " (no paired Before exemplar: newly rendered here, or the Before gallery sampled a different spot)"
              : ex.status === "newly-rendered"
              ? " (newly rendered on this page)"
              : ex.status === "no-longer-rendered"
              ? " (no longer rendered in After)"
              : ex.citationIdChange && ex.diffBeforeHtml === ex.diffAfterHtml
              ? ` (citation anchor change: ${ex.citationIdChange}; passage HTML otherwise identical)`
              : ex.markupChanged
              ? ""
              : ex.cssChanged
              ? " (markup identical; the reader stylesheet differs and this exemplar uses .reader-block)"
              : "";
          const markupDiffHtml = `
            <details class="html-diff-details"${
              ex.paired && ex.markupChanged ? " open" : ""
            }>
              <summary>HTML markup diff${he.escape(summaryNote)}</summary>
              <div class="html-diff-container">
                <div class="html-diff-pane html-diff-pane-before">
                  <div class="diff-col-header">Before HTML (&minus;)</div>
                  <pre><code>${diffPair.beforeRichHtml}</code></pre>
                </div>
                <div class="html-diff-pane html-diff-pane-after">
                  <div class="diff-col-header">After HTML (+)</div>
                  <pre><code>${diffPair.afterRichHtml}</code></pre>
                </div>
              </div>
            </details>`;

          const statusLabel =
            ex.status === "newly-rendered"
              ? "Newly rendered"
              : ex.status === "no-longer-rendered"
              ? "No longer rendered"
              : ex.status === "unpaired"
              ? "Unpaired"
              : "Changed";
          const statusBadgeHtml = `<span class="badge badge-status-${he.escape(
            ex.status
          )} diff-status-${he.escape(ex.status)}">${statusLabel}</span>`;
          const citationBadgeHtml = ex.citationIdChange
            ? ` <span class="badge badge-citation-change diff-citation-change">citation: ${he.escape(
                ex.citationIdChange
              )}</span>`
            : "";
          const alsoKindsHtml =
            ex.alsoKinds.length > 0
              ? `<div class="exemplar-also-kinds">Also the exemplar for: ${ex.alsoKinds
                  .map(
                    (kind) =>
                      `<span class="badge also-kind">${he.escape(kind)}</span>`
                  )
                  .join(" ")}</div>`
              : "";
          return `<div class="exemplar-item" data-status="${he.escape(
            ex.status
          )}"${ex.inNote ? ' data-in-note="true"' : ""}${
            ex.paired ? "" : ' data-unpaired="true"'
          }${ex.cssChanged ? ' data-css-changed="true"' : ""}>
            ${alsoKindsHtml}
            <div class="exemplar-meta">
              <span>${statusBadgeHtml}${citationBadgeHtml} <strong>${he.escape(
            ex.author
          )}</strong>, <em>${he.escape(ex.workTitle)}</em> (<code>${he.escape(
            ex.workId
          )}</code> &middot; page <code>${he.escape(
            ex.pageId
          )}</code> &middot; &sect;<code>${he.escape(
            ex.sectionId
          )}</code>)</span>
              <a class="exemplar-link" href="${he.escape(
                ex.readerUrl
              )}">${he.escape(ex.readerUrl)}</a>
            </div>
            <div class="diff-grid">
              <div class="diff-col">
                <div class="diff-col-header">Source TEI XML</div>
                <pre class="tei-snippet"><code>${he.escape(
                  ex.teiSnippet
                )}</code></pre>
              </div>
              <div class="diff-col">
                <div class="diff-col-header">Before</div>
                <div class="reader-preview reader-view before-scope">${scopedBefore}</div>
              </div>
              <div class="diff-col">
                <div class="diff-col-header">After</div>
                <div class="reader-preview reader-view after-scope">${scopedAfter}</div>
              </div>
            </div>
            ${markupDiffHtml}
          </div>`;
        })
        .join("\n");

      return `<article class="kind-card" id="${he.escape(
        anchorId
      )}" data-kind="${he.escape(k.kind)}" data-category="${he.escape(
        k.category
      )}" data-review-id="${he.escape(reviewId)}">
        <header class="kind-card-header">
          <span class="kind-name">${he.escape(k.kind)}</span>
          <div class="kind-badges">
            <span class="badge">${he.escape(k.category)}</span>
            <span class="badge">${k.changedExemplars.length} changed ${
        k.changedExemplars.length === 1 ? "exemplar" : "exemplars"
      }</span>
            <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="${he.escape(
              reviewId
            )}" /> Reviewed</label>
          </div>
        </header>
        <div class="exemplar-list">
          ${exemplarsHtml}
        </div>
        <footer class="kind-card-footer">
          <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="${he.escape(
            reviewId
          )}" /> Reviewed</label>
        </footer>
      </article>`;
    })
    .join("\n");

  const newCoverageHtml = newCoverage
    .map((item, idx) => {
      const ex = item.exemplar;
      const scopedAfter = scopePreviewHtmlIds(
        sanitizeReaderHtmlFragment(item.previewHtml),
        `diff-new-${idx}-a`
      );
      return `<div class="exemplar-item new-coverage-item">
            <div class="exemplar-also-kinds">${item.kinds
              .map((kind) => `<span class="badge">${he.escape(kind)}</span>`)
              .join(" ")} <span class="badge">${he.escape(
        item.category
      )}</span> <span class="badge">${
        item.reason === "work" ? "work not in Before" : "kind not in Before"
      }</span></div>
            <div class="exemplar-meta">
              <span><strong>${he.escape(ex.author)}</strong>, <em>${he.escape(
        ex.workTitle
      )}</em> (<code>${he.escape(
        ex.workId
      )}</code> &middot; page <code>${he.escape(
        ex.pageId
      )}</code> &middot; &sect;<code>${he.escape(ex.sectionId)}</code>)</span>
              <a class="exemplar-link" href="${he.escape(
                ex.readerUrl
              )}">${he.escape(ex.readerUrl)}</a>
            </div>
            <div class="diff-grid diff-grid-2col">
              <div class="diff-col">
                <div class="diff-col-header">Source TEI XML</div>
                <pre class="tei-snippet"><code>${he.escape(
                  ex.teiSnippet
                )}</code></pre>
              </div>
              <div class="diff-col">
                <div class="diff-col-header">After</div>
                <div class="reader-preview reader-view">${scopedAfter}</div>
              </div>
            </div>
          </div>`;
    })
    .join("\n");
  const filteredTotal =
    filtered.nonRendering +
    filtered.identicalRender +
    filtered.unchangedSpotCheck +
    filtered.unchangedTargetRows +
    filtered.unchangedOnPage +
    filtered.contextOnly +
    filtered.spacerArtifact +
    filtered.duplicates;
  const filterReasons: Array<[number, string]> = [
    [
      filtered.nonRendering,
      "from non-rendering marker kinds (milestone, lb, pb)",
    ],
    [
      filtered.identicalRender,
      "on a page byte-identical in the Before and After renders",
    ],
    [
      filtered.unchangedSpotCheck,
      "whose target rows are unchanged in both galleries' spot-check preview of the page",
    ],
    [
      filtered.unchangedTargetRows,
      "whose target rows are unchanged in the paired Before exemplar",
    ],
    [
      filtered.unchangedOnPage,
      "whose target rows appear unchanged elsewhere on the same page in the Before gallery",
    ],
    [
      filtered.contextOnly,
      "whose own rendered footprint is unchanged (context-only or citation-gutter change)",
    ],
    [
      filtered.spacerArtifact,
      "where the paired Before gallery exemplar captured only empty spacer rows",
    ],
    [filtered.duplicates, "repeating a passage already shown for another kind"],
  ];
  const filteredNoteHtml =
    filteredTotal > 0
      ? `<p class="diff-filter-note">Skipped as unchanged or repeated: ${filterReasons
          .filter(([n]) => n > 0)
          .map(
            ([n, why]) => `${n} ${n === 1 ? "exemplar" : "exemplars"} ${why}`
          )
          .join("; ")}.</p>`
      : "";

  let globalSpotIdx = 0;
  const worksCardsHtml = diffWorks
    .map((w, workIdx) => {
      const anchorId = `diff-work-${workIdx}`;
      const reviewId = `diff-work:${w.workId}`;
      const pagesHtml = w.changedPages
        .map((p) => {
          const spotIdx = globalSpotIdx++;
          const beforeScope = `diff-spot-${spotIdx}-b`;
          const afterScope = `diff-spot-${spotIdx}-a`;
          const scopedBefore = scopePreviewHtmlIds(
            sanitizeReaderHtmlFragment(p.beforeHtml),
            beforeScope
          );
          const scopedAfter = scopePreviewHtmlIds(
            sanitizeReaderHtmlFragment(p.afterHtml),
            afterScope
          );

          const spotDiffPair = formatHtmlDiffPair(
            normalizePreviewHtml(p.beforeHtml),
            normalizePreviewHtml(p.afterHtml)
          );
          const markupDiffHtml = `
            <details class="html-diff-details"${p.markupChanged ? " open" : ""}>
              <summary>HTML markup diff${he.escape(
                !p.hasBefore
                  ? " (no Before spot-check page in this role)"
                  : p.markupChanged
                  ? ""
                  : p.cssChanged
                  ? " (markup identical; the reader stylesheet differs and this page uses .reader-block)"
                  : ""
              )}</summary>
              <div class="html-diff-container">
                <div class="html-diff-pane html-diff-pane-before">
                  <div class="diff-col-header">Before HTML (&minus;)</div>
                  <pre><code>${spotDiffPair.beforeRichHtml}</code></pre>
                </div>
                <div class="html-diff-pane html-diff-pane-after">
                  <div class="diff-col-header">After HTML (+)</div>
                  <pre><code>${spotDiffPair.afterRichHtml}</code></pre>
                </div>
              </div>
            </details>`;

          const slotLabel = p.label ?? p.role.toUpperCase();
          const range = p.windowRange ?? p.citationRange;
          const reasonBadge = p.reason
            ? ` <span class="badge">${he.escape(p.reason)}</span>`
            : "";

          return `<div class="exemplar-item"${
            p.hasBefore ? "" : ' data-unpaired="true"'
          }${p.cssChanged ? ' data-css-changed="true"' : ""}>
            <div class="exemplar-meta">
              <span><strong>${he.escape(slotLabel)}</strong>: ${he.escape(
            p.title
          )} (<code>${he.escape(p.pageId)}</code>, &sect;${he.escape(
            range[0]
          )}&ndash;${he.escape(range[1])})${reasonBadge}</span>
              <a class="exemplar-link" href="${he.escape(
                p.readerUrl
              )}">${he.escape(p.readerUrl)}</a>
            </div>
            <div class="diff-grid diff-grid-2col">
              <div class="diff-col">
                <div class="diff-col-header">Before</div>
                <div class="reader-preview reader-view before-scope">${scopedBefore}</div>
              </div>
              <div class="diff-col">
                <div class="diff-col-header">After</div>
                <div class="reader-preview reader-view after-scope">${scopedAfter}</div>
              </div>
            </div>
            ${markupDiffHtml}
          </div>`;
        })
        .join("\n");

      return `<article class="kind-card" id="${he.escape(
        anchorId
      )}" data-work-id="${he.escape(w.workId)}" data-review-id="${he.escape(
        reviewId
      )}">
        <header class="kind-card-header">
          <span class="kind-name"><code>${he.escape(
            w.workId
          )}</code> &mdash; ${he.escape(w.author)}, <em>${he.escape(
        w.shortTitle ?? w.title
      )}</em></span>
          <div class="kind-badges">
            <span class="badge">${w.changedPages.length} changed ${
        w.changedPages.length === 1 ? "page" : "pages"
      }</span>
            <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="${he.escape(
              reviewId
            )}" /> Reviewed</label>
          </div>
        </header>
        <div class="exemplar-list">
          ${pagesHtml}
        </div>
        <footer class="kind-card-footer">
          <label class="review-toggle-label"><input type="checkbox" class="review-checkbox" data-review-id="${he.escape(
            reviewId
          )}" /> Reviewed</label>
        </footer>
      </article>`;
    })
    .join("\n");

  const diffKey = `${before.label}->${after.label}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Morcus Library Gallery Diff — ${he.escape(
    before.label
  )} vs ${he.escape(after.label)}</title>
  <style>
${GALLERY_CSS}

/* Diff Viewer Grid and Comparison Layout */
.diff-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1.25fr);
  gap: 1rem;
  align-items: start;
}

.diff-grid-2col {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

@media (max-width: 1100px) {
  .diff-grid,
  .diff-grid-2col {
    grid-template-columns: 1fr;
  }
}

.diff-col {
  min-width: 0;
}

.diff-col-header {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}

.html-diff-details {
  margin-top: 0.75rem;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
}

.html-diff-details summary {
  cursor: pointer;
  font-family: var(--font-mono);
  color: var(--link);
  font-weight: 600;
}

.html-diff-container {
  margin-top: 0.5rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 900px) {
  .html-diff-container {
    grid-template-columns: 1fr;
  }
}

.html-diff-pane pre {
  margin: 0;
  padding: 0.5rem;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 16rem;
  overflow-y: auto;
}

.before-scope {
  border-left: 3px solid #d97706;
}

.after-scope {
  border-left: 3px solid #059669;
}

.before-scope .reader-block {
  margin: 1em 0;
}

mark.diff-token-del {
  background: var(--diff-del-bg);
  color: var(--diff-del-fg);
  font-weight: 600;
  padding: 0.08rem 0.22rem;
  border-radius: 3px;
  border: 1px solid var(--diff-del-border);
}

mark.diff-token-ins {
  background: var(--diff-ins-bg);
  color: var(--diff-ins-fg);
  font-weight: 600;
  padding: 0.08rem 0.22rem;
  border-radius: 3px;
  border: 1px solid var(--diff-ins-border);
}

span.diff-ellipsis {
  color: var(--text-muted);
  background: var(--surface-muted);
  padding: 0 0.25rem;
  border-radius: 3px;
  font-style: italic;
}

body[data-highlight-diff="true"] .before-scope .diff-node-changed,
body[data-highlight-diff="true"] .before-scope mark.diff-text-changed {
  background: rgba(239, 68, 68, 0.16);
  outline: 1.5px solid #ef4444;
  border-radius: 2px;
  color: inherit;
}

body[data-highlight-diff="true"] .after-scope .diff-node-changed,
body[data-highlight-diff="true"] .after-scope mark.diff-text-changed {
  background: rgba(34, 197, 94, 0.18);
  outline: 1.5px solid #16a34a;
  border-radius: 2px;
  color: inherit;
}

.exemplar-also-kinds {
  margin-bottom: 0.35rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.diff-filter-note {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.new-coverage-details > summary {
  cursor: pointer;
}

body[data-highlight-diff="true"] .diff-css-changed {
  outline: 1.5px dashed #d97706;
  background: rgba(245, 158, 11, 0.08);
}

${beforeReaderCss ? scopeCssRules(beforeReaderCss, ".before-scope") : ""}
${afterReaderCss ? scopeCssRules(afterReaderCss, ".after-scope") : ""}
  </style>
  <script>
    (function () {
      try {
        var t = localStorage.getItem("morcus-gallery-theme");
        var isDark =
          t === "dark" ||
          (!t &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        if (isDark) {
          document.documentElement.setAttribute("data-theme", "dark");
        } else if (t === "light") {
          document.documentElement.setAttribute("data-theme", "light");
        }
      } catch (e) {}
    })();
  </script>
</head>
<body data-highlight-diff="true">
  <header class="gallery-header">
    <div class="gallery-header-top">
      <h1 class="gallery-title">Morcus Library Gallery Diff: <code>${he.escape(
        before.label
      )}</code> &rarr; <code>${he.escape(after.label)}</code></h1>
      <div class="gallery-meta">
        <span><strong>Changed kinds:</strong> ${totalChangedKinds} (${totalChangedExemplars} exemplars)</span>
        <span><strong>Changed works:</strong> ${totalChangedWorks} (${totalChangedSpotPages} spot-check pages)</span>
      </div>
    </div>
    <div class="gallery-controls">
      <span id="gallery-review-progress" class="gallery-progress-badge">Reviewed: 0 / ${totalChangedKinds} kinds &middot; 0 / ${totalChangedWorks} works</span>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-dark-mode" /> Dark mode</label>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-highlight-diff" checked /> Highlight changes in preview</label>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-hide-reviewed" /> Hide reviewed</label>
      <button type="button" id="gallery-reset-reviewed" class="gallery-btn">Reset progress</button>
    </div>
    <nav class="gallery-nav" aria-label="Diff navigation">
      <a href="#diff-kinds">Changed Kinds (${totalChangedKinds})</a>
      <a href="#diff-new-coverage">New Coverage (${newCoverage.length})</a>
      <a href="#diff-works">Changed Spot-Checks (${totalChangedWorks})</a>
    </nav>
  </header>
  <main class="gallery-main">
    <section id="diff-kinds">
      <h2 class="gallery-section-heading">1. Changed Markup Kind Exemplars (${totalChangedKinds} kinds, ${totalChangedExemplars} exemplars)</h2>
      ${filteredNoteHtml}
      ${
        totalChangedKinds > 0
          ? kindsCardsHtml
          : '<div class="cat-all-reviewed-banner" style="display:block;">No markup kind exemplar differences detected.</div>'
      }
    </section>
    <section id="diff-new-coverage">
      <details class="new-coverage-details">
        <summary class="gallery-section-heading">Newly Covered Markup Kinds (Not in Before Gallery): ${
          newCoverage.length
        } ${newCoverage.length === 1 ? "exemplar" : "exemplars"}</summary>
        <p class="diff-filter-note">Exemplars from works or kinds the Before gallery doesn't have. There is nothing to compare them with; review them in the delta gallery.</p>
        ${newCoverageHtml}
      </details>
    </section>
    <section id="diff-works">
      <h2 class="gallery-section-heading">2. Changed Per-Work Spot-Checks (${totalChangedWorks} works, ${totalChangedSpotPages} pages)</h2>
      ${
        skippedUncomparableSpotWindows > 0
          ? `<p class="diff-filter-note">${skippedUncomparableSpotWindows} spot-check ${
              skippedUncomparableSpotWindows === 1 ? "window" : "windows"
            } skipped: no comparable Before window.</p>`
          : ""
      }
      ${
        totalChangedWorks > 0
          ? worksCardsHtml
          : '<div class="cat-all-reviewed-banner" style="display:block;">No spot-check page differences detected.</div>'
      }
    </section>
  </main>
  <script>
    var DIFF_KEY = ${JSON.stringify(diffKey).replace(/</g, "\\u003c")};
    var storageKey = "morcus-gallery-diff-reviewed:" + DIFF_KEY;
    var reviewedSet = new Set();

    function findReviewElements(id) {
      var results = [];
      var all = document.querySelectorAll("[data-review-id]");
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute("data-review-id") === id) {
          results.push(all[i]);
        }
      }
      return results;
    }

    function applyReviewedState(id, isReviewed) {
      if (isReviewed) {
        reviewedSet.add(id);
      } else {
        reviewedSet.delete(id);
      }

      var elements = findReviewElements(id);
      elements.forEach(function (el) {
        if (el.tagName === "INPUT" && el.type === "checkbox") {
          el.checked = isReviewed;
        } else {
          if (isReviewed) {
            el.setAttribute("data-reviewed", "true");
            el.classList.add("is-reviewed");
          } else {
            el.removeAttribute("data-reviewed");
            el.classList.remove("is-reviewed");
          }
        }
      });
    }

    function updateProgress() {
      var totalKinds = document.querySelectorAll('article.kind-card[data-review-id^="diff-kind:"]').length;
      var reviewedKinds = document.querySelectorAll('article.kind-card[data-review-id^="diff-kind:"][data-reviewed="true"]').length;
      var totalWorks = document.querySelectorAll('article.kind-card[data-review-id^="diff-work:"]').length;
      var reviewedWorks = document.querySelectorAll('article.kind-card[data-review-id^="diff-work:"][data-reviewed="true"]').length;

      var progressBadge = document.getElementById("gallery-review-progress");
      if (progressBadge) {
        progressBadge.textContent = "Reviewed: " + reviewedKinds + " / " + totalKinds + " kinds · " + reviewedWorks + " / " + totalWorks + " works";
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(reviewedSet)));
      } catch (err) {}
    }

    // Load from localStorage
    try {
      var saved = localStorage.getItem(storageKey);
      if (saved) {
        var arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          arr.forEach(function (id) {
            applyReviewedState(id, true);
          });
        }
      }
      var savedHide = localStorage.getItem(storageKey + ":hide");
      if (savedHide === "true") {
        var hideCb = document.getElementById("gallery-hide-reviewed");
        if (hideCb) hideCb.checked = true;
        document.body.setAttribute("data-hide-reviewed", "true");
      }
    } catch (err) {}

    var THEME_KEY = "morcus-gallery-theme";
    var darkModeCheckbox = document.getElementById("gallery-dark-mode");
    function initGalleryTheme() {
      var savedTheme = null;
      try {
        savedTheme = localStorage.getItem(THEME_KEY);
      } catch (e) {}

      var isDark = false;
      if (savedTheme === "dark" || savedTheme === "light") {
        isDark = savedTheme === "dark";
        document.documentElement.setAttribute("data-theme", savedTheme);
        if (document.body) {
          document.body.setAttribute("data-theme", savedTheme);
        }
      } else {
        isDark = Boolean(
          window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
        );
        if (isDark) {
          document.documentElement.setAttribute("data-theme", "dark");
          if (document.body) {
            document.body.setAttribute("data-theme", "dark");
          }
        }
      }
      if (darkModeCheckbox) {
        darkModeCheckbox.checked = isDark;
      }
    }
    initGalleryTheme();

    if (darkModeCheckbox) {
      darkModeCheckbox.addEventListener("change", function () {
        var theme = darkModeCheckbox.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        if (document.body) {
          document.body.setAttribute("data-theme", theme);
        }
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (err) {}
      });
    }

    updateProgress();

    document.addEventListener("change", function (e) {
      var target = e.target;
      if (!target) return;
      if (target.classList && target.classList.contains("review-checkbox")) {
        var id = target.getAttribute("data-review-id");
        if (id) {
          applyReviewedState(id, target.checked);
          updateProgress();
        }
      } else if (target.id === "gallery-dark-mode") {
        var theme = target.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        if (document.body) {
          document.body.setAttribute("data-theme", theme);
        }
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (err) {}
      } else if (target.id === "gallery-hide-reviewed") {
        if (target.checked) {
          document.body.setAttribute("data-hide-reviewed", "true");
          try {
            localStorage.setItem(storageKey + ":hide", "true");
          } catch (err) {}
        } else {
          document.body.removeAttribute("data-hide-reviewed");
          try {
            localStorage.removeItem(storageKey + ":hide");
          } catch (err) {}
        }
      } else if (target.id === "gallery-highlight-diff") {
        if (target.checked) {
          document.body.setAttribute("data-highlight-diff", "true");
        } else {
          document.body.removeAttribute("data-highlight-diff");
        }
      }
    });

    function highlightTextDiff(bTextNode, aTextNode) {
      var bStr = bTextNode.nodeValue || "";
      var aStr = aTextNode.nodeValue || "";
      if (bStr === aStr) return;
      var p = 0;
      var minL = Math.min(bStr.length, aStr.length);
      while (p < minL && bStr.charAt(p) === aStr.charAt(p)) p++;
      var s = 0;
      while (s < minL - p && bStr.charAt(bStr.length - 1 - s) === aStr.charAt(aStr.length - 1 - s)) s++;

      function wrapMid(textNode, str, pref, suff) {
        var mid = str.slice(pref, str.length - suff);
        if (!mid) return;
        var frag = document.createDocumentFragment();
        if (pref > 0) frag.appendChild(document.createTextNode(str.slice(0, pref)));
        var mark = document.createElement("mark");
        mark.className = "diff-text-changed";
        mark.textContent = mid;
        frag.appendChild(mark);
        if (suff > 0) frag.appendChild(document.createTextNode(str.slice(str.length - suff)));
        if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
      }
      wrapMid(bTextNode, bStr, p, s);
      wrapMid(aTextNode, aStr, p, s);
    }

    function isBlockKind(kind) {
      if (!kind) return true;
      return kind === "p" || kind.indexOf("p@") === 0 || kind === "ab" || kind.indexOf("ab@") === 0;
    }

    function filterDomChildren(node, kind) {
      var list = Array.prototype.slice.call(node.childNodes);
      return list.filter(function (c) {
        if (c.nodeType === 1 && c.classList.contains("gallery-elided")) {
          return false;
        }
        if (c.nodeType === 1 && c.tagName === "P" && c.children.length === 0 && (!c.textContent || c.textContent.trim() === "")) {
          if (isBlockKind(kind)) {
            c.classList.add("diff-node-changed");
          }
          return false;
        }
        return true;
      });
    }

    function isInsertedHeadingSection(el) {
      return (
        el &&
        el.nodeType === 1 &&
        el.classList &&
        el.classList.contains("reader-section") &&
        !el.id &&
        Boolean(el.querySelector(".reader-subheading"))
      );
    }

    function alignSectionChildren(bList, aList) {
      var aHasHeading = aList.some(isInsertedHeadingSection);
      if (aHasHeading) {
        var bHeadingTexts = {};
        for (var j = 0; j < bList.length; j++) {
          if (isInsertedHeadingSection(bList[j])) {
            bHeadingTexts[(bList[j].textContent || "").trim()] = true;
          }
        }
        var filteredA = [];
        var removedAny = false;
        for (var i = 0; i < aList.length; i++) {
          if (
            isInsertedHeadingSection(aList[i]) &&
            !bHeadingTexts[(aList[i].textContent || "").trim()]
          ) {
            aList[i].classList.add("diff-node-changed");
            removedAny = true;
            if (
              i + 1 < aList.length &&
              aList[i + 1].nodeType === 3 &&
              (!aList[i + 1].nodeValue || aList[i + 1].nodeValue.trim() === "")
            ) {
              i++;
            }
            continue;
          }
          filteredA.push(aList[i]);
        }
        if (removedAny) {
          return [bList, filteredA];
        }
      }
      return [bList, aList];
    }

    function diffDomPair(bNode, aNode, kind) {
      if (!bNode && !aNode) return;
      if (!bNode && aNode) {
        if (aNode.nodeType === 1) {
          aNode.classList.add("diff-node-changed");
        } else if (
          aNode.nodeType === 3 &&
          (aNode.nodeValue || "").trim() !== "" &&
          aNode.parentNode &&
          aNode.parentNode.nodeType === 1
        ) {
          aNode.parentNode.classList.add("diff-node-changed");
        }
        return;
      }
      if (bNode && !aNode) {
        if (bNode.nodeType === 1) {
          bNode.classList.add("diff-node-changed");
        } else if (
          bNode.nodeType === 3 &&
          (bNode.nodeValue || "").trim() !== "" &&
          bNode.parentNode &&
          bNode.parentNode.nodeType === 1
        ) {
          bNode.parentNode.classList.add("diff-node-changed");
        }
        return;
      }
      if (!bNode || !aNode) return;
      if (bNode.nodeType === 3 && aNode.nodeType === 3) {
        highlightTextDiff(bNode, aNode);
        return;
      }
      if (bNode.nodeType === 1 && aNode.nodeType === 1) {
        var isParagraphWrapperDiff =
          bNode.tagName === "P" && aNode.tagName === "P" && !isBlockKind(kind);
        if (
          !isParagraphWrapperDiff &&
          (bNode.tagName !== aNode.tagName || bNode.className !== aNode.className)
        ) {
          bNode.classList.add("diff-node-changed");
          aNode.classList.add("diff-node-changed");
        }
        var aligned = alignSectionChildren(
          filterDomChildren(bNode, kind),
          filterDomChildren(aNode, kind)
        );
        var bChildren = aligned[0];
        var aChildren = aligned[1];
        var maxC = Math.max(bChildren.length, aChildren.length);
        for (var i = 0; i < maxC; i++) {
          diffDomPair(bChildren[i], aChildren[i], kind);
        }
      } else {
        if (bNode.nodeType === 1) bNode.classList.add("diff-node-changed");
        if (aNode.nodeType === 1) aNode.classList.add("diff-node-changed");
      }
    }

    function collectPassageChildren(passages, kind) {
      var out = [];
      for (var i = 0; i < passages.length; i++) {
        var children = filterDomChildren(passages[i], kind);
        for (var j = 0; j < children.length; j++) {
          var c = children[j];
          if (c.nodeType === 3 && (!c.nodeValue || c.nodeValue.trim() === "")) {
            continue;
          }
          out.push(c);
        }
      }
      return out;
    }

    document.querySelectorAll(".exemplar-item").forEach(function (item) {
      var bScope = item.querySelector(".before-scope");
      var aScope = item.querySelector(".after-scope");
      if (!bScope || !aScope) return;
      // Nothing to compare an unpaired After preview with.
      if (item.getAttribute("data-unpaired") === "true") return;
      var card = item.closest(".kind-card");
      var kind = card ? card.getAttribute("data-kind") : null;
      var inNote = item.getAttribute("data-in-note") === "true";
      if (inNote) {
        var bNotes = bScope.querySelector(".reader-notes");
        var aNotes = aScope.querySelector(".reader-notes");
        if (bNotes && !aNotes) {
          bNotes.classList.add("diff-node-changed");
          var bNoteLi = bNotes.querySelector("li.reader-note");
          var bTargetHref = bNoteLi && bNoteLi.id ? "#" + bNoteLi.id : null;
          bScope.querySelectorAll(".reader-note-ref").forEach(function (el) {
            if (!bTargetHref || el.getAttribute("href") === bTargetHref) {
              el.classList.add("diff-node-changed");
            }
          });
        } else if (!bNotes && aNotes) {
          aNotes.classList.add("diff-node-changed");
          var aNoteLi = aNotes.querySelector("li.reader-note");
          var aTargetHref = aNoteLi && aNoteLi.id ? "#" + aNoteLi.id : null;
          aScope.querySelectorAll(".reader-note-ref").forEach(function (el) {
            if (!aTargetHref || el.getAttribute("href") === aTargetHref) {
              el.classList.add("diff-node-changed");
            }
          });
        } else {
          diffDomPair(bNotes || bScope, aNotes || aScope, kind);
        }
      } else if (kind) {
        var bPassages = Array.prototype.slice.call(
          bScope.querySelectorAll(".reader-passage")
        );
        var aPassages = Array.prototype.slice.call(
          aScope.querySelectorAll(".reader-passage")
        );
        if (bPassages.length === 1 && aPassages.length === 1) {
          diffDomPair(bPassages[0], aPassages[0], kind);
        } else if (bPassages.length > 0 && aPassages.length > 0) {
          var bHeadingSet = {};
          bPassages.forEach(function (p) {
            var sec = p.closest(".reader-section");
            if (isInsertedHeadingSection(sec)) {
              bHeadingSet[(sec.textContent || "").trim()] = true;
            }
          });
          var filteredAPassages = [];
          aPassages.forEach(function (p) {
            var sec = p.closest(".reader-section");
            if (
              isInsertedHeadingSection(sec) &&
              !bHeadingSet[(sec.textContent || "").trim()]
            ) {
              sec.classList.add("diff-node-changed");
            } else {
              filteredAPassages.push(p);
            }
          });
          if (bPassages.length === 1 && filteredAPassages.length === 1) {
            diffDomPair(bPassages[0], filteredAPassages[0], kind);
          } else {
            var bFlat = collectPassageChildren(bPassages, kind);
            var aFlat = collectPassageChildren(filteredAPassages, kind);
            var maxFlat = Math.max(bFlat.length, aFlat.length);
            for (var k = 0; k < maxFlat; k++) {
              diffDomPair(bFlat[k], aFlat[k], kind);
            }
          }
        } else {
          diffDomPair(bScope, aScope, kind);
        }
      } else {
        diffDomPair(bScope, aScope, kind);
      }
      if (!item.querySelector(".diff-node-changed, .diff-text-changed")) {
        if (item.getAttribute("data-css-changed") === "true") {
          item.querySelectorAll(".reader-block").forEach(function (el) {
            el.classList.add("diff-css-changed");
          });
        } else {
          var bAnchors = bScope.querySelectorAll(".reader-gutter .section-anchor");
          var aAnchors = aScope.querySelectorAll(".reader-gutter .section-anchor");
          if (aAnchors.length > bAnchors.length) {
            aAnchors.forEach(function (el) {
              el.classList.add("diff-node-changed");
            });
          } else if (bAnchors.length > aAnchors.length) {
            bAnchors.forEach(function (el) {
              el.classList.add("diff-node-changed");
            });
          }
        }
      }
    });

    var resetBtn = document.getElementById("gallery-reset-reviewed");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var ids = Array.from(reviewedSet);
        ids.forEach(function (id) {
          applyReviewedState(id, false);
        });
        reviewedSet.clear();
        try {
          localStorage.removeItem(storageKey);
        } catch (err) {}
        updateProgress();
      });
    }
  </script>
</body>
</html>
`;
}

/**
 * Builds the exemplar review gallery from a `canonical-latinLit` checkout and
 * writes `gallery.json`, `gallery.md`, and `index.html` to `<out>/<label>/`.
 */
export function buildGallery(options: GalleryOptions = {}): GalleryResult {
  const root = path.resolve(
    options.root ?? envVar("LIB_XML_ROOT", "unsafe") ?? ""
  );
  if (!fs.existsSync(path.join(root, "data"))) {
    throw new Error(
      `No canonical-latinLit checkout at '${root}': pass --root= or set LIB_XML_ROOT.`
    );
  }
  const latinLitCommit = gitShortSha(root);
  const morcusCommit = gitShortSha(process.cwd());
  const label =
    options.label ??
    `${latinLitCommit ?? "unknown"}-${morcusCommit ?? "unknown"}`;
  if (label.length === 0 || /[/\\]|^\.\.?$/.test(label)) {
    throw new Error(`Invalid label '${label}'`);
  }
  const maxExamples = options.maxExamples ?? GALLERY_MAX_EXAMPLES_DEFAULT;
  if (!Number.isFinite(maxExamples) || maxExamples < 0) {
    throw new Error(`Invalid --max-examples '${String(options.maxExamples)}'`);
  }

  const outRoot = path.resolve(options.out ?? GALLERY_OUT_DEFAULT);
  const dir = path.join(outRoot, label);
  const buildDir = path.resolve("build");
  if (dir === buildDir || dir.startsWith(buildDir + path.sep)) {
    throw new Error(`Refusing to write a gallery under build/: ${dir}`);
  }

  const patches = options.patches ?? loadPatches();
  const files = selectGalleryWorkFiles(root, {
    works: options.works,
    includeCandidates: options.includeCandidates,
  });

  // Also include any existing English translation files so `preprocessPerseusWorks`
  // attaches translation metadata identically to production.
  const translationPaths: string[] = [];
  for (const file of files) {
    const trId = EnglishTranslations[file.workId];
    if (trId) {
      const trPath = path.join(root, workIdToRelPath(trId));
      if (fs.existsSync(trPath)) {
        translationPaths.push(trPath);
      }
    }
  }

  const precomputedByWorkId = new Map<
    string,
    { work: ProcessedWork2; v2Work: V2PreprocessedWork }
  >();
  const preprocessErrors = new Map<string, unknown>();

  preprocessPerseusWorks(
    [...translationPaths, ...files.map((f) => f.absPath)],
    {
      patches,
      onV2Work: (v2Work, work) => {
        precomputedByWorkId.set(v2Work.id, { work, v2Work });
      },
      onError: (workId, err) => {
        preprocessErrors.set(workId, err);
      },
    }
  );

  for (const file of files) {
    if (file.onboarded && preprocessErrors.has(file.workId)) {
      const err = preprocessErrors.get(file.workId);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Onboarded work '${
          file.workId
        }' failed gallery processing: ${firstLineOf(msg)}`
      );
    }
  }

  const inputs: GalleryWorkInput[] = [];
  const candidateFailures: Record<string, string> = {};
  for (const file of files) {
    if (preprocessErrors.has(file.workId)) {
      const err = preprocessErrors.get(file.workId);
      const msg = err instanceof Error ? err.message : String(err);
      candidateFailures[file.workId] = firstLineOf(msg).slice(0, 160);
      continue;
    }
    inputs.push({
      workId: file.workId,
      rawXml: fs.readFileSync(file.absPath, "utf8"),
      onboarded: file.onboarded,
      absPath: file.absPath,
      patches: patches.get(file.workId),
      precomputed: precomputedByWorkId.get(file.workId),
    });
  }

  const { analyses, failures } = analyzeGalleryInputs(inputs, maxExamples);
  const reportOptions: BuildGalleryFromWorksOptions = {
    label,
    root,
    latinLitCommit,
    morcusCommit,
    includeCandidates: options.includeCandidates,
    maxExamples,
  };
  const report = aggregateGalleryReport(analyses, failures, reportOptions);
  for (const [failedWorkId, errMsg] of Object.entries(candidateFailures)) {
    report.failures[failedWorkId] = errMsg;
  }
  report.totals.failedCount = Object.keys(report.failures).length;

  writeGalleryFiles(dir, report);

  if (options.compareWith) {
    const beforeReport = loadGalleryReport(options.compareWith, outRoot);
    fs.writeFileSync(
      path.join(dir, "diff.html"),
      renderGalleryDiffHtml(beforeReport, report, undefined, undefined, {
        beforeRenderDir: options.beforeRenderDir,
        afterRenderDir: options.afterRenderDir,
      })
    );
  }

  let deltaDir: string | undefined;
  let deltaReport: GalleryReport | undefined;
  if (options.deltaFrom) {
    const prior = loadGalleryReport(options.deltaFrom, outRoot);
    deltaReport = deltaReportFromAnalyses(analyses, prior, reportOptions);
    deltaDir = path.join(outRoot, deltaReport.label);
    writeGalleryFiles(deltaDir, deltaReport);
  }

  if (!options.quiet) {
    console.log(
      `Gallery built: ${report.totals.worksProcessed} works (${report.totals.onboardedCount} onboarded, ${report.totals.candidateCount} candidates), ` +
        `${report.totals.markupKindCount} markup kinds → ${dir}/{gallery.json,gallery.md,index.html}`
    );
    if (deltaReport && deltaDir) {
      console.log(
        `Delta gallery: ${deltaReport.totals.worksProcessed} newly onboarded works, ` +
          `${deltaReport.totals.markupKindCount} newly exercised markup kinds → ${deltaDir}/`
      );
    }
  }
  return { dir, report, deltaDir, deltaReport };
}

function writeGalleryFiles(dir: string, report: GalleryReport): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "gallery.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  fs.writeFileSync(path.join(dir, "gallery.md"), formatGalleryMarkdown(report));
  fs.writeFileSync(path.join(dir, "index.html"), formatGalleryHtml(report));
}

/**
 * Resolves a `gallery.json` path, a gallery directory, or a label under
 * `outRoot` to the `gallery.json` path.
 */
function resolveGalleryReportPath(ref: string, outRoot: string): string {
  const dirOrFile = fs.existsSync(ref) ? ref : path.join(outRoot, ref);
  const p =
    fs.existsSync(dirOrFile) && fs.statSync(dirOrFile).isDirectory()
      ? path.join(dirOrFile, "gallery.json")
      : dirOrFile;
  if (!fs.existsSync(p)) {
    throw new Error(`No gallery report at '${ref}' (looked for ${p})`);
  }
  return p;
}

/**
 * Loads a gallery report from a `gallery.json` path, a gallery directory, or
 * a label under `outRoot`.
 */
export function loadGalleryReport(
  ref: string | GalleryReport,
  outRoot: string = path.resolve(GALLERY_OUT_DEFAULT)
): GalleryReport {
  if (typeof ref !== "string") {
    return ref;
  }
  return JSON.parse(
    fs.readFileSync(resolveGalleryReportPath(ref, outRoot), "utf8")
  );
}

export interface GalleryDiffCliOptions extends GalleryDiffOptions {
  /** Before gallery: label under `out`, directory, or `gallery.json`. */
  before: string;
  /** After gallery: label under `out`, directory, or `gallery.json`. */
  after: string;
  /** Output file (default: `diff.html` next to the After `gallery.json`). */
  output?: string;
  /** Gallery output root for labels (default: `.cache/library-gallery`). */
  out?: string;
  quiet?: boolean;
}

/**
 * Writes `diff.html` comparing two existing galleries, without rebuilding
 * either. Returns the path written.
 */
export function writeGalleryDiff(options: GalleryDiffCliOptions): string {
  const outRoot = path.resolve(options.out ?? GALLERY_OUT_DEFAULT);
  const beforeReport = loadGalleryReport(options.before, outRoot);
  const afterPath = resolveGalleryReportPath(options.after, outRoot);
  const afterReport = loadGalleryReport(afterPath, outRoot);
  const output = path.resolve(
    options.output ?? path.join(path.dirname(afterPath), "diff.html")
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    renderGalleryDiffHtml(beforeReport, afterReport, undefined, undefined, {
      beforeRenderDir: options.beforeRenderDir,
      afterRenderDir: options.afterRenderDir,
    })
  );
  if (!options.quiet) {
    console.log(`Gallery diff written: ${output}`);
  }
  return output;
}

/** CLI entry point for `./morcus.sh library gallery-diff`. */
export async function runGalleryDiffCli(
  options: GalleryDiffCliOptions
): Promise<boolean> {
  try {
    writeGalleryDiff(options);
    return true;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return false;
  }
}

/** CLI entry point for `./morcus.sh library gallery`. */
export async function runGalleryCli(
  options: GalleryOptions = {}
): Promise<boolean> {
  try {
    buildGallery(options);
    return true;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return false;
  }
}
