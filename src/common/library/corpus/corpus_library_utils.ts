import { assert } from "@/common/assert";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import {
  authorCodeFromSlug,
  urlifyAuthor,
} from "@/common/library/library_slugs";
import { ProcessedWork2 } from "@/common/library/library_types";
import {
  BLOCK_CONTENT_KINDS,
  UNTOKENIZED_CONTENT_KINDS,
} from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";

import fs from "fs";

export const LIB_CORPUS_INPUT_DIR = "build-tmp/library_corpus_input";

// This is a duplicate of Heroides, which we have the macronized edition of.
const SKIPS = new Set(["phi0959.phi002.perseus-lat2"]);

/**
 * An author code must be a single token in the corpus query syntax (`#Code`):
 * no spaces, and none of the characters the grammar gives a meaning to
 * (`(`, `)`, `,`, `[`, `]`, `@`, `#`, `~`, `/`).
 */
const VALID_AUTHOR_CODE = /^[A-Za-z]+$/;

/**
 * The corpus `#Author` code for a work's author, derived from the reader URL
 * slug (`nepos` -> `Nepos`, `pliny_elder` -> `PlinyElder`) so the corpus and
 * the reader name authors the same way. Exported for testing.
 */
export function toAuthorCode(author: string): string {
  const code = authorCodeFromSlug(urlifyAuthor(author));
  assert(
    VALID_AUTHOR_CODE.test(code),
    `Author code "${code}" (for "${author}") can't be written as #${code} in a corpus query`
  );
  return code;
}

/**
 * Stands in for the four-space indent of `rend="indent"` while a row is being
 * assembled, so whitespace normalization can't collapse it. Replaced in
 * `extractRowText`.
 */
const INDENT_PLACEHOLDER = "\u0001";

/**
 * Elements that end the current word but contribute no indexed text. The V2
 * reader renders these as separate elements (a note link, a `[gap]` marker,
 * a line spacer), so text on either side of them is tokenized separately.
 */
const WORD_BREAK_TAGS = new Set(["note", "gap", "space"]);

function isStructural(node: XmlNode): boolean {
  const rend = node.getAttr("rend");
  return (
    rend === "indent" ||
    rend === "blockquote" ||
    (rend !== undefined && rend.split(" ").includes("center")) ||
    node.getAttr("block") !== undefined ||
    node.getAttr("l") !== undefined ||
    node.getAttr("sectionHead") !== undefined ||
    BLOCK_CONTENT_KINDS.has(node.getAttr("kind") ?? "") ||
    node.name === "head" ||
    node.name === "li" ||
    node.name === "ul"
  );
}

/**
 * Whether `node` is set as a superscript or subscript, exactly as
 * `needsWordBreak` (`work_preprocessor.ts`) decides it.
 */
function isRaisedOrLowered(node: XmlNode): boolean {
  const rend = node.getAttr("rend");
  return (
    node.name === "sub" ||
    node.name === "sup" ||
    (rend !== undefined &&
      (rend.includes("superscript") ||
        rend.includes("sup") ||
        rend.includes("super") ||
        rend.includes("subscript")))
  );
}

/**
 * Assembles the raw (un-normalized) text of `node`, applying the word-boundary
 * rule documented on `extractRowText`.
 */
function assembleRowText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node.replaceAll(/\s+/g, " ");
  }
  if (node.name === "br") {
    return "\n";
  }
  // Speaker labels, stage directions, cast lists and editorial matter are
  // apparatus rather than words of the text (rule 5): the reader does not
  // tokenize them either (`tokenize.client.ts`).
  const kind = node.getAttr("kind");
  if (
    WORD_BREAK_TAGS.has(node.name) ||
    kind === "tei-space" ||
    UNTOKENIZED_CONTENT_KINDS.has(kind ?? "")
  ) {
    return " ";
  }
  const rend = node.getAttr("rend");

  let childContent = "";
  node.children.forEach((child, i) => {
    // Rule 2: two sibling tags with nothing between them are a word break,
    // unless the first ends a word hyphenated across a line (rule 3), or the
    // second is a superscript or subscript, which the reader sets flush
    // (`needsWordBreak` in `work_preprocessor.ts`): a siglum like `R²`.
    const previous = node.children[i - 1];
    if (
      typeof child !== "string" &&
      previous instanceof XmlNode &&
      !childContent.endsWith("-") &&
      !isRaisedOrLowered(child)
    ) {
      childContent += " ";
    }
    childContent += assembleRowText(child);
  });
  if (rend === "uppercase" || rend === "smallcaps") {
    childContent = childContent.toUpperCase();
  }
  if (rend === "indent") {
    return `\n${INDENT_PLACEHOLDER}${childContent}\n`;
  }
  if (isStructural(node)) {
    return `\n${childContent}\n`;
  }
  return childContent;
}

