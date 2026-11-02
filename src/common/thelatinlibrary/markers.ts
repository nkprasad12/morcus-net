/**
 * Structural / citation marker detection for Latin Library page blocks.
 *
 * Browser-safe: must not import `fs`, `path`, `crypto`, `node:*` or `parse5`.
 */

import {
  extractTextWithMarks,
  getAttr,
  normalizeSpace,
} from "@/common/thelatinlibrary/dom_adapter";
import type {
  DetectedMarker,
  DetectedMarkerKind,
  MinimalElementNode,
  PageBlockKind,
} from "@/common/thelatinlibrary/page_layer_types";
import {
  parseRomanNumeral as parseRoman,
  toRoman,
} from "@/morceus/numerals/roman_numerals";

export { parseRoman, toRoman };

// ---------------------------------------------------------------------------
// Roman numerals and Latin ordinals
// ---------------------------------------------------------------------------

/** Masculine ordinals 1-20 as spelled on the site (after U -> V). */
const ORDINALS_MASC = [
  "PRIMVS",
  "SECVNDVS",
  "TERTIVS",
  "QVARTVS",
  "QVINTVS",
  "SEXTVS",
  "SEPTIMVS",
  "OCTAVVS",
  "NONVS",
  "DECIMVS",
  "VNDECIMVS",
  "DVODECIMVS",
  "TERTIVS DECIMVS",
  "QVARTVS DECIMVS",
  "QVINTVS DECIMVS",
  "SEXTVS DECIMVS",
  "SEPTIMVS DECIMVS",
  "DVODEVICESIMVS",
  "VNDEVICESIMVS",
  "VICESIMVS",
];

/** Parses `PRIMVS` / `primus` / `Tertius Decimus` etc.; `undefined` otherwise. */
export function parseLatinOrdinal(word: string): number | undefined {
  const s = word
    .toUpperCase()
    .replace(/U/g, "V")
    .replace(/\s+/g, " ")
    .replace(/VICENSIM/g, "VICESIM")
    .trim();
  const i = ORDINALS_MASC.indexOf(s);
  return i < 0 ? undefined : i + 1;
}

