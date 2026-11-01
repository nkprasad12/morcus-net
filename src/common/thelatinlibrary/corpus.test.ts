/**
 * Corpus-wide validation of the lenient page layer against the real Latin
 * Library snapshot (`$THELATINLIBRARY_ROOT/raw/`):
 *
 * 1. Sweep: every `.html` / `.shtml` page decodes and parses without throwing,
 *    loses no body text, and contributes to a marker census.
 * 2. Pilot parity: on the 6 pilot works' pages, `extractLenientPage` returns
 *    exactly what the pilot's strict `readPageContent` did (frozen copy
 *    below), with no warnings.
 * 3. Parser parity: `DOMParser` (jsdom) and parse5 give identical results.
 *
 * Skipped when no snapshot is available (e.g. in CI) or when
 * `THELATINLIBRARY_SWEEP=0`. By default the sweep covers every pilot page and
 * every 8th other page (about 30 s on the full 2,457-page snapshot);
 * `THELATINLIBRARY_SWEEP=full` sweeps every page (about 4 minutes). Extra
 * directories of Latin Library HTML can be swept by setting
 * `THELATINLIBRARY_SWEEP_DIRS`
 * (colon-separated).
 */

import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { parse, type DefaultTreeAdapterMap } from "parse5";

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
  type DetectedMarkerKind,
  type HtmlBodyParser,
  type LenientPageContent,
  type MinimalElementNode,
} from "@/common/thelatinlibrary";

const parse5Parser = createParse5BodyParser(parse);

function latinLibraryRoot(): string | undefined {
  const fromEnv = process.env.THELATINLIBRARY_ROOT;
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  const envFile = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) return undefined;
  const m = /^THELATINLIBRARY_ROOT=(.*)$/m.exec(
    fs.readFileSync(envFile, "utf8")
  );
  return m?.[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, out);
    else if (/\.s?html?$/i.test(entry.name)) out.push(p);
  }
  return out;
}

const ROOT =
  process.env.THELATINLIBRARY_SWEEP === "0" ? undefined : latinLibraryRoot();
const RAW_DIR = ROOT === undefined ? undefined : path.join(ROOT, "raw");
const RAW_FILES =
  RAW_DIR !== undefined && fs.existsSync(RAW_DIR) ? walkHtml(RAW_DIR) : [];
const EXTRA_FILES = (process.env.THELATINLIBRARY_SWEEP_DIRS ?? "")
  .split(":")
  .filter((d) => d.length > 0 && fs.existsSync(d))
  .flatMap((d) => walkHtml(d));
const ALL_FILES = [...RAW_FILES, ...EXTRA_FILES].sort();

/** Pages of the 6 pilot works, relative to `raw/`. */
const PILOT_PAGE =
  /^(resgestae\.html|gaius[1-4]\.html|justin\/[^/]+\.html|quintilian\/quintilian\.decl\.mai\d+\.shtml|justinian\/digest\d+\.shtml)$/;
const PILOT_FILES = RAW_FILES.filter((f) =>
  PILOT_PAGE.test(path.relative(RAW_DIR!, f).split(path.sep).join("/"))
);

const FULL_SWEEP = process.env.THELATINLIBRARY_SWEEP === "full";
const SWEEP_FILES = FULL_SWEEP
  ? ALL_FILES
  : ALL_FILES.filter((f, i) => i % 8 === 0 || PILOT_FILES.includes(f));

const describeIfCorpus = SWEEP_FILES.length > 0 ? describe : describe.skip;
const describeIfPilot = PILOT_FILES.length > 0 ? describe : describe.skip;

function label(file: string): string {
  return RAW_DIR !== undefined && file.startsWith(RAW_DIR)
    ? path.relative(RAW_DIR, file)
    : file;
}

// ---------------------------------------------------------------------------
// Frozen copy of the pilot's strict reader (src/scripts/thelatinlibrary/
// page.ts `readPageContent` + html.ts helpers at library-release ded55add),
// taking an already-parsed parse5 <body> so paragraph identity can be
// compared. Kept here so parity stays meaningful after C7 rewires page.ts
// onto the lenient layer.
// ---------------------------------------------------------------------------

type P5Node = DefaultTreeAdapterMap["childNode"];
type P5Element = DefaultTreeAdapterMap["element"];

const p5IsElement = (n: P5Node): n is P5Element => "tagName" in n;
const p5IsText = (n: P5Node): n is DefaultTreeAdapterMap["textNode"] =>
  n.nodeName === "#text";
