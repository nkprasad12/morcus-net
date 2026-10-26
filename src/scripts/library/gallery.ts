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
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { gitShortSha } from "@/scripts/library/render";
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
  /** Optional previous gallery report or directory to compare against and write diff.html. */
  compareWith?: string | GalleryReport;
  /** Suppress progress output. */
  quiet?: boolean;
}

export interface GalleryResult {
  dir: string;
  report: GalleryReport;
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
  const startPattern = /<li class="reader-note"[^>]*>/g;
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

function collectNoteIdsInRow(
  node: XmlNode | string,
  out: number[]
): void {
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

      let loc = bySectionId.get(rawDotId);
      if (!loc) {
        loc = {
          pageId,
          sectionId: effectiveSecId,
          rowHtmls: [],
          pageRowHtmls,
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
          byTarget.set(xmlId, child);
          byTarget.set(norm, child);
          byTarget.set(`#${norm}`, child);
          detachedNodes.add(child);
          continue;
        }
      }
      scanTargetsAndXmlIds(child);
    }
  };
  scanTargetsAndXmlIds(body);
  // As in `deepcopyAndExtract`: without any `<note target>`, `<note xml:id>`s
  // are ordinary inline notes (Ovid's Ex Ponto), not detached bodies.
  if (referencedTargets.size === 0) {
    detachedNodes.clear();
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

function buildSpotCheckPage(
  v2Work: V2PreprocessedWork,
  page: V2PreprocessedPage,
  role: "first" | "middle" | "last",
  maxPreviewSections = 5
): GalleryPageSpotCheck {
  const pageId = Array.isArray(page.id) ? page.id.join(".") : page.id;
  const readerUrl = `/work/${v2Work.urlAuthor}/${v2Work.urlName}/${pageId}`;
  const sections = splitPageSectionHtmls(page.singleHtml);
  const previewSections = sections.slice(0, maxPreviewSections).join("\n");
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
  };
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
    if (acc.candidates.length >= candidateLimit || resolvedSecId === undefined) {
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

  const makeBodyExemplar = (
    node: XmlNode,
    loc: SectionRenderLocation | undefined,
    options?: { fullPage?: boolean; adjacentRows?: boolean }
  ): GalleryExemplar | undefined => {
    if (!loc) {
      return undefined;
    }
    const targetOffsets = new Set(loc.rowOffsetsInPage);
    let passageHtml: string;
    if (options?.fullPage) {
      const markedPageRows = loc.pageRowHtmls.map((rowHtml, idx) =>
        targetOffsets.has(idx) ? markGalleryTargetRow(rowHtml) : rowHtml
      );
      passageHtml = markedPageRows.join("\n");
    } else if (options?.adjacentRows && loc.rowOffsetsInPage.length > 0) {
      const firstOffset = loc.rowOffsetsInPage[0];
      const start = Math.max(0, firstOffset - 1);
      const end = Math.min(loc.pageRowHtmls.length, firstOffset + 2);
      const sliceRows = loc.pageRowHtmls
        .slice(start, end)
        .map((rowHtml, idx) =>
          targetOffsets.has(start + idx)
            ? markGalleryTargetRow(rowHtml)
            : rowHtml
        );
      passageHtml = sliceRows.join("\n");
    } else {
      const markedRows = loc.rowHtmls
        .slice(0, 3)
        .map((rowHtml, idx) =>
          idx === 0 ? markGalleryTargetRow(rowHtml) : rowHtml
        );
      passageHtml = markedRows.join("\n");
    }
    const filteredNotes = filterNotesHtmlToRefs(
      passageHtml,
      loc.pageNotesHtml
    );
    const renderedHtml = joinPassageAndNotesHtml(passageHtml, filteredNotes);
    const readerUrl = buildReaderSectionUrl(
      v2Work.urlAuthor,
      v2Work.urlName,
      loc.pageId,
      loc.sectionId
    );
    return {
      workId: input.workId,
      workTitle: v2Work.shortTitle ?? v2Work.title,
      author: v2Work.author,
      sectionId: loc.sectionId,
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
        recordKind(
          `w@type="${wType}"`,
          "attr",
          resolvedSecId,
          inNote,
          buildEx
        );
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
      recordKind(`note:${child.name}`, "note-element", noteSecId, true, buildEx);

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
        recordKind(
          `note@${rend.trim()}`,
          "rend",
          noteSecId,
          true,
          buildNoteEx
        );
      }

      const bodyToWalk = targetNode ?? node;
      walkNoteDescendants(bodyToWalk, noteId);
      return;
    }

    const loc = resolveSectionLocation(dotSecId, indexed);
    const resolvedSecId = loc?.sectionId;
    const buildBodyEx = () => makeBodyExemplar(node, loc);
    const buildAdjacentEx = () =>
      makeBodyExemplar(node, loc, { adjacentRows: true });
    const buildFullPageEx = () =>
      makeBodyExemplar(node, loc, { fullPage: true });

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
      const hasLgAncestor = ancestors
        .slice(0, -1)
        .some((a) => a.name === "lg");
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

  const first =
    v2Work.pages.length > 0
      ? buildSpotCheckPage(v2Work, v2Work.pages[0], "first")
      : undefined;
  const midIdx = Math.floor((v2Work.pages.length - 1) / 2);
  const middle =
    v2Work.pages.length > 0
      ? buildSpotCheckPage(v2Work, v2Work.pages[midIdx], "middle")
      : undefined;
  const last =
    v2Work.pages.length > 0
      ? buildSpotCheckPage(
          v2Work,
          v2Work.pages[v2Work.pages.length - 1],
          "last"
        )
      : undefined;

  const spotCheckPages = [first, middle, last].filter(
    (p): p is GalleryPageSpotCheck => p !== undefined
  );

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
  const label = options.label ?? "gallery";
  const root = options.root ?? "";
  const includeCandidates = Boolean(options.includeCandidates);

  const works: GalleryWorkSpotCheck[] = [];
  const failures: Record<string, string> = {};
  const kindMap = new Map<
    string,
    {
      category: MarkupCategory;
      workCount: number;
      occurrenceCount: number;
      perWorkCandidates: GalleryExemplar[][];
    }
  >();

  const sortedInputs = [...inputs].sort((a, b) =>
    a.workId < b.workId ? -1 : a.workId > b.workId ? 1 : 0
  );

  for (const input of sortedInputs) {
    try {
      const analyzed = analyzeWorkForGallery(
        input,
        Math.max(1, maxExamples)
      );
      works.push(analyzed.spotCheck);
      for (const [kind, acc] of analyzed.kinds.entries()) {
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (input.onboarded) {
        throw new Error(
          `Onboarded work '${input.workId}' failed gallery processing: ${firstLineOf(
            msg
          )}`
        );
      }
      failures[input.workId] = firstLineOf(msg).slice(0, 160);
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
      `- **Commits**: latinLit \`${report.latinLitCommit ?? "?"}\`, morcus-net \`${
        report.morcusCommit ?? "?"
      }\``
    );
  }
  P(
    `- **Works processed**: ${t.worksProcessed} (${t.onboardedCount} onboarded, ${t.candidateCount} candidate${
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
          `[\`${escapeMdCell(ex.workId)} ${escapeMdCell(
            ex.sectionId
          )}\`](${ex.readerUrl})`
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
    P(`### \`${k.kind}\` (${k.category} — ${k.workCount} works, ${k.occurrenceCount}×)`);
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
  const safe = `${category}-${kind}`.replace(/[^a-zA-Z0-9_-]/g, (c) =>
    `_${c.charCodeAt(0).toString(16)}_`
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
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-serif: "eb garamond", "Palatino Linotype", Palatino, Georgia, serif;
  --font-text: "eb garamond", "Palatino Linotype", Palatino, Georgia, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --reader-base: 1.12rem;
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
  opacity: 0.75;
  background: #e8f5e9;
  border-color: #a5d6a7;
  color: #2e7d32;
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
  border-color: #a5d6a7;
}

.kind-card[data-reviewed="true"] .kind-card-header,
.kind-card.is-reviewed .kind-card-header {
  background: #f1f8e9;
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
  border-color: #a5d6a7;
  background: #fdfefd;
}

.work-details[data-reviewed="true"] summary,
.work-details.is-reviewed summary {
  color: #2e7d32;
}

tr[data-reviewed="true"],
tr.is-reviewed {
  background: #f1f8e9;
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
              )}</em> (<code>${he.escape(ex.workId)}</code> &middot; page <code>${he.escape(
                ex.pageId
              )}</code> &middot; &sect;<code>${he.escape(ex.sectionId)}</code>)${
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
      const pageAnchor = (p?: GalleryPageSpotCheck) =>
        p
          ? `<a class="exemplar-link" href="${he.escape(
              p.readerUrl
            )}">${he.escape(p.pageId)}</a>`
          : "&mdash;";
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
          return `<div class="spot-page-card">
          <div class="spot-page-header">
            <span><strong>${he.escape(p.role.toUpperCase())}</strong>: ${he.escape(
            p.title
          )} (<code>${he.escape(p.pageId)}</code>, &sect;${he.escape(
            p.citationRange[0]
          )}&ndash;${he.escape(p.citationRange[1])})</span>
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
      )}" data-work-id="${he.escape(w.workId)}" data-review-id="work:${he.escape(
        w.workId
      )}">
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
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-hide-reviewed" /> Hide reviewed</label>
      <button type="button" id="gallery-reset-reviewed" class="gallery-btn">Reset progress</button>
    </div>
    <nav class="gallery-nav" aria-label="Gallery navigation">
      <a href="#cat-element">Content Elements</a>
      <a href="#cat-note-element">Note Elements</a>
      <a href="#cat-rend">Element @rend</a>
      <a href="#cat-note-rend">Note @rend</a>
      <a href="#cat-attr">Attributes</a>
      <a href="#cat-layout">Complex Layouts</a>
      <a href="#spot-check-index">Per-Work Spot-Check Index (${
        t.worksProcessed
      })</a>${
        failureEntries.length > 0
          ? `\n      <a href="#failures">Failed Candidates (${failureEntries.length})</a>`
          : ""
      }
    </nav>
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

    var GALLERY_LABEL = ${JSON.stringify(report.label).replace(/</g, "\\u003c")};
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

    function diffDomPair(bNode, aNode) {
      if (!bNode && !aNode) return;
      if (!bNode && aNode && aNode.nodeType === 1) {
        aNode.classList.add("diff-node-changed");
        return;
      }
      if (bNode && !aNode && bNode.nodeType === 1) {
        bNode.classList.add("diff-node-changed");
        return;
      }
      if (!bNode || !aNode) return;
      if (bNode.nodeType === 3 && aNode.nodeType === 3) {
        highlightTextDiff(bNode, aNode);
        return;
      }
      if (bNode.nodeType === 1 && aNode.nodeType === 1) {
        if (bNode.tagName !== aNode.tagName || bNode.className !== aNode.className) {
          bNode.classList.add("diff-node-changed");
          aNode.classList.add("diff-node-changed");
        }
        var bChildren = Array.prototype.slice.call(bNode.childNodes);
        var aChildren = Array.prototype.slice.call(aNode.childNodes);
        var maxC = Math.max(bChildren.length, aChildren.length);
        for (var i = 0; i < maxC; i++) {
          diffDomPair(bChildren[i], aChildren[i]);
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
      diffDomPair(bScope, aScope);
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
  return html
    .replace(/(?:ex|spot)-\d+(?:-\d+)+-/g, "")
    .trim();
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

/**
 * Produces token-highlighted HTML strings for Before and After HTML snippets,
 * wrapping changed tokens in `<mark class="diff-token-del">` / `<mark class="diff-token-ins">`
 * and collapsing unchanged runs longer than 14 tokens to `<span class="diff-ellipsis"> … </span>`.
 */
function formatHtmlDiffPair(
  beforeHtml: string,
  afterHtml: string
): { beforeRichHtml: string; afterRichHtml: string } {
  const bTokens = tokenizeHtmlForDiff(beforeHtml);
  const aTokens = tokenizeHtmlForDiff(afterHtml);

  type Op =
    | { type: "eq"; tokens: string[] }
    | { type: "diff"; b: string[]; a: string[] };
  const ops: Op[] = [];

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

  const CONTEXT_TOKENS = 8;
  const bParts: string[] = [];
  const aParts: string[] = [];

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    if (op.type === "eq") {
      const toks = op.tokens;
      const isFirst = idx === 0;
      const isLast = idx === ops.length - 1;
      if (ops.length === 1) {
        // Identical (CSS-only change): show up to 24 tokens
        const preview = toks.slice(0, 24).map((t) => he.escape(t)).join("");
        const ell =
          toks.length > 24 ? '<span class="diff-ellipsis"> …</span>' : "";
        bParts.push(preview + ell);
        aParts.push(preview + ell);
      } else if (isFirst) {
        if (toks.length > CONTEXT_TOKENS) {
          bParts.push('<span class="diff-ellipsis">… </span>');
          aParts.push('<span class="diff-ellipsis">… </span>');
        }
        const tail = toks
          .slice(Math.max(0, toks.length - CONTEXT_TOKENS))
          .map((t) => he.escape(t))
          .join("");
        bParts.push(tail);
        aParts.push(tail);
      } else if (isLast) {
        const head = toks
          .slice(0, CONTEXT_TOKENS)
          .map((t) => he.escape(t))
          .join("");
        bParts.push(head);
        aParts.push(head);
        if (toks.length > CONTEXT_TOKENS) {
          bParts.push('<span class="diff-ellipsis"> …</span>');
          aParts.push('<span class="diff-ellipsis"> …</span>');
        }
      } else if (toks.length > CONTEXT_TOKENS * 2) {
        const head = toks
          .slice(0, CONTEXT_TOKENS)
          .map((t) => he.escape(t))
          .join("");
        const tail = toks
          .slice(toks.length - CONTEXT_TOKENS)
          .map((t) => he.escape(t))
          .join("");
        const chunk = `${head}<span class="diff-ellipsis"> … </span>${tail}`;
        bParts.push(chunk);
        aParts.push(chunk);
      } else {
        const chunk = toks.map((t) => he.escape(t)).join("");
        bParts.push(chunk);
        aParts.push(chunk);
      }
    } else {
      if (op.b.length > 0) {
        bParts.push(
          `<mark class="diff-token-del">${op.b
            .map((t) => he.escape(t))
            .join("")}</mark>`
        );
      }
      if (op.a.length > 0) {
        aParts.push(
          `<mark class="diff-token-ins">${op.a
            .map((t) => he.escape(t))
            .join("")}</mark>`
        );
      }
    }
  }

  return {
    beforeRichHtml: bParts.join(""),
    afterRichHtml: aParts.join(""),
  };
}

export interface DiffExemplarItem {
  author: string;
  workTitle: string;
  workId: string;
  sectionId: string;
  pageId: string;
  readerUrl: string;
  teiSnippet: string;
  beforeHtml: string;
  afterHtml: string;
  markupChanged: boolean;
}

export interface DiffKindCard {
  kind: string;
  category: MarkupCategory;
  changedExemplars: DiffExemplarItem[];
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
 */
export function renderGalleryDiffHtml(
  before: GalleryReport,
  after: GalleryReport,
  beforeReaderCss?: string,
  afterReaderCss?: string
): string {
  const hasCssChanges =
    beforeReaderCss !== undefined || Boolean(afterReaderCss);

  const beforeKinds = before.markupKinds ?? [];
  const afterKinds = after.markupKinds ?? [];

  const beforeKindsMap = new Map<string, GalleryMarkupKind>();
  for (const k of beforeKinds) {
    beforeKindsMap.set(`${k.category}:${k.kind}`, k);
  }

  const diffKinds: DiffKindCard[] = [];

  for (const afterKind of afterKinds) {
    const beforeKind =
      beforeKindsMap.get(`${afterKind.category}:${afterKind.kind}`) ??
      beforeKindsMap.get(afterKind.kind);
    const changedExemplars: DiffExemplarItem[] = [];

    for (let i = 0; i < afterKind.examples.length; i++) {
      const afterEx = afterKind.examples[i];
      let matchingBeforeEx = beforeKind?.examples.find(
        (e) =>
          e.workId === afterEx.workId &&
          e.sectionId === afterEx.sectionId &&
          Boolean(e.inNote) === Boolean(afterEx.inNote)
      );
      if (
        !matchingBeforeEx &&
        beforeKind &&
        beforeKind.examples.length === afterKind.examples.length
      ) {
        matchingBeforeEx = beforeKind.examples[i];
      }

      const beforeHtml = matchingBeforeEx?.renderedHtml ?? "";
      const afterHtml = afterEx.renderedHtml;

      const compactPreview = (h: string, isNote: boolean) => {
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
        if (!isNote && !beforeHtml.includes('<aside class="reader-notes"')) {
          return passage;
        }
        if (!notes) {
          return passage;
        }
        const items = extractNoteListItems(notes);
        if (items.length > 3) {
          const targetNotes = items.filter((item) =>
            item.includes("gallery-target")
          );
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
      };
      const compareBefore = compactPreview(beforeHtml, Boolean(afterEx.inNote));
      const compareAfter = compactPreview(afterHtml, Boolean(afterEx.inNote));

      const extractTargetNoteOnly = (h: string): string => {
        const asideIdx = h.indexOf('<aside class="reader-notes"');
        if (asideIdx < 0) return h;
        const items = extractNoteListItems(h.slice(asideIdx));
        const target = items.find((item) => item.includes("gallery-target"));
        return target ?? h.slice(asideIdx);
      };

      const normBefore = normalizePreviewHtml(
        afterEx.inNote ? extractTargetNoteOnly(compareBefore) : compareBefore
      );
      const normAfter = normalizePreviewHtml(
        afterEx.inNote ? extractTargetNoteOnly(compareAfter) : compareAfter
      );
      const markupChanged = normBefore !== normAfter;
      const cssChanged =
        hasCssChanges &&
        (/\breader-block\b/.test(
          afterEx.inNote ? extractTargetNoteOnly(compareBefore) : compareBefore
        ) ||
          /\breader-block\b/.test(
            afterEx.inNote ? extractTargetNoteOnly(compareAfter) : compareAfter
          ));

      if (markupChanged || cssChanged || !matchingBeforeEx) {
        changedExemplars.push({
          author: afterEx.author,
          workTitle: afterEx.workTitle,
          workId: afterEx.workId,
          sectionId: afterEx.sectionId,
          pageId: afterEx.pageId,
          readerUrl: afterEx.readerUrl,
          teiSnippet: afterEx.teiSnippet,
          beforeHtml: compareBefore,
          afterHtml: compareAfter,
          markupChanged,
        });
      }
    }

    if (changedExemplars.length > 0) {
      diffKinds.push({
        kind: afterKind.kind,
        category: afterKind.category,
        changedExemplars,
      });
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

  for (const afterWork of afterWorks) {
    const beforeWork = beforeWorksMap.get(afterWork.workId);
    const changedPages: DiffSpotPageItem[] = [];

    for (const role of roles) {
      const afterPage =
        afterWork.pages?.[role] ??
        afterWork.spotCheckPages?.find((p) => p.role === role);
      const beforePage =
        beforeWork?.pages?.[role] ??
        beforeWork?.spotCheckPages?.find((p) => p.role === role);

      if (!afterPage && !beforePage) {
        continue;
      }

      const rawBeforeHtml = beforePage?.previewHtml ?? "";
      const afterHtml = afterPage?.previewHtml ?? "";
      const beforeAsideIdx = rawBeforeHtml.indexOf('<aside class="reader-notes"');
      const beforeHtml =
        beforeAsideIdx >= 0
          ? joinPassageAndNotesHtml(
              rawBeforeHtml.slice(0, beforeAsideIdx).trim(),
              filterNotesHtmlToRefs(
                rawBeforeHtml.slice(0, beforeAsideIdx),
                rawBeforeHtml.slice(beforeAsideIdx)
              )
            )
          : rawBeforeHtml;

      const normBefore = normalizePreviewHtml(beforeHtml);
      const normAfter = normalizePreviewHtml(afterHtml);
      const markupChanged = normBefore !== normAfter;
      const cssChanged =
        hasCssChanges &&
        (/\breader-block\b/.test(beforeHtml) ||
          /\breader-block\b/.test(afterHtml));

      if (markupChanged || cssChanged || !beforePage) {
        const pageRef = afterPage ?? beforePage!;
        changedPages.push({
          role,
          title: pageRef.title,
          pageId: pageRef.pageId,
          citationRange: pageRef.citationRange,
          readerUrl: pageRef.readerUrl,
          beforeHtml,
          afterHtml,
          markupChanged,
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

          const diffPair = formatHtmlDiffPair(
            normalizePreviewHtml(ex.beforeHtml),
            normalizePreviewHtml(ex.afterHtml)
          );
          const markupDiffHtml = `
            <details class="html-diff-details"${ex.markupChanged ? " open" : ""}>
              <summary>HTML markup diff${
                ex.markupChanged ? "" : " (CSS styling change: .reader-block margin: 1em 0 → 0)"
              }</summary>
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

          return `<div class="exemplar-item">
            <div class="exemplar-meta">
              <span><strong>${he.escape(ex.author)}</strong>, <em>${he.escape(
            ex.workTitle
          )}</em> (<code>${he.escape(ex.workId)}</code> &middot; page <code>${he.escape(
            ex.pageId
          )}</code> &middot; &sect;<code>${he.escape(ex.sectionId)}</code>)</span>
              <a class="exemplar-link" href="${he.escape(ex.readerUrl)}">${he.escape(
            ex.readerUrl
          )}</a>
            </div>
            <div class="diff-grid">
              <div class="diff-col">
                <div class="diff-col-header">Source TEI XML</div>
                <pre class="tei-snippet"><code>${he.escape(ex.teiSnippet)}</code></pre>
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

      return `<article class="kind-card" id="${he.escape(anchorId)}" data-kind="${he.escape(
        k.kind
      )}" data-category="${he.escape(k.category)}" data-review-id="${he.escape(reviewId)}">
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
              <summary>HTML markup diff${
                p.markupChanged ? "" : " (CSS styling change: .reader-block margin: 1em 0 → 0)"
              }</summary>
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

          return `<div class="exemplar-item">
            <div class="exemplar-meta">
              <span><strong>${he.escape(p.role.toUpperCase())}</strong>: ${he.escape(
            p.title
          )} (<code>${he.escape(p.pageId)}</code>, &sect;${he.escape(
            p.citationRange[0]
          )}&ndash;${he.escape(p.citationRange[1])})</span>
              <a class="exemplar-link" href="${he.escape(p.readerUrl)}">${he.escape(
            p.readerUrl
          )}</a>
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

      return `<article class="kind-card" id="${he.escape(anchorId)}" data-work-id="${he.escape(
        w.workId
      )}" data-review-id="${he.escape(reviewId)}">
        <header class="kind-card-header">
          <span class="kind-name"><code>${he.escape(w.workId)}</code> &mdash; ${he.escape(
        w.author
      )}, <em>${he.escape(w.shortTitle ?? w.title)}</em></span>
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
  <title>Morcus Library Gallery Diff — ${he.escape(before.label)} vs ${he.escape(
    after.label
  )}</title>
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
  background: #fecaca;
  color: #7f1d1d;
  font-weight: 600;
  padding: 0.08rem 0.22rem;
  border-radius: 3px;
  border: 1px solid #f87171;
}

