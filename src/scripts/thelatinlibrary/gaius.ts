import type {
  EditorialSegment,
  RowText,
} from "@/common/library/process_thelatinlibrary";
import {
  getAttr,
  isElement,
  textOf,
  type HtmlElement,
} from "@/scripts/thelatinlibrary/html";
import {
  checkNoTextLost,
  fail,
  readPageContent,
  type PageConversion,
} from "@/scripts/thelatinlibrary/page";

/**
 * Converter for one commentary of Gaius' Institutiones:
 *
 *   <p class=pagehead>GAI INSTITVTIONVM COMMENTARIVS PRIMVS</p>
 *   <p class=margin><a href="#1">1</a> <a href="#2">2</a> ...</p>
 *   <p>[I. De iure civili et naturali.] <a name="1">1.</a> Omnes ...
 *      <a name="2">2.</a> Constant ...</p>
 *
 * The section number printed in the text is the marker (`12.`, or `141`
 * without the period); the `<a name>` anchors and the link list are only
 * cross-checks, since the site's are incomplete (2.31 has no anchor) and its
 * link lists have typos (`#10` for 20). Markers must run 1, 2, 3, ... and a
 * number is only taken as a marker when it is exactly the next section.
 *
 * Editorial matter (`kind="editorial"`: shown, but not indexed):
 * - rubrics, the modern editor's headings, with or without a numeral
 *   (`[II. De iuris divisione.]`, `[De testamentis militum.]`), when they
 *   sit just before a section number; they move to the start of that section;
 * - lacuna notes for the illegible palimpsest (`[. . . vv. 5 . . .]`,
 *   `[. . . fol. deperd. . . .]`, `[. . . legi nequeunt . . .]`).
 * The editor's brackets inside a sentence (`[de ea re]`) stay as text, as on
 * every other Latin Library page.
 */

/** Title ordinals per commentary, compared after U -> V (TERTVS is the site's typo). */
const ORDINALS = [["PRIMVS"], ["SECVNDVS"], ["TERTIVS", "TERTVS"], ["QVARTVS"]];

/** A section number followed by text: `12. Text`, `141 Text`. */
const SECTION_CANDIDATE = /(?<![\p{L}\p{N}./])(\d{1,3})\.?(?=\s+\S)/gu;
/** The longest run of unnumbered sections accepted between two anchors. */
const MAX_SKIP = 2;
/** A rubric at the end of a section's text: `[II. De iuris divisione.]`. */
const TRAILING_RUBRIC = /\[\s*(?:[IVXLC]+\.\s+)?\p{Lu}[^[\]]*?\.\s*\]$/u;
/** A note on a lacuna: only dots, or a count of lost lines or leaves. */
const LACUNA_NOTE =
  /\[(?:[\s.*]+|[^[\]]*(?:\bvv?\.|\bfol\.|\bversus\b|legi nequ)[^[\]]*)\]/g;

function anchorNames(paragraphs: HtmlElement[]): string[] {
  const names: string[] = [];
  const walk = (el: HtmlElement) => {
    for (const child of el.childNodes) {
      if (!isElement(child)) continue;
      const name = child.tagName === "a" ? getAttr(child, "name") : undefined;
      if (name !== undefined) names.push(name);
      walk(child);
    }
  };
  paragraphs.forEach(walk);
  return names;
}

/** Splits text into plain text and editorial lacuna notes. */
function withLacunaNotes(text: string): (string | EditorialSegment)[] {
  const segments: (string | EditorialSegment)[] = [];
  let cursor = 0;
  for (const m of text.matchAll(LACUNA_NOTE)) {
    const before = text.slice(cursor, m.index).trim();
    if (before.length > 0) segments.push(before);
    segments.push({ editorial: m[0] });
    cursor = m.index + m[0].length;
  }
  const rest = text.slice(cursor).trim();
  if (rest.length > 0) segments.push(rest);
  return segments;
}

function asRowText(segments: (string | EditorialSegment)[]): RowText {
  return segments.length === 1 && typeof segments[0] === "string"
    ? segments[0]
    : segments;
}

function hasPlainText(segments: (string | EditorialSegment)[]): boolean {
  return segments.some((s) => typeof s === "string");
}

