/**
 * Opt-in corpus sweep for the Latin Library page layer against a local
 * snapshot checkout (`$THELATINLIBRARY_ROOT/raw/`):
 *
 * 1. No-loss sweep: every sampled `.html` / `.shtml` page decodes and parses
 *    without throwing, loses no body tokens, and invents no extra tokens.
 * 2. Parser parity: `DOMParser` (jsdom) and `parse5` produce identical
 *    `LenientPageContent` projections across real pages.
 *
 * Skipped by default so routine unit test runs stay fast and independent of
 * local data checkouts. Run this manually after changing `encoding.ts`,
 * `dom_adapter.ts`, `markers.ts`, or `page_layer.ts`, or after updating the
 * pinned `thelatinlibrary` snapshot:
 *
 *   THELATINLIBRARY_SWEEP=1 THELATINLIBRARY_ROOT=/path/to/thelatinlibrary \
 *     ./morcus.sh test src/common/thelatinlibrary/page_layer_sweep.test.ts
 *
 * Set `THELATINLIBRARY_SWEEP=full` to sweep every page instead of a 1-in-8
 * sample, or `THELATINLIBRARY_SWEEP_DIRS=/dir1:/dir2` to include extra HTML
 * directories.
 */

import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { parse } from "parse5";

import {
  createParse5BodyParser,
  decodeLatinLibraryHtmlBytes,
  domParserBodyParser,
  extractLenientPage,
  extractText,
  findElements,
  isNavigationBlock,
  parseHtmlToMinimalBody,
  wordTokens,
  type LenientPageContent,
  type MinimalElementNode,
} from "@/common/thelatinlibrary";

const parse5Parser = createParse5BodyParser(parse);

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, out);
    else if (/\.s?html?$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const SWEEP_MODE = process.env.THELATINLIBRARY_SWEEP;
const SWEEP_ENABLED = SWEEP_MODE === "1" || SWEEP_MODE === "full";
const FULL_SWEEP = SWEEP_MODE === "full";

const ROOT = SWEEP_ENABLED
  ? process.env.THELATINLIBRARY_ROOT?.trim() || undefined
  : undefined;
const RAW_DIR = ROOT === undefined ? undefined : path.join(ROOT, "raw");
const RAW_FILES =
  RAW_DIR !== undefined && fs.existsSync(RAW_DIR) ? walkHtml(RAW_DIR) : [];
const EXTRA_FILES = SWEEP_ENABLED
  ? (process.env.THELATINLIBRARY_SWEEP_DIRS ?? "")
      .split(":")
      .filter((d) => d.length > 0 && fs.existsSync(d))
      .flatMap((d) => walkHtml(d))
  : [];
const ALL_FILES = [...RAW_FILES, ...EXTRA_FILES].sort();

const SWEEP_FILES = FULL_SWEEP
  ? ALL_FILES
  : ALL_FILES.filter((_, i) => i % 8 === 0);

const describeIfCorpus = SWEEP_FILES.length > 0 ? describe : describe.skip;

function label(file: string): string {
  return RAW_DIR !== undefined && file.startsWith(RAW_DIR)
    ? path.relative(RAW_DIR, file)
    : file;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenCounts(texts: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const tok of wordTokens(t)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return counts;
}

/** Tokens in `a` beyond those in `b` (multiset difference). */
function excess(
  a: Map<string, number>,
  b: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [tok, n] of a) {
    const extra = n - (b.get(tok) ?? 0);
    if (extra > 0) out.set(tok, extra);
  }
  return out;
}

/** Plain, comparable projection of a `LenientPageContent`. */
function project(page: LenientPageContent) {
  const serialize = (el: MinimalElementNode): unknown => ({
    tag: el.tagName,
    attrs: el.attrs.map((a) => [a.name, a.value]),
    text: extractText(el, { preserveLineBreaks: true }),
  });
  return {
    pageTitle: page.pageTitle,
    nav: page.nav,
    headings: page.headings,
    paragraphs: page.paragraphs.map(serialize),
    blocks: page.blocks.map((b) => ({
      kind: b.kind,
      text: b.text,
      element: serialize(b.element),
      markers: b.markers,
      anchors: b.anchors,
    })),
    footerText: page.footerText,
    bodyText: page.bodyText,
    warnings: page.warnings,
  };
}

// ---------------------------------------------------------------------------
// 1. No-loss sweep
// ---------------------------------------------------------------------------

describeIfCorpus("corpus sweep (decode + extractLenientPage)", () => {
  it(`parses all ${SWEEP_FILES.length} pages without crashing or losing text`, () => {
    const crashes: string[] = [];
    const lost: string[] = [];
    const invented: string[] = [];

    for (const file of SWEEP_FILES) {
      let page: LenientPageContent;
      let html: string;
      try {
        html = decodeLatinLibraryHtmlBytes(fs.readFileSync(file));
        page = extractLenientPage(html, { parser: parse5Parser });
        // The line-preserving mode must not crash either.
        extractLenientPage(html, {
          parser: parse5Parser,
          preserveLineBreaks: true,
        });
      } catch (e) {
        crashes.push(`${label(file)}: ${e}`);
        continue;
      }

      // Every body token is accounted for by the title, the blocks, the
      // footer or the navigation targets, and nothing is invented.
      const body = tokenCounts([page.bodyText]);
      const { body: parsedBody } = parseHtmlToMinimalBody(html, parse5Parser);
      const navText = findElements(parsedBody, isNavigationBlock).map((e) =>
        extractText(e)
      );
      const kept = tokenCounts([
        page.pageTitle,
        ...page.blocks.map((b) => b.text),
        page.footerText ?? "",
        ...navText,
      ]);
      const missing = excess(body, kept);
      if (missing.size > 0) {
        lost.push(
          `${label(file)}: ${[...missing.keys()].slice(0, 8).join(" ")}`
        );
      }
      const extra = excess(
        tokenCounts([
          page.pageTitle,
          ...page.blocks.map((b) => b.text),
          page.footerText ?? "",
        ]),
        body
      );
      if (extra.size > 0) {
        invented.push(
          `${label(file)}: ${[...extra.keys()].slice(0, 8).join(" ")}`
        );
      }
    }

    expect(crashes).toEqual([]);
    expect(lost).toEqual([]);
    expect(invented).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. parse5 vs DOMParser
// ---------------------------------------------------------------------------

describeIfCorpus("parse5 and DOMParser agree on real pages", () => {
  const originalDomParser = (globalThis as { DOMParser?: unknown }).DOMParser;
  beforeAll(() => {
    (globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM(
      ""
    ).window.DOMParser;
  });
  afterAll(() => {
    (globalThis as { DOMParser?: unknown }).DOMParser = originalDomParser;
  });

  const sample = SWEEP_FILES.filter((_, i) => i % 7 === 0);

  it(`gives identical LenientPageContent on ${sample.length} pages`, () => {
    const diffs: string[] = [];
    for (const file of sample) {
      const html = decodeLatinLibraryHtmlBytes(fs.readFileSync(file));
      for (const preserveLineBreaks of [false, true]) {
        const viaParse5 = project(
          extractLenientPage(html, { parser: parse5Parser, preserveLineBreaks })
        );
        const viaDom = project(
          extractLenientPage(html, {
            parser: domParserBodyParser,
            preserveLineBreaks,
          })
        );
        if (JSON.stringify(viaParse5) !== JSON.stringify(viaDom)) {
          diffs.push(
            `${label(file)} (preserveLineBreaks=${preserveLineBreaks})`
          );
        }
      }
    }
    expect(diffs).toEqual([]);
  });
});