mark.diff-token-ins {
  background: #bbf7d0;
  color: #14532d;
  font-weight: 600;
  padding: 0.08rem 0.22rem;
  border-radius: 3px;
  border: 1px solid #4ade80;
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

body[data-highlight-diff="true"] .diff-css-changed {
  outline: 1.5px dashed #d97706;
  background: rgba(245, 158, 11, 0.08);
}

${beforeReaderCss ? scopeCssRules(beforeReaderCss, ".before-scope") : ""}
${afterReaderCss ? scopeCssRules(afterReaderCss, ".after-scope") : ""}
  </style>
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
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-highlight-diff" checked /> Highlight changes in preview</label>
      <label class="gallery-control-pill"><input type="checkbox" id="gallery-hide-reviewed" /> Hide reviewed</label>
      <button type="button" id="gallery-reset-reviewed" class="gallery-btn">Reset progress</button>
    </div>
    <nav class="gallery-nav" aria-label="Diff navigation">
      <a href="#diff-kinds">Changed Kinds (${totalChangedKinds})</a>
      <a href="#diff-works">Changed Spot-Checks (${totalChangedWorks})</a>
    </nav>
  </header>
  <main class="gallery-main">
    <section id="diff-kinds">
      <h2 class="gallery-section-heading">1. Changed Markup Kind Exemplars (${totalChangedKinds} kinds, ${totalChangedExemplars} exemplars)</h2>
      ${
        totalChangedKinds > 0
          ? kindsCardsHtml
          : '<div class="cat-all-reviewed-banner" style="display:block;">No markup kind exemplar differences detected.</div>'
      }
    </section>
    <section id="diff-works">
      <h2 class="gallery-section-heading">2. Changed Per-Work Spot-Checks (${totalChangedWorks} works, ${totalChangedSpotPages} pages)</h2>
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

    function diffDomPair(bNode, aNode) {
      if (!bNode && !aNode) return;
      if (!bNode && aNode && aNode.nodeType === 1) {
        aNode.classList.add("diff-node-changed");
        return;
      }
      if (bNode && !aNode && bNode.nodeType === 1) {
        bNode.classList.add("diff-node-changed");
        return;
      }
      if (!bNode || !aNode) return;
      if (bNode.nodeType === 3 && aNode.nodeType === 3) {
        highlightTextDiff(bNode, aNode);
        return;
      }
      if (bNode.nodeType === 1 && aNode.nodeType === 1) {
        if (bNode.tagName !== aNode.tagName || bNode.className !== aNode.className) {
          bNode.classList.add("diff-node-changed");
          aNode.classList.add("diff-node-changed");
        }
        var bChildren = Array.prototype.slice.call(bNode.childNodes);
        var aChildren = Array.prototype.slice.call(aNode.childNodes);
        var maxC = Math.max(bChildren.length, aChildren.length);
        for (var i = 0; i < maxC; i++) {
          diffDomPair(bChildren[i], aChildren[i]);
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
      diffDomPair(bScope, aScope);
      if (!item.querySelector(".diff-node-changed, .diff-text-changed")) {
        item.querySelectorAll(".reader-block").forEach(function (el) {
          el.classList.add("diff-css-changed");
        });
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
        `Onboarded work '${file.workId}' failed gallery processing: ${firstLineOf(
          msg
        )}`
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

  const report = buildGalleryReportFromInputs(inputs, {
    label,
    root,
    latinLitCommit,
    morcusCommit,
    includeCandidates: options.includeCandidates,
    maxExamples,
  });
  for (const [failedWorkId, errMsg] of Object.entries(candidateFailures)) {
    report.failures[failedWorkId] = errMsg;
  }
  report.totals.failedCount = Object.keys(report.failures).length;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "gallery.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(dir, "gallery.md"),
    formatGalleryMarkdown(report)
  );
  fs.writeFileSync(path.join(dir, "index.html"), formatGalleryHtml(report));

  if (options.compareWith) {
    let beforeReport: GalleryReport;
    if (typeof options.compareWith === "string") {
      const p = fs.statSync(options.compareWith).isDirectory()
        ? path.join(options.compareWith, "gallery.json")
        : options.compareWith;
      beforeReport = JSON.parse(fs.readFileSync(p, "utf8"));
    } else {
      beforeReport = options.compareWith;
    }
    fs.writeFileSync(
      path.join(dir, "diff.html"),
      renderGalleryDiffHtml(beforeReport, report)
    );
  }

  if (!options.quiet) {
    console.log(
      `Gallery built: ${report.totals.worksProcessed} works (${report.totals.onboardedCount} onboarded, ${report.totals.candidateCount} candidates), ` +
        `${report.totals.markupKindCount} markup kinds → ${dir}/{gallery.json,gallery.md,index.html}`
    );
  }
  return { dir, report };
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