const p5Attr = (el: P5Element, name: string) =>
  el.attrs.find((a) => a.name === name)?.value;
const p5HasClass = (el: P5Element, cls: string) =>
  (p5Attr(el, "class") ?? "").split(/\s+/).includes(cls);
const pilotNormalize = (t: string) => t.replace(/[\s\u00a0]+/g, " ").trim();

function pilotTextOf(node: P5Node): string {
  const parts: string[] = [];
  const walk = (n: P5Node) => {
    if (p5IsText(n)) {
      parts.push(n.value);
    } else if (p5IsElement(n)) {
      if (n.tagName === "br") {
        parts.push(" ");
        return;
      }
      n.childNodes.forEach(walk);
    }
  };
  walk(node);
  return pilotNormalize(parts.join(""));
}

function pilotNavTargets(nav: P5Element): string[] {
  const targets: string[] = [];
  const walk = (el: P5Element) => {
    for (const child of el.childNodes) {
      if (!p5IsElement(child)) continue;
      const href = child.tagName === "a" ? p5Attr(child, "href") : undefined;
      if (href?.startsWith("#")) targets.push(href.slice(1));
      walk(child);
    }
  };
  walk(nav);
  return targets;
}

function pilotIsNavBlock(el: P5Element): boolean {
  if (el.tagName !== "p") return false;
  if (pilotNavTargets(el).length === 0) return false;
  const linkText = el.childNodes
    .filter(p5IsElement)
    .filter((c) => c.tagName === "a")
    .map(pilotTextOf)
    .join(" ");
  return pilotNormalize(linkText) === pilotTextOf(el);
}

function pilotContainsTag(el: P5Element, tag: string): boolean {
  return el.childNodes.some(
    (c) => p5IsElement(c) && (c.tagName === tag || pilotContainsTag(c, tag))
  );
}

interface PilotContent {
  pageTitle: string;
  nav: string[] | undefined;
  headings: string[];
  paragraphs: P5Element[];
  bodyText: string;
}

function pilotReadPageContent(body: P5Element): PilotContent {
  let pageTitle = "";
  let nav: string[] | undefined = undefined;
  const headings: string[] = [];
  const paragraphs: P5Element[] = [];
  const bodyTextParts: string[] = [];
  for (const child of body.childNodes) {
    if (p5IsText(child)) {
      if (child.value.trim().length > 0) {
        throw new Error(`Unexpected text directly in <body>`);
      }
      continue;
    }
    if (!p5IsElement(child)) continue;
    const text = pilotTextOf(child);
    bodyTextParts.push(text);
    if (
      child.tagName === "h1" ||
      (child.tagName === "p" && p5HasClass(child, "pagehead"))
    ) {
      pageTitle = text;
    } else if (
      child.tagName === "p" &&
      (p5HasClass(child, "internal_navigation") || pilotIsNavBlock(child))
    ) {
      if (nav !== undefined) throw new Error("More than one nav block.");
      nav = pilotNavTargets(child);
    } else if (child.tagName === "div" && p5HasClass(child, "footer")) {
      continue;
    } else if (child.tagName === "p" && pilotContainsTag(child, "table")) {
      if (!/The Latin Library/.test(text)) {
        throw new Error(`Table inside <p> that isn't the footer`);
      }
    } else if (child.tagName === "div" && child.attrs.length > 0) {
      if (text.length > 0) headings.push(text);
    } else if (child.tagName === "center" && text.length === 0) {
      continue;
    } else if (child.tagName === "p") {
      if (text.length === 0) continue;
      paragraphs.push(child);
    } else {
      throw new Error(`Unexpected <${child.tagName}> directly in <body>.`);
    }
  }
  return {
    pageTitle,
    nav,
    headings,
    paragraphs,
    bodyText: bodyTextParts.join("\n"),
  };
}