export function convertGaiusCommentary(
  html: string,
  commentary: number
): PageConversion {
  const content = readPageContent(html);
  const title = content.pageTitle.toUpperCase().replace(/U/g, "V");
  const ordinals = ORDINALS[commentary - 1] ?? [];
  if (!ordinals.some((o) => title.endsWith(`COMMENTARIVS ${o}`))) {
    fail(
      `Page title '${content.pageTitle}' does not name commentary ${commentary}.`
    );
  }
  if (content.headings.length > 0) {
    fail(`Unexpected heading(s): ${content.headings.join(", ")}`);
  }
  const stream = content.paragraphs.map(textOf).join(" ");

  // Find the section markers, in order. A short jump (a section the site
  // prints no number for, its text run into the previous one) is accepted
  // only when the page anchors the number jumped to.
  const anchors = anchorNames(content.paragraphs);
  const anchorSet = new Set(anchors);
  const starts: [index: number, end: number, n: number][] = [];
  const skipped: number[] = [];
  for (const m of stream.matchAll(SECTION_CANDIDATE)) {
    const n = Number(m[1]);
    const expected = (starts.at(-1)?.[2] ?? 0) + 1;
    const jump =
      n > expected && n <= expected + MAX_SKIP && anchorSet.has(m[1]);
    if (n !== expected && !jump) continue;
    for (let k = expected; k < n; k++) skipped.push(k);
    starts.push([m.index, m.index + m[0].length, n]);
  }
  if (starts.length === 0) fail(`Commentary ${commentary}: no sections.`);
  const last = starts[starts.length - 1][2];
  const found = new Set(starts.map(([, , n]) => String(n)));

  // Cross-check against the site's anchors: every anchor must name a section
  // we found, so a section can't have been missed.
  const unknown = anchors.filter((a) => !found.has(a));
  if (unknown.length > 0) {
    fail(
      `Commentary ${commentary}: found sections 1-${last}, but the page anchors ${unknown
        .slice(0, 5)
        .join(", ")} too.`
    );
  }
  const unanchored = [...found].filter((n) => !anchorSet.has(n));
  const nav = content.nav ?? [];
  const navSet = new Set(nav);
  const navOnly = nav.filter((n) => !found.has(n));
  const navMissing = [...found].filter((n) => !navSet.has(n));

  // Split, moving a rubric that ends a section to the start of the next.
  const rows: [string[], RowText][] = [];
  const book = String(commentary);
  const lead = withLacunaNotes(stream.slice(0, starts[0][0]).trim());
  // Before section 1 only a rubric or a lacuna note may stand.
  let carry: EditorialSegment[] = [];
  for (const segment of lead) {
    if (typeof segment === "string") {
      if (
        !TRAILING_RUBRIC.test(segment) ||
        segment.match(/\[/g)?.length !== 1
      ) {
        fail(
          `Commentary ${commentary}: text before section 1: '${segment.slice(
            0,
            60
          )}'`
        );
      }
      carry.push({ editorial: segment });
    } else {
      carry.push(segment);
    }
  }
  let rubrics = 0;
  let lacunaNotes = 0;
  starts.forEach(([, end, n], i) => {
    const next = i + 1 < starts.length ? starts[i + 1][0] : stream.length;
    let body = stream.slice(end, next).trim();
    let trailing: EditorialSegment | undefined = undefined;
    const rubric = i + 1 < starts.length ? TRAILING_RUBRIC.exec(body) : null;
    if (rubric !== null) {
      trailing = { editorial: rubric[0] };
      body = body.slice(0, rubric.index).trim();
      rubrics += 1;
    }
    const segments = [...carry, ...withLacunaNotes(body)];
    lacunaNotes +=
      segments.filter((s) => typeof s !== "string").length - carry.length;
    if (!hasPlainText(segments)) {
      fail(`Commentary ${commentary}: section ${n} has no text`);
    }
    rows.push([[book, String(n)], asRowText(segments)]);
    carry = trailing === undefined ? [] : [trailing];
  });
  rubrics += lead.filter((s) => typeof s === "string").length;

  const report = [
    `sections: 1..${last} in order; editorial: ${rubrics} rubrics, ${lacunaNotes} lacuna notes`,
    `anchors: ${anchors.length} all match sections${
      unanchored.length > 0
        ? `; unanchored on the site: ${unanchored.join(", ")}`
        : ""
    }`,
  ];
  if (skipped.length > 0) {
    report.push(
      `review: no section number on the site for ${skipped
        .map((k) => `${commentary}.${k}`)
        .join(", ")} (its text stays in the section before)`
    );
  }
  if (navOnly.length > 0 || navMissing.length > 0) {
    report.push(
      `review: link list differs from the sections (extra: ${
        navOnly.join(", ") || "none"
      }; missing: ${navMissing.join(", ") || "none"})`
    );
  }
  report.push(checkNoTextLost(content.paragraphs, rows, starts.length));
  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report,
  };
}
