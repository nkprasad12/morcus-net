/**
 * Parsing and rendering for user-supplied text in the External Content Reader.
 *
 * This is a `.common.ts` for the reason described in `src/web/v2/README.md`:
 * the server renders it for URL imports (`?url=`), and the client renders
 * byte-identical markup for texts saved on the device (`?local=`), which the
 * server never sees. One implementation keeps the two from drifting.
 *
 * The output deliberately reuses the section shape emitted for library works
 * by `v2_preprocessor.ts` (`.reader-section#sec-N` > `.reader-gutter` +
 * `.reader-passage[data-tokenize-target]`), so gutter numbers, permalink
 * anchors, typography, tokenization and `matchText` highlighting all apply
 * unchanged.
 *
 * Line breaks are handled by an explicit, user-chosen {@link LineMode} rather
 * than a heuristic, so the default rendering is deterministic:
 *
 * - `keep` (default): blank lines separate paragraphs; single newlines are kept
 *   as line breaks, which is what V1 showed (`white-space: pre-wrap`).
 * - `prose`: lines within a paragraph are reflowed, rejoining words that were
 *   hyphenated across a line break (`ali-⏎quid` → `aliquid`). Without this,
 *   the tokenizer sees `ali` and `quid`, and both lookups are wrong.
 * - `verse`: every line is its own numbered section, as in library verse,
 *   with blank lines rendered as stanza breaks.
 *
 * This module must not import `he` (see `core/html.common.ts`).
 */

import { processTokens } from "@/common/text_cleaning";
import { html, joinHtml, type SafeHtml } from "@/web/v2/core/html.common";

export type LineMode = "keep" | "prose" | "verse";

export const LINE_MODES: readonly LineMode[] = ["keep", "prose", "verse"];

export const DEFAULT_LINE_MODE: LineMode = "keep";

/**
 * Upper bound on the (normalized) text length that is rendered. Large enough
 * for a long book of prose; small enough that tokenizing it on the client
 * stays responsive. Longer input is cut at the last line break before the cap.
 */
export const MAX_EXTERNAL_TEXT_CHARS = 200_000;

/** The title used when neither the user nor the text supplies one. */
export const UNTITLED_TEXT = "Untitled text";

const TITLE_MAX_WORDS = 6;
/** A line break ends a derived title once it has at least this many words. */
const TITLE_MIN_LINE_WORDS = 3;
const TITLE_MAX_CHARS = 60;

/** One citable unit: a paragraph (`keep` / `prose`) or a line (`verse`). */
export interface ExternalSection {
  /** 1-based citation id, used for `#sec-<id>` anchors and `matchText`. */
  id: string;
  /** The section's lines, already trimmed. `prose` sections have exactly one. */
  lines: string[];
  /** `verse` only: this line opens a new stanza (it followed a blank line). */
  stanzaStart?: boolean;
  /** `verse` only: the source line was indented (e.g. an elegiac pentameter). */
  indent?: boolean;
}

export interface ExternalDocument {
  mode: LineMode;
  sections: ExternalSection[];
  /** Whether the text contains macra, so the reader can offer the Macra toggle. */
  hasMacra: boolean;
  /** Whether the input exceeded {@link MAX_EXTERNAL_TEXT_CHARS} and was cut. */
  truncated: boolean;
}

/** Parses an untrusted value (query param, form field, stored row) as a mode. */
export function parseLineMode(raw: unknown): LineMode {
  return LINE_MODES.find((mode) => mode === raw) ?? DEFAULT_LINE_MODE;
}

// Characters that are invisible in the source but split or corrupt word
// tokens: zero-width space/joiners, BOM, and the soft hyphen (common in text
// copied from PDFs, and not a token break, so `ali\u00ADquid` never matches).
const INVISIBLE_CHARS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
// Horizontal whitespace other than a plain space, including NBSP.
const ODD_SPACES = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Canonicalizes line endings and whitespace so parsing is independent of the
 * source (Windows paste, web scrape, PDF copy):
 *
 * - `\r\n` / `\r` → `\n`, and NFC normalization, so a macron typed as a
 *   combining mark and one typed precomposed are the same text.
 * - Invisible characters are removed; tabs and exotic spaces become spaces.
 * - Trailing whitespace is stripped from each line; leading whitespace is kept
 *   because verse indentation is meaningful.
 * - Runs of blank lines collapse to one, and the text is trimmed of blank
 *   lines at both ends. Scraped pages in particular produce long runs.
 */
export function normalizeExternalText(raw: string): string {
  const lines = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE_CHARS, "")
    .replace(ODD_SPACES, " ")
    .split("\n")
    .map((line) => line.trimEnd());

  const out: string[] = [];
  for (const line of lines) {
    if (line === "" && (out.length === 0 || out[out.length - 1] === "")) {
      continue;
    }
    out.push(line);
  }
  while (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }
  return out.join("\n");
}

// The combining macron (U+0304) sits outside the class: inside one, a lone
// combining mark trips `no-misleading-character-class`.
const MACRA =
  /[\u0100\u0101\u0112\u0113\u012A\u012B\u014C\u014D\u016A\u016B\u0232\u0233]|\u0304/;

/** Whether `text` contains long-vowel macra (precomposed or combining). */
export function hasMacra(text: string): boolean {
  return MACRA.test(text);
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTERNAL_TEXT_CHARS) {
    return { text, truncated: false };
  }
  const cut = text.slice(0, MAX_EXTERNAL_TEXT_CHARS);
  const lastBreak = cut.lastIndexOf("\n");
  return {
    text: (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd(),
    truncated: true,
  };
}

// A line that ends in a letter followed by a hyphen, i.e. a word broken across
// the line. Covers the Latin-1 and Latin Extended ranges used for macra.
const HYPHENATED_END = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]-$/;
const STARTS_LOWERCASE = /^[a-z\u00DF-\u00FF\u0101-\u024F\u1E01-\u1EFF]/;

