import type { RowText } from "@/common/library/process_thelatinlibrary";
import { textOf, wordTokens } from "@/scripts/thelatinlibrary/converters/html";
import {
  checkNoTextLost,
  fail,
  readPageContent,
  type PageConversion,
} from "@/scripts/thelatinlibrary/converters/page";

/**
 * Converter for one book of Justinian's Digest:
 *
 *   <div align="center">LIBER PRIMUS</div>
 *   <p>Dig. 1.1.0. De iustitia et iure. <br> Dig. 1.2.0. ...</p>   (contents)
 *   <p><b>Dig. 1.1.0. De iustitia et iure.</b></p>                 -> 1.1 (heading)
 *   <p>Dig. 1.1.1pr.</p> <p>Ulpianus 1 inst.</p> <p>Iuri ...</p>    -> 1.1.1.pr
 *   <p>Dig. 1.1.2</p> <p>Pomponius l.S. enchir.</p> <p>...</p>      -> 1.1.2
 *
 * Every fragment carries its full citation, so nothing is inferred. Each is a
 * citation, an inscription (jurist, work, book) and one or more paragraphs of
 * text. Titles must run 1, 2, 3, ... and match the book's table of contents;
 * within a title, laws and paragraphs must increase (pr, 1, 2, ..., with
 * lettered paragraphs like 6a after 6). Every fragment of a law repeats the
 * law's inscription; it is kept once, on the first, and the repeats must match.
 *
 * Books 30-32 (De legatis I-III) have no titles on the site ("Dig. 30.0."),
 * as in the standard citation (D. 30.79.1); their title id is `0`.
 */

const TOC_ENTRY =
  /Dig\.\s*(\d+)\.(?:(\d+)\.)?0\.(?!R\b)\s*(.*?)(?=\s*Dig\.\s*\d+\.|$)/g;

interface Heading {
  title: string;
  name: string;
  removed: string;
  /** Given as `Dig. b.t.0.R rubrica: ...` rather than a bold heading. */
  rubrica: boolean;
}

function parseHeading(text: string, book: number): Heading | undefined {
  const b = String(book);
  let m = new RegExp(
    `^Dig\\.\\s*${b}\\.(\\d+)\\.0\\.R\\s+rubrica:\\s*(.+)$`
  ).exec(text);
  if (m !== null) {
    return {
      title: m[1],
      name: m[2],
      removed: text.slice(0, text.indexOf(m[2])),
      rubrica: true,
    };
  }
  m = new RegExp(`^Dig\\.\\s*${b}\\.(?:(\\d+)\\.)?0\\.\\s+(.+)$`).exec(text);
  if (m !== null) {
    return {
      title: m[1] ?? "0",
      name: m[2],
      removed: text.slice(0, text.indexOf(m[2])),
      rubrica: false,
    };
  }
  return undefined;
}

interface Citation {
  title: string;
  law: number;
  paragraph: string | undefined;
}

function parseCitation(
  text: string,
  book: number,
  titled: boolean
): Citation | undefined {
  const b = String(book);
  const re = titled
    ? new RegExp(`^Dig\\.\\s*${b}\\.(\\d+)\\.(\\d+)(pr|\\.\\d+[a-z]?)?\\.?$`)
    : new RegExp(`^Dig\\.\\s*${b}\\.(\\d+)(pr|\\.\\d+[a-z]?)?\\.?$`);
  const m = re.exec(text);
  if (m === null) return undefined;
  const [law, para] = titled ? [m[2], m[3]] : [m[1], m[2]];
  return {
    title: titled ? m[1] : "0",
    law: Number(law),
    paragraph: para === undefined ? undefined : para.replace(/^\./, ""),
  };
}

/** Sort key for a paragraph: pr < 1 < 2 < 2a < 2b < 3 ... */
function paragraphKey(p: string | undefined): number {
  if (p === undefined) return -2;
  if (p === "pr") return -1;
  const m = /^(\d+)([a-z]?)$/.exec(p)!;
  return Number(m[1]) * 100 + (m[2] === "" ? 0 : m[2].charCodeAt(0) - 96);
}

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s.]+/g, " ")
    .trim();

