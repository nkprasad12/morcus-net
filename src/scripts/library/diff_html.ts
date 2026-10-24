/**
 * HTML-aware comparison and summarisation of two rendered reader pages, for
 * `./morcus.sh library diff`.
 *
 * The pages are HTML fragments emitted by our own preprocessor, so a small
 * tokenizer is enough: no DOM is built. Each page becomes a sequence of tokens
 * (start tag, end tag, comment, word or whitespace run) in a normal form where
 * attributes are sorted by name, `class` tokens are sorted, whitespace inside
 * tags is collapsed and character references are decoded. Two pages are
 * "the same" when their normal forms are equal, so attribute reordering or
 * `&#39;` vs `'` is not reported as a change.
 */

import { diffArrays } from "diff";
import he from "he";

export type HtmlTokenKind = "start" | "end" | "comment" | "text";

export interface HtmlToken {
  kind: HtmlTokenKind;
  /** The token's normal form; equal normal forms mean equal tokens. */
  norm: string;
  /** Lower-cased tag name, for `start` and `end` tokens. */
  tag?: string;
  /** Attributes in name order (decoded values), for `start` tokens. */
  attrs?: [string, string][];
}

const TOKEN_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<\s]+|\s+|</g;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const TAG_NAME_RE = /^<\/?([a-zA-Z][^\s/>]*)/;

function normalizeAttr(name: string, value: string): string {
  if (name !== "class") {
    return value;
  }
  return value.split(/\s+/).filter(Boolean).sort().join(" ");
}

function parseTag(raw: string): HtmlToken {
  const isEnd = raw.startsWith("</");
  const rawName = TAG_NAME_RE.exec(raw)?.[1] ?? "";
  const tag = rawName.toLowerCase();
  if (isEnd) {
    return { kind: "end", norm: `</${tag}>`, tag };
  }
  const selfClosing = raw.endsWith("/>");
  const afterName = raw.slice(1 + rawName.length, selfClosing ? -2 : -1);
  const attrs: [string, string][] = [];
  for (const m of afterName.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    const value = he.decode(m[2] ?? m[3] ?? m[4] ?? "");
    attrs.push([name, normalizeAttr(name, value)]);
  }
  attrs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const attrText = attrs.map(([n, v]) => ` ${n}="${he.escape(v)}"`).join("");
  return {
    kind: "start",
    norm: `<${tag}${attrText}${selfClosing ? " /" : ""}>`,
    tag,
    attrs,
  };
}

/** Splits an HTML fragment into normalised tokens (words and spaces apart). */
export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  for (const m of html.matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (raw.startsWith("<!--")) {
      tokens.push({ kind: "comment", norm: raw });
    } else if (raw.length > 1 && raw.startsWith("<")) {
      tokens.push(parseTag(raw));
    } else {
      tokens.push({ kind: "text", norm: he.decode(raw) });
    }
  }
  return tokens;
}

/** The normal form of a whole fragment (see the file comment). */
export function normalizeHtml(html: string): string {
  return tokenizeHtml(html)
    .map((t) => t.norm)
    .join("");
}

export type CountDelta = Record<string, number>;

/** Counts start tags, class tokens and attribute names in `tokens`. */
function countMarkup(tokens: HtmlToken[]) {
  const tags = new Map<string, number>();
  const classes = new Map<string, number>();
  const attrs = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) =>
    m.set(k, (m.get(k) ?? 0) + 1);
  for (const t of tokens) {
    if (t.kind !== "start") {
      continue;
    }
    bump(tags, t.tag!);
    for (const [name, value] of t.attrs!) {
      if (name === "class") {
        for (const c of value.split(" ").filter(Boolean)) {
          bump(classes, c);
        }
      } else {
        bump(attrs, `${t.tag}@${name}`);
      }
    }
  }
  return { tags, classes, attrs };
}