/** Value of a Roman numeral or Latin ordinal as a decimal string. */
function numberWordValue(word: string): string | undefined {
  const n = parseRoman(word) ?? parseLatinOrdinal(word);
  return n === undefined ? undefined : String(n);
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const ORDINAL_ALT =
  "(?:(?:PRIM|SECVND|SECUND|TERTI|QVART|QUART|QVINT|QUINT|SEXT|SEPTIM|OCTAV|NON|DECIM|VNDECIM|UNDECIM|DVODECIM|DUODECIM)(?:VS|US)(?:\\s+DECIM(?:VS|US))?|(?:DVODE|DUODE|VNDE|UNDE)?VICE[N]?SIM(?:VS|US))";

/** `[1]`, `[ 12 ]`, `[1a]`, `[1,1]`, `[1.2]`, `[IV]`, `[pr.]`. */
const BRACKETED =
  /\[\s*(\d{1,4}(?:[a-z](?![a-z]))?(?:\s*[,.]\s*\d{1,4}(?:[a-z](?![a-z]))?)*|[IVXLC]{1,8}|pr\.?)\s*\]/g;

/** Gaius-style numbered rubric: `[I. De iure civili et naturali.]`. */
const GAIUS_RUBRIC = /\[\s*([IVXLC]{1,8})\.\s+\p{Lu}[^[\]]*\]/gu;

/** `LIBER I`, `LIBER PRIMVS`, `Liber Secundus`. */
const LIBER = new RegExp(
  `(?<![\\p{L}\\p{N}])LIBER\\s+([IVXLC]{1,8}|${ORDINAL_ALT})(?![\\p{L}\\p{N}])\\.?`,
  "giu"
);

/** Trogus `PROLOGVS LIBRI I.`. */
const PROLOGUS = new RegExp(
  `(?<![\\p{L}\\p{N}])PROLOG[VU]S\\s+LIBRI\\s+([IVXLC]{1,8})(?![\\p{L}\\p{N}])\\.?`,
  "giu"
);

/** Digest citations: `Dig. 1.1.1pr.`, `Dig. 1.1.0.`, `Dig. 30.79.1`, `Dig. 1.1.0.R`. */
const DIGEST =
  /(?<![\p{L}\p{N}])Dig\.\s*(\d{1,3}(?:\.\d{1,4}(?:[a-z](?![a-z]))?){1,3})(pr)?(?:\.R(?![\p{L}]))?\.?/gu;

/** A block-initial dotted citation without `Dig.`: `1.1.1pr.`, `3.2.` */
const LEADING_DOTTED =
  /^(\d{1,4}(?:\.\d{1,4}(?:[a-z](?![a-z]))?)+)(pr)?\.?(?=\s|$)/u;

/** Block-initial bare/parenthesized number: `1.`, `(1)`, `12 ` */
const LEADING_NUMBER =
  /^(?:\((\d{1,4}[a-z]?)\)|(\d{1,4}[a-z]?)\.|(\d{1,4}[a-z]?)(?=\s+\S))(?=\s|$)/u;

/**
 * Leading Roman numeral heading: `I.`, `XIV.`, `CAPUT III`, or a heading that
 * is only a numeral. Single-letter `L`, `C`, `D`, `M` are not accepted at a
 * paragraph start since they are usually praenomina (`C. Iulius`).
 */
const LEADING_ROMAN_PARAGRAPH = /^([IVXLC]{1,8})\.(?=\s+[\p{Lu}[(\d])/u;
const LEADING_CAPUT =
  /^(?:CAPVT|CAPUT|CAP\.)\s*([IVXLC]{1,8}|\d{1,4})(?![\p{L}\p{N}])\.?/iu;
const STANDALONE_ROMAN = /^([IVXLC]{1,8})\.?$/u;
const LEADING_ROMAN_HEADING = /^([IVXLC]{1,8})\.(?=\s|$)/u;

/** Anchor names that look like a citation (`12`, `4b`, `IV`, `pr`, `1.2`). */
const CITATION_LIKE_ANCHOR =
  /^(?:\d{1,4}[a-z]?|[IVXLC]{1,8}|pr)(?:[._-]\d{1,4}[a-z]?|[._-]pr)*$/i;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface Candidate {
  kind: DetectedMarkerKind;
  raw: string;
  value: string;
  offset: number;
  /** Lower wins when candidates overlap. */
  priority: number;
}

function normalizeBracketedValue(inner: string): string | undefined {
  const s = inner.trim();
  if (/^pr\.?$/i.test(s)) return "pr";
  if (/^\d/.test(s)) {
    return s
      .split(/\s*[,.]\s*/)
      .filter((p) => p.length > 0)
      .join(".");
  }
  const n = parseRoman(s);
  return n === undefined ? undefined : String(n);
}

function singleLetterPraenomen(numeral: string): boolean {
  return /^[LCDM]$/.test(numeral);
}

function collectCandidates(text: string, kind: PageBlockKind): Candidate[] {
  const out: Candidate[] = [];
  const add = (
    k: DetectedMarkerKind,
    raw: string,
    value: string | undefined,
    offset: number,
    priority: number
  ) => {
    if (value === undefined || raw.length === 0) return;
    out.push({ kind: k, raw, value, offset, priority });
  };

  for (const m of text.matchAll(GAIUS_RUBRIC)) {
    add("gaius_rubric", m[0], numberWordValue(m[1]), m.index, 0);
  }
  for (const m of text.matchAll(BRACKETED)) {
    add("bracketed_number", m[0], normalizeBracketedValue(m[1]), m.index, 1);
  }
  for (const m of text.matchAll(DIGEST)) {
    add("digest_citation", m[0], m[1] + (m[2] ?? ""), m.index, 2);
  }
  for (const m of text.matchAll(PROLOGUS)) {
    add("prologus", m[0], numberWordValue(m[1]), m.index, 3);
  }
  // LIBER headings: anywhere in headings, only block-initial in short
  // paragraphs (avoids "liber" the adjective in running prose).
  const shortBlock = text.length <= 80;
  for (const m of text.matchAll(LIBER)) {
    if (kind !== "heading" && !(shortBlock && m.index === 0)) continue;
    add("liber_heading", m[0], numberWordValue(m[1]), m.index, 3);
  }

  // Block-initial markers.
  const dotted = LEADING_DOTTED.exec(text);
  if (dotted !== null) {
    const parts = dotted[1].split(".").length;
    const value = dotted[1] + (dotted[2] ?? "");
    if (parts >= 3 || dotted[2] !== undefined) {
      add("digest_citation", dotted[0], value, 0, 4);
    } else {
      add("bare_number", dotted[0], value, 0, 4);
    }
  }
  const caput = LEADING_CAPUT.exec(text);
  if (caput !== null) {
    const v = /^\d/.test(caput[1]) ? caput[1] : numberWordValue(caput[1]);
    add("roman_heading", caput[0], v, 0, 5);
  }
  if (kind === "heading") {
    const standalone =
      STANDALONE_ROMAN.exec(text) ?? LEADING_ROMAN_HEADING.exec(text);
    if (standalone !== null) {
      add("roman_heading", standalone[0], numberWordValue(standalone[1]), 0, 5);
    }
  } else {
    const roman = LEADING_ROMAN_PARAGRAPH.exec(text);
    if (roman !== null && !singleLetterPraenomen(roman[1])) {
      add("roman_heading", roman[0], numberWordValue(roman[1]), 0, 5);
    }
  }
  const num = LEADING_NUMBER.exec(text);
  if (num !== null) {
    add("bare_number", num[0], num[1] ?? num[2] ?? num[3], 0, 6);
  }
  return out;
}

/** Drops candidates overlapping an earlier/higher-priority one. */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const byPriority = [...cands].sort(
    (a, b) => a.priority - b.priority || a.offset - b.offset
  );
  const accepted: Candidate[] = [];
  for (const c of byPriority) {
    const end = c.offset + c.raw.length;
    const clash = accepted.some(
      (a) => c.offset < a.offset + a.raw.length && a.offset < end
    );
    if (!clash) accepted.push(c);
  }
  return accepted.sort((a, b) => a.offset - b.offset);
}

interface AnchorInfo {
  name: string;
  /** Visible text inside the `<a>` (normalized). */
  visible: string;
}

function anchorOf(el: MinimalElementNode): AnchorInfo | undefined {
  if (el.tagName !== "a") return undefined;
  const name = getAttr(el, "name") ?? getAttr(el, "id");
  if (name === undefined) return undefined;
  return { name: name.trim(), visible: "" };
}

/**
 * Locates the `<a name>` / `<a id>` anchors of `element` inside `text`.
 * `text` is normally `extractText(element, { preserveLineBreaks })`; both modes
 * are tried, and as a fallback anchors are located by searching for their
 * visible text.
 */
function locateAnchors(
  element: MinimalElementNode,
  text: string
): { name: string; visible: string; offset: number }[] {
  let located: { name: string; visible: string; offset: number }[] | undefined;
  for (const preserveLineBreaks of [false, true]) {
    const { text: t, marks } = extractTextWithMarks(
      element,
      { preserveLineBreaks },
      (el) => {
        const a = anchorOf(el);
        return a === undefined ? undefined : { a, el };
      }
    );
    const withVisible = marks.map((m) => ({
      name: m.data.a.name,
      visible: normalizeSpace(
        extractTextWithMarks<never>(m.data.el, undefined).text
      ),
      offset: m.offset,
    }));
    if (located === undefined) located = withVisible;
    if (t === text) return withVisible;
  }
  // `text` was produced some other way: search for each anchor's visible text.
  let cursor = 0;
  return (located ?? []).map((a) => {
    const needle = a.visible.length > 0 ? a.visible : a.name;
    const idx = text.indexOf(needle, cursor);
    if (idx >= 0) {
      cursor = idx;
      return { ...a, offset: idx };
    }
    return { ...a, offset: Math.min(cursor, text.length) };
  });
}

/**
 * Detects structural / citation markers inside one block, in text order.
 *
 * - `bracketed_number`: every `[1]`, `[1a]`, `[1,1]` (value `"1.1"`), `[IV]`
 *   (value `"4"`), `[pr.]` (value `"pr"`).
 * - `gaius_rubric`: every `[I. De ...]` rubric (value: the numeral, `"1"`).
 * - `digest_citation`: every `Dig. 1.1.1pr.` (value `"1.1.1pr"`), plus a
 *   block-initial dotted citation with 3+ parts or `pr` (`1.1.1pr.`).
 * - `liber_heading`: `LIBER I` / `LIBER PRIMVS` (value `"1"`) anywhere in a
 *   heading, or at the start of a short (<= 80 chars) paragraph.
 * - `prologus`: `PROLOGVS LIBRI I.` (value `"1"`).
 * - `roman_heading`: a heading that is a numeral (`XIV.`) or starts with one
 *   (`II. De ...`), `CAPVT III`, or a paragraph starting `IV. ` before a
 *   capital (Justin's chapters); single-letter `L.`/`C.`/`D.`/`M.` are
 *   excluded at paragraph start as likely praenomina.
 * - `bare_number`: a block-initial `1.`, `(1)`, `12 Text`, or 2-part `3.2`.
 * - `anchor`: an `<a name>` / `<a id>` whose name looks like a citation
 *   (`12`, `4b`, `IV`, `pr`) and that does not coincide with another marker.
 *   `raw` is the anchor's visible text when it has some (e.g. `"2."`), else
 *   its name. Anchors that coincide with a text marker of the same value
 *   (`[<a name="1">1</a>]`, `<a name="1">1.</a> Text`) instead set
 *   `anchored: true` on that marker.
 *
 * Roman values are normalized to decimal strings. Overlapping matches are
 * resolved in the priority order listed above. Never throws.
 *
 * @returns markers sorted by offset, and all anchor names in document order.
 */
export function detectBlockMarkers(
  element: MinimalElementNode,
  text: string,
  kind: PageBlockKind
): { markers: DetectedMarker[]; anchors: string[] } {
  const located = locateAnchors(element, text);
  const anchors = located.map((a) => a.name);
  const markers: (Candidate & { anchored?: boolean })[] = resolveOverlaps(
    collectCandidates(text, kind)
  );

  for (const a of located) {
    if (!CITATION_LIKE_ANCHOR.test(a.name)) continue;
    const anchorValue =
      /^[IVXLC]+$/i.test(a.name) && parseRoman(a.name) !== undefined
        ? String(parseRoman(a.name))
        : a.name.replace(/[_-]/g, ".");
    const near = markers.find(
      (m) =>
        m.kind !== "anchor" &&
        m.value === anchorValue &&
        a.offset >= m.offset - 1 &&
        a.offset <= m.offset + m.raw.length
    );
    if (near !== undefined) {
      near.anchored = true;
      continue;
    }
    const visibleHere =
      a.visible.length > 0 && text.startsWith(a.visible, a.offset);
    markers.push({
      kind: "anchor",
      raw: visibleHere ? a.visible : a.name,
      value: anchorValue,
      offset: a.offset,
      priority: 99,
    });
  }

  markers.sort((x, y) => x.offset - y.offset || x.priority - y.priority);
  return {
    markers: markers.map((m) => {
      const out: DetectedMarker = {
        kind: m.kind,
        raw: m.raw,
        value: m.value,
        offset: m.offset,
      };
      return m.anchored === true ? { ...out, anchored: true } : out;
    }),
    anchors,
  };
}