function p5Body(html: string): P5Element {
  const doc = parse(html);
  const htmlEl = doc.childNodes.find(p5IsElement)!;
  return htmlEl.childNodes
    .filter(p5IsElement)
    .find((e) => e.tagName === "body")!;
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
// 1. Sweep
// ---------------------------------------------------------------------------

describeIfCorpus("corpus sweep (decode + extractLenientPage)", () => {
  it(`parses all ${SWEEP_FILES.length} pages without crashing or losing text`, () => {
    const crashes: string[] = [];
    const lost: string[] = [];
    const invented: string[] = [];
    const markerCensus = new Map<DetectedMarkerKind, number>();
    const warningCensus = new Map<string, number>();
    const blockKinds = new Map<string, number>();
    let pagesWithWarnings = 0;
    let replacementChars = 0;

    for (const file of SWEEP_FILES) {
      let page: LenientPageContent;
      let html: string;
      try {
        html = decodeLatinLibraryHtmlBytes(fs.readFileSync(file));
        replacementChars += (html.match(/\uFFFD/g) ?? []).length;
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

      for (const b of page.blocks) {
        blockKinds.set(b.kind, (blockKinds.get(b.kind) ?? 0) + 1);
        for (const m of b.markers) {
          markerCensus.set(m.kind, (markerCensus.get(m.kind) ?? 0) + 1);
        }
      }
      if (page.warnings.length > 0) pagesWithWarnings += 1;
      for (const w of page.warnings) {
        const key = w.replace(/'.*$/, "").replace(/\d+/g, "N");
        warningCensus.set(key, (warningCensus.get(key) ?? 0) + 1);
      }
    }

    const fmt = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
    console.log(
      [
        `Latin Library sweep (${FULL_SWEEP ? "full" : "sampled"}): ` +
          `${SWEEP_FILES.length} of ${ALL_FILES.length} pages, ${crashes.length} crashes, ` +
          `${lost.length} pages losing text, ${pagesWithWarnings} pages with warnings, ` +
          `${replacementChars} U+FFFD chars after decoding`,
        `Block kinds:\n${fmt(blockKinds)}`,
        `Marker census:\n${fmt(markerCensus)}`,
        `Warning census:\n${fmt(warningCensus)}`,
      ].join("\n")
    );

    expect(crashes).toEqual([]);
    expect(lost).toEqual([]);
    expect(invented).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Pilot parity
// ---------------------------------------------------------------------------

describeIfPilot("pilot parity with the strict readPageContent", () => {
  it(`matches the pilot on all ${PILOT_FILES.length} pilot pages`, () => {
    const mismatches: string[] = [];
    for (const file of PILOT_FILES) {
      // The pilot's onboard.ts reads the bytes as UTF-8.
      const html = fs.readFileSync(file, "utf8");
      const body = p5Body(html);
      const pilot = pilotReadPageContent(body);
      const sameBody: HtmlBodyParser = () => ({ body });
      const lenient = extractLenientPage(html, { parser: sameBody });
      const where = label(file);
      const check = (what: string, ok: boolean) => {
        if (!ok) mismatches.push(`${where}: ${what}`);
      };
      check(
        `pageTitle ${JSON.stringify(lenient.pageTitle)} vs ${JSON.stringify(
          pilot.pageTitle
        )}`,
        lenient.pageTitle === pilot.pageTitle
      );
      check("nav", JSON.stringify(lenient.nav) === JSON.stringify(pilot.nav));
      check(
        `headings ${JSON.stringify(lenient.headings)} vs ${JSON.stringify(
          pilot.headings
        )}`,
        JSON.stringify(lenient.headings) === JSON.stringify(pilot.headings)
      );
      check(
        `paragraphs (${lenient.paragraphs.length} vs ${pilot.paragraphs.length})`,
        lenient.paragraphs.length === pilot.paragraphs.length &&
          lenient.paragraphs.every((p, i) => p === pilot.paragraphs[i])
      );
      check(
        "paragraph text",
        pilot.paragraphs.every((p) => extractText(p) === pilotTextOf(p))
      );
      check("bodyText", lenient.bodyText === pilot.bodyText);
      check(
        `warnings ${JSON.stringify(lenient.warnings)}`,
        lenient.warnings.length === 0
      );
      check("footer", lenient.footerText !== undefined);
      check("title non-empty", lenient.pageTitle.length > 0);
    }
    expect(mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. parse5 vs DOMParser
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

  // A spread of layouts: every pilot work plus a sample of the rest.
  const sample = SWEEP_FILES.filter(
    (f, i) => PILOT_FILES.includes(f) || i % 7 === 0
  ).filter(
    (f, i, all) =>
      !PILOT_FILES.includes(f) ||
      // One page per pilot directory/work is enough.
      all.findIndex((g) => path.dirname(g) === path.dirname(f)) === i ||
      /resgestae|gaius1|prologi|praefatio/.test(f)
  );

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
