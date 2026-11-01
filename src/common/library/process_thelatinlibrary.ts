import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import type {
  CitationStyle,
  DocumentInfo,
  ProcessedWork2,
} from "@/common/library/library_types";
import { buildNavTree, divideWork } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import fs from "fs";
import path from "path";

/** Where a converted work came from on thelatinlibrary.com. */
export interface TheLatinLibrarySource {
  /** The exact page the text was taken from. */
  url: string;
  /** The date the page was fetched, as YYYY-MM-DD. */
  retrieved: string;
  /** SHA-256 of the raw HTML that was converted. */
  sha256: string;
  /** The source edition, if the page names one. */
  statedEdition: string | null;
}

/**
 * Matter in a row that an editor supplied rather than the author wrote (e.g.
 * Gaius' bracketed rubrics). The reader shows it; the corpus and word lookup
 * skip it (`kind="editorial"`).
 */
export interface EditorialSegment {
  editorial: string;
  /**
   * Optional visual presentation hint for editorial paratext:
   * - `"default"`: standard bracketed / muted editorial note
   * - `"smallcaps"`: Roman-law jurist inscription (`Ulpianus 1 inst.`) shown
   *   once per *lex* in small caps (Decision #21).
   */
  style?: "default" | "smallcaps";
}

/** A row's text: plain, or a sequence of plain and editorial segments. */
export type RowText = string | (string | EditorialSegment)[];

/**
 * A work converted from The Latin Library's HTML by
 * `src/scripts/thelatinlibrary/onboard.ts`. Rows are in reading order.
 * Row ids normally have `textParts.length` parts; they may stop one level
 * early where the source doesn't mark the lowest level.
 */
export interface TheLatinLibraryWork {
  workId: string;
  author: string;
  title: string;
  source: TheLatinLibrarySource;
  textParts: string[];
  /**
   * Optional citation formatting and lookup style (e.g. `"roman_law"` for
   * Digest and Gaius; Decision #21).
   */
  citationStyle?: CitationStyle;
  /**
   * Rows in reading order. A row marked `"heading"` (e.g. a Digest title's
   * name) is shown as a subheading and has an id `pageDepth` parts long.
   */
  rows: [id: string[], text: RowText, kind?: "heading"][];
  /**
   * How many id parts make a reader page, when not one level above the leaf
   * (the Digest pages by title, not by law). Row ids then have between
   * `pageDepth` and `textParts.length` parts.
   */
  pageDepth?: number;
}

/** All of a row's text, editorial matter included, joined by spaces. */
export function rowPlainText(text: RowText): string {
  return typeof text === "string"
    ? text
    : text.map((s) => (typeof s === "string" ? s : s.editorial)).join(" ");
}

function rowNode(text: RowText): XmlNode<"span"> {
  if (typeof text === "string") {
    return new XmlNode("span", [], [text]);
  }
  const children: (string | XmlNode<"span">)[] = [];
  text.forEach((segment, i) => {
    if (i > 0) children.push(" ");
    children.push(
      typeof segment === "string"
        ? segment
        : new XmlNode(
            "span",
            segment.style === "smallcaps"
              ? [
                  ["kind", "editorial"],
                  ["style", "smallcaps"],
                ]
              : [["kind", "editorial"]],
            [segment.editorial]
          )
    );
  });
  return new XmlNode("span", [], children);
}

export const THE_LATIN_LIBRARY_ROOT_ENV = "THELATINLIBRARY_ROOT";
const WORKS_SUBDIR = "works";

function validateWork(work: TheLatinLibraryWork, file: string): void {
  assert(work.rows.length > 0, `${file}: no rows`);
  const depth = work.textParts.length;
  const seen = new Set<string>();
  if (work.pageDepth !== undefined) {
    assert(
      work.pageDepth >= 1 && work.pageDepth < depth,
      `${file}: bad pageDepth ${work.pageDepth}`
    );
  }
  for (const [id, text, kind] of work.rows) {
    const joined = id.join(".");
    // Never shallower than a reader page; without a pageDepth, one level
    // shallower than textParts at most.
    const minDepth = work.pageDepth ?? Math.max(1, depth - 1);
    if (kind === "heading") {
      assert(
        id.length === minDepth,
        `${file}: heading ${joined} must be ${minDepth} parts long`
      );
    }
    assert(
      id.length <= depth && id.length >= minDepth,
      `${file}: id ${joined} does not match textParts`
    );
    for (const part of id) {
      assert(
        part.length > 0 && !part.includes("."),
        `${file}: bad id part '${part}'`
      );
    }
    assert(!seen.has(joined), `${file}: duplicate id ${joined}`);
    seen.add(joined);
    assert(
      rowPlainText(text).trim().length > 0,
      `${file}: empty row ${joined}`
    );
    if (typeof text !== "string") {
      for (const segment of text) {
        const value = typeof segment === "string" ? segment : segment.editorial;
        assert(value.trim().length > 0, `${file}: empty segment in ${joined}`);
      }
    }
  }
}

