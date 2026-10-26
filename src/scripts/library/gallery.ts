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
import { getSectionId } from "@/common/library/process_work";
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
 * Extracts top-level `<li class="reader-note" id="note-n...">...</li>` items
 * from `notesHtml` using balanced `<li>` / `</li>` tag matching so nested
 * lists inside note bodies cannot truncate a note item.
 */
export function extractNoteListItems(notesHtml: string | undefined): string[] {
  if (!notesHtml) {
    return [];
  }
  const items: string[] = [];
  const startPattern = /<li class="reader-note" id="note-n\d+">/g;
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
  const previewHtml = joinPassageAndNotesHtml(previewSections, page.notesHtml);
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
  const nonCtsRefs = rawTei
    .findDescendants("refsDecl")
    .filter(
      (n) => n.getAttr("n") !== "CTS" && n.getAttr("xml:id") !== "CTS"
    );
  const refsUnits =
    nonCtsRefs.length === 1
      ? nonCtsRefs[0].children
          .filter((c): c is XmlNode => c instanceof XmlNode)
          .map((c) => c.getAttr("unit")?.toLowerCase())
          .filter((u): u is string => Boolean(u))
      : [];
  const hasLivyLeadingUnit =
    input.workId === LatinWorks.LIVY_AUC &&
    refsUnits.length === work.textParts.length + 1;
  const rawTextParts = hasLivyLeadingUnit
    ? refsUnits
    : work.textParts.map((p) => p.toLowerCase());

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
    let renderedHtml: string;
    if (options?.fullPage) {
      const markedPageRows = loc.pageRowHtmls.map((rowHtml, idx) =>
        targetOffsets.has(idx) ? markGalleryTargetRow(rowHtml) : rowHtml
      );
      renderedHtml = joinPassageAndNotesHtml(
        markedPageRows.join("\n"),
        loc.pageNotesHtml
      );
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
      renderedHtml = joinPassageAndNotesHtml(sliceRows.join("\n"));
    } else {
      const markedRows = loc.rowHtmls
        .slice(0, 3)
        .map((rowHtml, idx) =>
          idx === 0 ? markGalleryTargetRow(rowHtml) : rowHtml
        );
      renderedHtml = joinPassageAndNotesHtml(markedRows.join("\n"));
    }
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

    let dotSecId = inheritedSecId;
    try {
      const [rawSec] = getSectionId(ancestors, rawTextParts, input.workId);
      const pruned = hasLivyLeadingUnit ? rawSec.slice(1) : rawSec;
      dotSecId = pruned.join(".");
    } catch {
      dotSecId = inheritedSecId;
    }

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
    return options.works.map((workId) => {
      const relPath = workIdToRelPath(workId);
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        throw new Error(`Work file not found for '${workId}' at ${absPath}`);
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
  z-index: 10;
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
  font-size: 1.15rem;
  margin: 1.75rem 0 0.75rem;
  color: var(--primary);
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

.reader-section.gallery-target {
  background: var(--primary-light);
  border-left: 3px solid var(--primary);
  border-radius: 4px;
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

.reader-passage .reader-line,
.reader-passage .reader-block {
  display: block;
}

.reader-passage .indent {
  display: block;
  padding-left: 1.5em;
}

.reader-passage .indent-para {
  display: block;
  padding-left: 0;
  text-indent: 1.5em;
}

.reader-passage .blockquote {
  display: block;
  margin: 0.4em 0 0.4em 1.5em;
  font-style: italic;
}

.reader-passage .reader-subheading {
  font-family: var(--font-serif);
  font-size: 1em;
  font-weight: 600;
  text-align: center;
  margin: 0.6em 0 0.4em;
}

.reader-passage .reader-list {
  margin: 0.4em 0;
  padding-left: 1.5em;
}

.reader-passage .italic {
  font-style: italic;
}

.reader-passage .bold {
  font-weight: 600;
}

.reader-passage .smallcaps {
  font-variant-caps: small-caps;
  letter-spacing: 0.02em;
}

.reader-passage .uppercase {
  text-transform: uppercase;
}

.reader-passage .overline {
  text-decoration: overline;
}

.reader-passage .superscript {
  vertical-align: super;
  font-size: smaller;
  line-height: 0;
}

.reader-passage .line-space {
  display: block;
  height: 0.75em;
}

.reader-passage .reader-gap {
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
          )}">
          <header class="kind-card-header">
            <span class="kind-name">${he.escape(k.kind)}</span>
            <div class="kind-badges">
              <span class="badge">${he.escape(k.category)}</span>
              <span class="badge">${k.workCount} ${
            k.workCount === 1 ? "work" : "works"
          }</span>
              <span class="badge">${k.occurrenceCount}&times;</span>
            </div>
          </header>
          <div class="exemplar-list">
            ${examplesHtml}
          </div>
        </article>`;
        })
        .join("\n");

      return `<section id="cat-${he.escape(cat)}">
        <h3 class="category-heading">${he.escape(
          CATEGORY_TITLES[cat]
        )} (${items.length})</h3>
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
      return `<tr>
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

      return `<details class="work-details" id="work-${he.escape(w.workId)}">
        <summary>
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