function delta(
  before: Map<string, number>,
  after: Map<string, number>
): CountDelta {
  const result: CountDelta = {};
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const k of [...keys].sort()) {
    const d = (after.get(k) ?? 0) - (before.get(k) ?? 0);
    if (d !== 0) {
      result[k] = d;
    }
  }
  return result;
}

/** Adds `extra` into `into`, dropping keys that net to zero. */
export function mergeDelta(into: CountDelta, extra: CountDelta): CountDelta {
  for (const [k, v] of Object.entries(extra)) {
    const sum = (into[k] ?? 0) + v;
    if (sum === 0) {
      delete into[k];
    } else {
      into[k] = sum;
    }
  }
  return into;
}

export interface DiffHunk {
  /**
   * One-line word-diff rendering of the hunk in normal form, with context:
   * `…context [-removed-]{+added+} context…`.
   */
  text: string;
  /** Number of tokens removed / added in the hunk. */
  removed: number;
  added: number;
  /** The hunk's pattern (see `hunkSignature`). */
  signature: string;
}

/**
 * A context-free, number-blind rendering of a hunk's edits
 * (`[-removed-]{+added+}`, with digit runs replaced by `#`), so that the same
 * mechanical change on many pages counts as one pattern.
 */
export function hunkSignature(
  parts: { kind: "eq" | "del" | "ins"; tokens: string[] }[],
  maxChars = 160
): string {
  const text = parts
    .map((p) => {
      const body = oneLine(p.tokens.join(""));
      return p.kind === "del"
        ? `[-${body}-]`
        : p.kind === "ins"
        ? `{+${body}+}`
        : "…";
    })
    .join("")
    .replace(/[0-9]+/g, "#");
  return clip(text, maxChars);
}

export interface PageDiffSummary {
  /** True if the normal forms differ. */
  changed: boolean;
  /** True if the raw bytes differ (may be true while `changed` is false). */
  rawChanged: boolean;
  /** True if the text content (tags dropped) differs. */
  textChanged: boolean;
  /** After-minus-before counts of start tags by name. */
  tags: CountDelta;
  /** After-minus-before counts of class tokens. */
  classes: CountDelta;
  /** After-minus-before counts of non-class attributes, as `tag@attr`. */
  attrs: CountDelta;
  /** Total number of change hunks (may exceed `hunks.length`). */
  hunkCount: number;
  /** The first few hunks. */
  hunks: DiffHunk[];
  /** Count of hunks by signature (all hunks, up to `maxPatterns` distinct). */
  patterns: CountDelta;
  /** True if the token diff was abandoned as too large to compute. */
  tooLarge?: boolean;
}

export interface SummarizeOptions {
  /** Maximum hunks to render per page. */
  maxHunks?: number;
  /** Tokens of context on either side of a hunk. */
  context?: number;
  /** Maximum characters of each rendered side of a hunk. */
  maxChars?: number;
  /** Equal runs shorter than this are folded into the surrounding hunk. */
  mergeGap?: number;
  /** Give up on the token diff beyond this edit distance. */
  maxEditLength?: number;
  /** Maximum distinct hunk signatures counted per page. */
  maxPatterns?: number;
}

function clip(s: string, max: number, fromEnd = false): string {
  if (s.length <= max) {
    return s;
  }
  return fromEnd ? "…" + s.slice(s.length - max) : s.slice(0, max) + "…";
}

function oneLine(s: string): string {
  return s.replace(/\n/g, "⏎");
}

function textOf(tokens: HtmlToken[]): string {
  return tokens
    .filter((t) => t.kind === "text")
    .map((t) => t.norm)
    .join("");
}