/** One page per run of rows sharing their first `depth` id parts. */
function pagesByDepth(
  rows: ProcessedWork2["rows"],
  depth: number,
  file: string
): ProcessedWork2["pages"] {
  const pages: ProcessedWork2["pages"] = [];
  const seen = new Set<string>();
  rows.forEach(([id], i) => {
    const pageId = id.slice(0, depth);
    const key = pageId.join(".");
    const last = pages.at(-1);
    if (last !== undefined && last.id.join(".") === key) {
      last.rows[1] = i + 1;
      return;
    }
    assert(!seen.has(key), `${file}: page ${key} is not contiguous`);
    seen.add(key);
    pages.push({ id: pageId, rows: [i, i + 1] });
  });
  return pages;
}

/** Every row must be on some page, or the reader would silently drop it. */
function validatePageCoverage(
  rowCount: number,
  pages: ProcessedWork2["pages"],
  file: string
): void {
  let next = 0;
  for (const page of pages) {
    assert(
      page.rows[0] === next,
      `${file}: rows ${next}..${page.rows[0] - 1} are on no page`
    );
    next = page.rows[1];
  }
  assert(next === rowCount, `${file}: rows ${next}.. are on no page`);
}

export function convertTheLatinLibraryWork(
  work: TheLatinLibraryWork,
  file: string = work.workId
): ProcessedWork2 {
  validateWork(work, file);
  const info: DocumentInfo = {
    title: work.title,
    author: work.author,
    workId: work.workId,
    attribution: "theLatinLibrary",
    sourceRef: [work.source.url],
    citationStyle: work.citationStyle,
  };
  if (work.source.statedEdition !== null) {
    info.editor = work.source.statedEdition;
  }
  const rows: ProcessedWork2["rows"] = work.rows.map(([id, text, kind]) => [
    id,
    kind === "heading"
      ? new XmlNode("head", [], [rowPlainText(text)])
      : rowNode(text),
  ]);
  const pages =
    work.pageDepth === undefined
      ? divideWork(rows, work.textParts)
      : pagesByDepth(rows, work.pageDepth, file);
  validatePageCoverage(rows.length, pages, file);
  return {
    info,
    textParts: work.textParts,
    rows,
    pages,
    navTree: buildNavTree(pages),
  };
}

/**
 * Resolves the local checkout root for The Latin Library:
 * 1. `THELATINLIBRARY_ROOT` if set in the environment (`.env` / local dev),
 * 2. `"TheLatinLibrary"` (the directory name `cloneRepo` creates in Docker/CI),
 * 3. `"thelatinlibrary"` (lowercase fallback).
 */
export function resolveTheLatinLibraryRoot(): string | undefined {
  const configured = envVar(THE_LATIN_LIBRARY_ROOT_ENV, "unsafe");
  if (configured !== undefined && configured.trim() !== "") {
    return configured;
  }
  for (const candidate of ["TheLatinLibrary", "thelatinlibrary"]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Reads every converted work under `$THELATINLIBRARY_ROOT/works` (or the
 * cloned `TheLatinLibrary/works` directory in Docker/CI). Returns nothing (with
 * a warning) when the directory isn't configured or present.
 */
export function processTheLatinLibrary(): ProcessedWork2[] {
  const root = resolveTheLatinLibraryRoot();
  const worksDir =
    root === undefined ? undefined : path.join(root, WORKS_SUBDIR);
  if (worksDir === undefined || !fs.existsSync(worksDir)) {
    console.warn(
      `Skipping The Latin Library: ${THE_LATIN_LIBRARY_ROOT_ENV} works dir not found.`
    );
    return [];
  }
  return fs
    .readdirSync(worksDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const file = path.join(worksDir, f);
      const work: TheLatinLibraryWork = JSON.parse(
        fs.readFileSync(file, "utf8")
      );
      return convertTheLatinLibraryWork(work, file);
    });
}
