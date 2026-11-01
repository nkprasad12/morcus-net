import { checkSequentialIds } from "@/scripts/thelatinlibrary/checks";
import { textOf } from "@/scripts/thelatinlibrary/html";
import {
  checkNoTextLost,
  fail,
  parseRoman,
  readPageContent,
  toRoman,
  type PageConversion,
} from "@/scripts/thelatinlibrary/page";
import { splitAtSequentialMarkers } from "@/scripts/thelatinlibrary/strict_markers";

/**
 * Converters for Justin's Epitome of Pompeius Trogus.
 *
 * Book pages (`justin/<n>.html`):
 *
 *   <div align="center">LIBER XI</div>
 *   <p>I. Chapter text ... 2 more text ... 3 ...</p>   -> 11.1
 *   <p>II. ...</p>                                       -> 11.2
 *
 * Rows are cited by book and chapter. Chapters open with a Roman numeral
 * (`I.`, `[I]`, or a bare `III` before a capital), usually at a paragraph
 * start but sometimes mid-paragraph, and must run I, II, III, ... A numeral
 * is only taken as a chapter marker when it is exactly the next chapter, so
 * numbers in the text (`V. milia hostium`) are left alone.
 *
 * The site also prints bare section numbers inside chapters, but they are
 * absent from books 1-7 and 13 and have typos, gaps and repeats elsewhere,
 * so they are removed rather than used as a citation level.
 */

/** A possible chapter marker: `[IV]`, `IV.`, or a bare `IV` before a capital. */
const CHAPTER_CANDIDATE =
  /(?<![\p{L}\p{N}])(?:\[([IVXLC]+)\]|([IVXLC]+)\.|([IVXLC]+)(?=\s+[\p{Lu}[(]))(?=\s)/gu;
/** A bare section number standing alone between words. */
const SECTION_NUMBER = /(?<![\p{L}\p{N}[\]])\d{1,2}(?=\s)/gu;

export interface JustinBookConversion extends PageConversion {
  /** Accepted chapter markers followed by a lowercase word, for review. */
  lowercaseMarkers: string[];
  removedSectionNumbers: number;
}

export function convertJustinBook(
  html: string,
  book: number
): JustinBookConversion {
  const content = readPageContent(html);
  const expectedHeading = `LIBER ${toRoman(book)}`;
  if (
    content.headings.length !== 1 ||
    content.headings[0] !== expectedHeading
  ) {
    fail(
      `Expected heading '${expectedHeading}', found ${JSON.stringify(
        content.headings
      )}.`
    );
  }
  const paragraphTexts = content.paragraphs.map(textOf);
  const label = `Book ${book}`;
  const chapters = splitAtSequentialMarkers(paragraphTexts, {
    label,
    markerPattern: CHAPTER_CANDIDATE,
    allowInlineSplits: true,
    allowLeadingPr: false,
    parseMarkerValue: parseRoman,
    ignoreOutOfOrderInline: true,
  });
  checkSequentialIds(
    chapters.map(([id]) => id),
    label
  );

  // A paragraph that opens with a chapter-like numeral must have been used.
  for (const p of paragraphTexts) {
    const m = /^(?:\[([IVXLC]+)\]|([IVXLC]+)\.)\s/.exec(p);
    if (m !== null && parseRoman(m[1] ?? m[2]) !== undefined) {
      const rest = p.slice(m[0].length).trim();
      if (chapters.some(([, text]) => text.includes(p))) {
        fail(
          `${label}: paragraph opens with '${m[0].trim()}' but it is out of sequence.`
        );
      }
      void rest;
    }
  }

  const lowercaseMarkers: string[] = [];
  const rows: [string[], string][] = [];
  let removedSectionNumbers = 0;
  for (const [chapId, raw] of chapters) {
    if (/^\p{Ll}/u.test(raw)) {
      lowercaseMarkers.push(`${book}.${chapId}: '${raw.slice(0, 40)}…'`);
    }
    const sectionNumbers = raw.match(SECTION_NUMBER) ?? [];
    removedSectionNumbers += sectionNumbers.length;
    const text = raw.replace(SECTION_NUMBER, "").replace(/\s+/g, " ").trim();
    if (/\d/.test(text)) {
      fail(
        `Book ${book}.${chapId}: unexpected digits left in '${text.slice(
          0,
          80
        )}'`
      );
    }
    if (text.length === 0) fail(`Book ${book}: empty chapter ${chapId}`);
    rows.push([[String(book), chapId], text]);
  }

  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    lowercaseMarkers,
    removedSectionNumbers,
    report: [
      `chapters: I..${toRoman(
        chapters.length
      )} in order; ${removedSectionNumbers} inline section numbers removed`,
      checkNoTextLost(
        content.paragraphs,
        rows,
        chapters.length + removedSectionNumbers
      ),
      ...lowercaseMarkers.map(
        (m) => `review: chapter marker before lowercase ${m}`
      ),
    ],
  };
}

/** Justin's preface: a `PRAEFATIO` heading and unnumbered paragraphs. */
export function convertJustinPraefatio(html: string): PageConversion {
  const content = readPageContent(html);
  if (content.headings.length !== 1 || content.headings[0] !== "PRAEFATIO") {
    fail(
      `Expected a PRAEFATIO heading, found ${JSON.stringify(content.headings)}.`
    );
  }
  if (content.paragraphs.length === 0) fail("Empty praefatio.");
  const text = content.paragraphs.map(textOf).join(" ");
  const rows: [string[], string][] = [[["pr"], text]];
  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report: [
      `praefatio: ${content.paragraphs.length} paragraphs as one row`,
      checkNoTextLost(content.paragraphs, rows, 0),
    ],
  };
}

const PROLOGUE_HEADING = /^PROLOGVS LIBRI ([IVXLC]+)\.?$/;

/** The Prologi: `PROLOGVS LIBRI N.` paragraphs, each followed by its text. */
export function convertTrogusPrologi(html: string): PageConversion {
  const content = readPageContent(html);
  const rows: [string[], string][] = [];
  let current: number | undefined = undefined;
  let parts: string[] = [];
  let headingTokens = 0;
  const flush = () => {
    if (current === undefined) return;
    if (parts.length === 0) fail(`Prologue ${current} has no text.`);
    rows.push([[String(current)], parts.join(" ")]);
    parts = [];
  };
  for (const p of content.paragraphs) {
    const text = textOf(p);
    const heading = PROLOGUE_HEADING.exec(text);
    if (heading !== null) {
      const n = parseRoman(heading[1]);
      const expected: number = (current ?? 0) + 1;
      if (n !== expected) {
        fail(
          `Prologue heading '${text}' found where ${toRoman(
            expected
          )} was expected.`
        );
      }
      flush();
      current = n;
      headingTokens += 3; // PROLOGVS LIBRI <N>
      continue;
    }
    if (current === undefined)
      fail(`Text before the first prologue: '${text.slice(0, 60)}'`);
    parts.push(text);
  }
  flush();
  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report: [
      `prologues: I..${toRoman(current ?? 0)} in order`,
      checkNoTextLost(content.paragraphs, rows, headingTokens),
    ],
  };
}