export function convertDigestBook(html: string, book: number): PageConversion {
  const content = readPageContent(html);
  if (!/DIGESTORUM/.test(content.pageTitle)) {
    fail(`Not a Digest page: '${content.pageTitle}'`);
  }
  if (content.headings.length !== 1 || !/^LIBER /.test(content.headings[0])) {
    fail(
      `Expected one 'LIBER ...' heading, found ${JSON.stringify(
        content.headings
      )}.`
    );
  }
  const paragraphs = content.paragraphs.map(textOf);
  const removed: string[] = [];

  // The table of contents: leading paragraphs made only of "Dig. b.t.0. Name"
  // entries, used to cross-check the headings. A one-title book's contents
  // are a single entry, repeated as its heading.
  const toc = new Map<string, string>();
  let i = 0;
  for (; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const entries = [...p.matchAll(TOC_ENTRY)];
    const onlyEntries =
      entries.length > 0 && p.replace(TOC_ENTRY, "").trim().length === 0;
    if (!onlyEntries || entries.some(([, bk]) => Number(bk) !== book)) break;
    // Once the contents have begun, a single entry is the first heading.
    if (entries.length === 1 && toc.size > 0) break;
    for (const [, , t, name] of entries) toc.set(t ?? "0", name);
    removed.push(p);
  }
  if (toc.size === 0) fail(`Book ${book}: no table of contents.`);
  const titled = !toc.has("0");

  // Some pages repeat the whole book a second time (16, 18, 43). Drop the
  // second copy only if it is exactly identical to the first.
  let end = paragraphs.length;
  const bodyLength = paragraphs.length - i;
  let repeated = false;
  if (bodyLength % 2 === 0 && bodyLength > 0) {
    const half = bodyLength / 2;
    const first = paragraphs.slice(i, i + half);
    const second = paragraphs.slice(i + half);
    if (first.every((p, k) => p === second[k])) {
      end = i + half;
      removed.push(...second);
      repeated = true;
    }
  }

  const rows: [string[], RowText, "heading"?][] = [];
  const b = String(book);
  let currentTitle: string | undefined = undefined;
  let expectedTitle = titled ? 1 : 0;
  let last: [number, number] | undefined = undefined; // [law, paragraphKey]
  // The inscription of the current lex: each of its fragments repeats it.
  let lexInscription: string | undefined = undefined;
  const lawGaps: string[] = [];
  const paragraphGaps: string[] = [];
  const inscriptionsOdd: string[] = [];
  const notInContents: string[] = [];
  const emptyFragments: string[] = [];
  const headingFromContents: string[] = [];
  let reusedTokens = 0;
  let fragments = 0;

  while (i < end) {
    const p = paragraphs[i];
    const heading = parseHeading(p, book);
    if (heading !== undefined) {
      if (heading.title !== String(expectedTitle)) {
        fail(
          `Book ${book}: title ${heading.title} found where ${expectedTitle} was expected.`
        );
      }
      const listed = toc.get(heading.title);
      if (listed === undefined) {
        // A few books' contents leave out a title (often the first).
        notInContents.push(
          `${b}.${heading.title}${heading.rubrica ? " (rubrica line)" : ""}`
        );
      } else if (
        listed === undefined ||
        normalizeName(listed) !== normalizeName(heading.name)
      ) {
        fail(
          `Book ${book}.${heading.title}: heading '${heading.name}' differs from contents '${listed}'.`
        );
      }
      rows.push([
        [b, heading.title],
        heading.name.replace(/\s*\.$/, "") + ".",
        "heading",
      ]);
      removed.push(heading.removed);
      currentTitle = heading.title;
      expectedTitle += 1;
      last = undefined;
      i += 1;
      continue;
    }
    const cit = parseCitation(p, book, titled);
    if (cit === undefined) {
      fail(
        `Book ${book}: expected a citation or heading, found '${p.slice(
          0,
          70
        )}'`
      );
    }
    if (cit.title !== currentTitle) {
      // A title whose heading the page leaves out: take its name from the
      // contents, if it is exactly the next title.
      const listed = toc.get(cit.title);
      if (cit.title !== String(expectedTitle) || listed === undefined) {
        fail(
          `Book ${book}: citation '${p}' outside its title (current ${currentTitle}).`
        );
      }
      rows.push([
        [b, cit.title],
        listed.replace(/\s*\.$/, "") + ".",
        "heading",
      ]);
      headingFromContents.push(`${b}.${cit.title}`);
      // These words are already counted once, in the contents.
      reusedTokens += wordTokens(listed).length;
      currentTitle = cit.title;
      expectedTitle += 1;
      last = undefined;
    }
    const key = paragraphKey(cit.paragraph);
    if (last !== undefined) {
      const [lastLaw, lastKey]: [number, number] = last;
      if (cit.law < lastLaw || (cit.law === lastLaw && key <= lastKey)) {
        fail(`Book ${book}: citation '${p}' is out of order.`);
      }
      if (cit.law > lastLaw + 1)
        lawGaps.push(`${b}.${cit.title}.${lastLaw}→${cit.law}`);
      if (
        cit.law === lastLaw &&
        key % 100 === 0 &&
        lastKey >= 0 &&
        key - (lastKey - (lastKey % 100)) > 100
      ) {
        paragraphGaps.push(`${b}.${cit.title}.${cit.law}.${cit.paragraph}`);
      }
    } else if (cit.law !== 1) {
      lawGaps.push(`${b}.${cit.title}.start→${cit.law}`);
    }
    const isFirstInLex = last === undefined || last[0] !== cit.law;
    last = [cit.law, key];
    removed.push(p);

    // The inscription, then text paragraphs up to the next citation/heading.
    const inscription = i + 1 < end ? paragraphs[i + 1] : undefined;
    if (
      inscription === undefined ||
      parseCitation(inscription, book, titled) !== undefined ||
      parseHeading(inscription, book) !== undefined
    ) {
      fail(`Book ${book}: '${p}' has no inscription.`);
    }
    if (!/^\p{Lu}\p{Ll}+/u.test(inscription))
      inscriptionsOdd.push(`${p} '${inscription}'`);
    if (isFirstInLex) {
      lexInscription = inscription;
    } else if (inscription !== lexInscription) {
      // Later fragments drop their inscription as a repeat of the first, so
      // anything else in that slot would be text lost without a trace.
      fail(
        `Book ${book}: '${p}' has inscription '${inscription}', but its lex began with '${lexInscription}'.`
      );
    }
    let j = i + 2;
    const texts: string[] = [];
    while (
      j < end &&
      parseCitation(paragraphs[j], book, titled) === undefined &&
      parseHeading(paragraphs[j], book) === undefined
    ) {
      texts.push(paragraphs[j]);
      j += 1;
    }
    const id = [b, cit.title, String(cit.law)];
    if (cit.paragraph !== undefined) id.push(cit.paragraph);
    if (texts.length === 0) {
      // The site leaves some fragments empty (the Greek ones, it seems: the
      // site has no Greek at all). Keep the citation; flag it.
      emptyFragments.push(id.join("."));
      rows.push([id, [{ editorial: inscription, style: "smallcaps" }]]);
    } else if (isFirstInLex) {
      rows.push([
        id,
        [{ editorial: inscription, style: "smallcaps" }, texts.join(" ")],
      ]);
    } else {
      removed.push(inscription);
      rows.push([id, texts.join(" ")]);
    }
    fragments += 1;
    i = j;
  }

  if (titled && expectedTitle - 1 !== toc.size + notInContents.length) {
    fail(
      `Book ${book}: contents list ${toc.size} titles, found ${
        expectedTitle - 1
      }.`
    );
  }
  const removedTokens =
    removed.reduce((n, r) => n + wordTokens(r).length, 0) - reusedTokens;
  const report = [
    `titles: ${
      titled ? `1..${expectedTitle - 1}` : "none (title id 0)"
    } match the contents; ${fragments} fragments in order`,
    checkNoTextLost(content.paragraphs, rows, removedTokens),
  ];
  if (headingFromContents.length > 0) {
    report.push(
      `review: no heading on the page for ${headingFromContents.join(
        ", "
      )}; taken from the contents`
    );
  }
  if (emptyFragments.length > 0) {
    report.push(`review: no text on the site for ${emptyFragments.join(", ")}`);
  }
  if (repeated) {
    report.push(
      `review: the page repeats the whole book; the identical second copy was dropped`
    );
  }
  if (notInContents.length > 0) {
    report.push(
      `review: title ${notInContents.join(
        ", "
      )} missing from the book's contents`
    );
  }
  if (lawGaps.length > 0)
    report.push(`review: law numbering jumps at ${lawGaps.join(", ")}`);
  if (paragraphGaps.length > 0)
    report.push(
      `review: paragraph numbering jumps at ${paragraphGaps.join(", ")}`
    );
  if (inscriptionsOdd.length > 0)
    report.push(`review: unusual inscriptions ${inscriptionsOdd.join("; ")}`);
  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report,
  };
}