/** Compares two versions of a page fragment. Either side may be undefined. */
export function summarizePageDiff(
  beforeHtml: string | undefined,
  afterHtml: string | undefined,
  options: SummarizeOptions = {}
): PageDiffSummary {
  const {
    maxHunks = 3,
    context = 8,
    maxChars = 240,
    mergeGap = 3,
    maxEditLength = 4000,
    maxPatterns = 20,
  } = options;
  const empty: PageDiffSummary = {
    changed: false,
    rawChanged: false,
    textChanged: false,
    tags: {},
    classes: {},
    attrs: {},
    hunkCount: 0,
    hunks: [],
    patterns: {},
  };
  if (beforeHtml === afterHtml) {
    return empty;
  }
  const before = tokenizeHtml(beforeHtml ?? "");
  const after = tokenizeHtml(afterHtml ?? "");
  const beforeNorm = before.map((t) => t.norm);
  const afterNorm = after.map((t) => t.norm);
  const changed =
    beforeNorm.length !== afterNorm.length ||
    beforeNorm.some((n, i) => n !== afterNorm[i]);
  if (!changed) {
    return { ...empty, rawChanged: true };
  }
  const b = countMarkup(before);
  const a = countMarkup(after);
  const summary: PageDiffSummary = {
    changed: true,
    rawChanged: true,
    textChanged: textOf(before) !== textOf(after),
    tags: delta(b.tags, a.tags),
    classes: delta(b.classes, a.classes),
    attrs: delta(b.attrs, a.attrs),
    hunkCount: 0,
    hunks: [],
    patterns: {},
  };

  const changes = diffArrays(beforeNorm, afterNorm, { maxEditLength });
  if (changes === undefined) {
    summary.tooLarge = true;
    summary.hunkCount = 1;
    summary.patterns["(too many changes to diff)"] = 1;
    return summary;
  }

  // Group into hunks: runs of removed/added changes, folding short equal runs.
  type Part = { kind: "eq" | "del" | "ins"; tokens: string[] };
  const parts: Part[] = changes.map((c) => ({
    kind: c.added ? "ins" : c.removed ? "del" : "eq",
    tokens: c.value,
  }));
  const hunkRanges: [number, number][] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].kind === "eq") {
      continue;
    }
    const last = hunkRanges[hunkRanges.length - 1];
    if (
      last !== undefined &&
      (last[1] === i - 1 ||
        (last[1] === i - 2 && parts[i - 1].tokens.length < mergeGap))
    ) {
      last[1] = i;
    } else {
      hunkRanges.push([i, i]);
    }
  }
  summary.hunkCount = hunkRanges.length;
  const signatures = hunkRanges.map(([start, end]) =>
    hunkSignature(parts.slice(start, end + 1))
  );
  for (const sig of signatures) {
    if (
      summary.patterns[sig] !== undefined ||
      Object.keys(summary.patterns).length < maxPatterns
    ) {
      summary.patterns[sig] = (summary.patterns[sig] ?? 0) + 1;
    }
  }
  // Prefer hunks showing patterns not already shown.
  const shownSigs = new Set<string>();
  const order = hunkRanges.map((_, i) => i);
  const firstOfSig = order.filter((i) => {
    const fresh = !shownSigs.has(signatures[i]);
    shownSigs.add(signatures[i]);
    return fresh;
  });
  const fresh = new Set(firstOfSig);
  const chosen = [...firstOfSig, ...order.filter((i) => !fresh.has(i))]
    .slice(0, maxHunks)
    .sort((x, y) => x - y);
  for (const h of chosen) {
    const [start, end] = hunkRanges[h];
    const pre = parts[start - 1]?.tokens.slice(-context).join("") ?? "";
    const post = parts[end + 1]?.tokens.slice(0, context).join("") ?? "";
    let text = clip(oneLine(pre), maxChars / 2, true);
    let removed = 0;
    let added = 0;
    for (let i = start; i <= end; i++) {
      const p = parts[i];
      const body = clip(oneLine(p.tokens.join("")), maxChars);
      if (p.kind === "del") {
        removed += p.tokens.length;
        text += `[-${body}-]`;
      } else if (p.kind === "ins") {
        added += p.tokens.length;
        text += `{+${body}+}`;
      } else {
        text += body;
      }
    }
    text += clip(oneLine(post), maxChars / 2);
    summary.hunks.push({ text, removed, added, signature: signatures[h] });
  }
  return summary;
}