/**
 * Reflows the lines of one paragraph into a single line. A trailing hyphen is
 * only treated as a line-break hyphen when the next line starts in lowercase;
 * `Graeco-⏎Romanus` and dashes before a capital are left alone.
 */
export function reflowProseLines(lines: string[]): string {
  let out = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (out === "") {
      out = line;
    } else if (HYPHENATED_END.test(out) && STARTS_LOWERCASE.test(line)) {
      out = out.slice(0, -1) + line;
    } else {
      out = `${out} ${line}`;
    }
  }
  return out;
}

// Two or more leading spaces mark an indented line. A single space is too
// often an artifact of copying to mean anything.
const INDENTED = /^ {2,}\S/;

/**
 * Splits text into citable sections according to `mode`. See the module
 * comment for what each mode does.
 */
export function parseExternalText(
  raw: string,
  mode: LineMode = DEFAULT_LINE_MODE
): ExternalDocument {
  const { text, truncated } = truncate(normalizeExternalText(raw));
  const blocks =
    text === "" ? [] : text.split("\n\n").map((block) => block.split("\n"));

  const sections: ExternalSection[] = [];
  const push = (section: Omit<ExternalSection, "id">) => {
    sections.push({ id: String(sections.length + 1), ...section });
  };

  for (const [blockIndex, lines] of blocks.entries()) {
    if (mode === "verse") {
      for (const [lineIndex, line] of lines.entries()) {
        const section: Omit<ExternalSection, "id"> = { lines: [line.trim()] };
        if (blockIndex > 0 && lineIndex === 0) section.stanzaStart = true;
        if (INDENTED.test(line)) section.indent = true;
        push(section);
      }
    } else if (mode === "prose") {
      push({ lines: [reflowProseLines(lines)] });
    } else {
      push({ lines: lines.map((line) => line.trim()) });
    }
  }

  return { mode, sections, hasMacra: hasMacra(text), truncated };
}

/**
 * Derives a display title from the first words of the text, used when the user
 * leaves the title blank: `Gallia est omnis divisa in partes…`.
 *
 * Numeric tokens (section numbers, page navigation on scraped pages) are
 * skipped. A line break ends the title once it has a few words, so a heading
 * line like `ORATIO IN L CATILINAM PRIMA` becomes the whole title.
 */
export function deriveExternalTitle(raw: string): string {
  const lines = normalizeExternalText(raw).split("\n");
  const words: string[] = [];
  let hasMore = false;
  outer: for (const line of lines) {
    if (words.length >= TITLE_MIN_LINE_WORDS) break;
    for (const [token, isWord] of processTokens(line)) {
      if (!isWord || /\d/.test(token)) continue;
      if (words.length === TITLE_MAX_WORDS) {
        hasMore = true;
        break outer;
      }
      words.push(token);
    }
  }
  if (words.length === 0) {
    return UNTITLED_TEXT;
  }
  let title = words.join(" ");
  if (title.length > TITLE_MAX_CHARS) {
    title = title.slice(0, TITLE_MAX_CHARS).trimEnd();
    hasMore = true;
  }
  return hasMore ? `${title}…` : title;
}

/** Resolves the title to show: the user's, if non-blank, else a derived one. */
export function resolveExternalTitle(
  userTitle: string | undefined,
  text: string
): string {
  const trimmed = userTitle?.trim() ?? "";
  return trimmed !== "" ? trimmed : deriveExternalTitle(text);
}

/**
 * Library verse shows the first line number and every fifth; the rest are
 * latent (revealed on hover or target). Mirrors `v2_preprocessor.ts`.
 */
function isLatentLabel(mode: LineMode, index: number): boolean {
  return mode === "verse" && index !== 0 && (index + 1) % 5 !== 0;
}

function renderSectionContent(
  mode: LineMode,
  section: ExternalSection
): SafeHtml[] {
  if (mode === "verse") {
    const lineClass = section.indent ? "reader-line indent" : "reader-line";
    const line = html`<span class="${lineClass}">${section.lines[0]}</span>`;
    return section.stanzaStart
      ? [html`<span class="line-space" aria-hidden="true"></span>`, line]
      : [line];
  }
  const lines = joinHtml(
    section.lines.map((line) => html`${line}`),
    "<br>"
  );
  return [html`<p class="reader-paragraph">${lines}</p>`];
}

function renderSection(
  mode: LineMode,
  section: ExternalSection,
  index: number
): SafeHtml {
  const { id } = section;
  const anchorClass = isLatentLabel(mode, index)
    ? "section-anchor latent"
    : "section-anchor";
  const sectionClass =
    mode === "verse" ? "reader-section section-verse" : "reader-section";
  const label = mode === "verse" ? "Line" : "Paragraph";
  const content = joinHtml(renderSectionContent(mode, section));
  return html`<div class="${sectionClass}" id="sec-${id}">
    <div class="reader-gutter">
      <a
        href="#sec-${id}"
        class="${anchorClass}"
        title="${label} ${id} (Click to copy link)"
        aria-label="${label} ${id}"
        ><span class="cite-prefix"></span
        ><span class="cite-local">${id}</span></a
      >
    </div>
    <div class="reader-passage" data-tokenize-target="true">${content}</div>
  </div>`;
}

/**
 * Renders a parsed document as the inner HTML of `#reader-passage`.
 * All text is escaped; the only markup is the fixed section structure.
 */
export function renderExternalPassageHtml(doc: ExternalDocument): SafeHtml {
  return html`${joinHtml(
    doc.sections.map((section, i) => renderSection(doc.mode, section, i)),
    "\n"
  )}`;
}