/**
 * Extracts the text of a row for corpus ingestion. Word boundaries must agree
 * with the V2 reader's (`work_preprocessor.ts` + `tokenize.client.ts`), because
 * corpus word offsets become reader `matchText` highlight ranges.
 *
 * Word-boundary rule. Editorial tags (`<add>`, `<corr>`, `<hi>`, ...) wrap
 * whatever stretch of text they annotate: part of a word, a word, or several.
 * Their edges therefore say nothing about word boundaries by themselves:
 *
 * 1. Whitespace in the source text decides. Where a tag meets text with no
 *    whitespace between, it is the same word: `ping<add>endi</add>` and
 *    `<hi>im</hi>petu` are one word each.
 * 2. Two sibling tags that meet with nothing between them are a word break:
 *    `<add>endi</add><add>fingendi</add>` is two words. If the content were
 *    one continuous stretch, one tag would have covered it. In the source
 *    TEI the space falls between the tags (`</choice><choice>`, `</hi><hi>`).
 * 3. Exception to 2: if the first tag ends in `-`, it is a word hyphenated
 *    across a line break (`<hi>lon-</hi><hi>gitudo</hi>`), so join.
 * 4. Structure always breaks: lines, blocks, headings, `br`, and note, gap
 *    and space markers.
 * 5. Speaker labels (a play's `<speaker>`, a dialogue's speaker `<label>`),
 *    stage directions (a scene's roster of characters), cast lists and an
 *    editor's matter (a letter's dateline, sigla, an argumentum; kind
 *    `editorial`) are not text: they contribute no words, but break like a
 *    marker. See `UNTOKENIZED_CONTENT_KINDS`.
 *
 * A review of every seam where this rule changes the tokens, in the 125 works
 * of the library at the time (9,661 seams), found about 10 errors, all missing
 * spaces in the source TEI. See `src/web/ui/corpus/TODOS.md`, "Word-boundary
 * rule".
 */
export function extractRowText(node: XmlNode | string): string {
  return (
    assembleRowText(node)
      // Collapse space runs, and drop spaces at line edges.
      .replaceAll(/ {2,}/g, " ")
      .replaceAll(/ *\n */g, "\n")
      // Collapse adjacent newlines.
      .replaceAll(/\n{2,}/g, "\n")
      .replaceAll(
        new RegExp(`${INDENT_PLACEHOLDER} +`, "g"),
        INDENT_PLACEHOLDER
      )
      .replaceAll(INDENT_PLACEHOLDER, "    ")
      .trim()
  );
}

function convertToCorpusInputWork(work: ProcessedWork2): CorpusInputWork {
  return {
    id: work.info.workId,
    workName: work.info.title,
    shortTitle: work.info.shortTitle,
    author: work.info.author,
    authorCode: toAuthorCode(work.info.author),
    rows: work.rows.map(([_, root]) => extractRowText(root)),
    rowIds: work.rows.map(([id]) => id),
    sectionDepth: work.textParts.length,
  };
}

function readSortedCorpusWorks(inputDir: string): CorpusInputWork[] {
  const works: CorpusInputWork[] = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(".json") && !SKIPS.has(f.slice(0, -5)))
    .map((f) => JSON.parse(fs.readFileSync(`${inputDir}/${f}`, "utf8")));
  return works.sort(
    (a, b) =>
      a.authorCode.localeCompare(b.authorCode) ||
      (a.shortTitle ?? a.workName).localeCompare(b.shortTitle ?? b.workName)
  );
}

export function saveAsCorpusInputWork(
  work: ProcessedWork2,
  outputDir: string
): void {
  if (work.info.isTranslation || SKIPS.has(work.info.workId)) {
    return;
  }
  const corpusWork = convertToCorpusInputWork(work);
  const outPath = `${outputDir}/${corpusWork.id}.json`;
  fs.writeFileSync(outPath, JSON.stringify(corpusWork), "utf8");
}

export function* latinWorksFromLibrary(
  inputDir: string = LIB_CORPUS_INPUT_DIR
): Generator<CorpusInputWork> {
  const works = readSortedCorpusWorks(inputDir);
  for (const work of works) {
    yield work;
    if (process.env.SIMULATE_LARGE_CORPUS === "1") {
      for (let i = 0; i < 10; i++) {
        yield {
          ...work,
          id: `${work.id}-${i + 1}`,
        };
      }
    }
  }
}
