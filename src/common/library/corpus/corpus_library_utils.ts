import { checkPresent } from "@/common/assert";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import { ProcessedWork2 } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";

import fs from "fs";

export const LIB_CORPUS_INPUT_DIR = "build-tmp/library_corpus_input";

// This is a duplicate of Heroides, which we have the macronized edition of.
const SKIPS = new Set(["phi0959.phi002.perseus-lat2"]);

const AUTHOR_CODE_MAP = new Map<string, string>([
  ["Julius Caesar", "Caesar"],
  ["P. Ovidius Naso", "Ovid"],
  ["Cornelius Tacitus", "Tacitus"],
  ["C. Valerius Catullus", "Catullus"],
  ["M. Tullius Cicero", "Cicero"],
  ["Ammianus Marcellinus", "Ammianius"],
  ["Calpurnius Siculus", "Calpurnius"],
  ["Cornelius Nepos", "Nepos"],
  ["Minucius Felix", "Minucius"],
  ["C. Suetonius Tranquillus", "Suetonius"],
  ["L. Annaeus Seneca iunior", "Seneca Minor"],
  ["Titus Livius (Livy)", "Livy"],
  ["Pliny the Elder", "PlinyElder"],
  ["Curtius Rufus, Quintus", "Curtius"],
  ["Q. Horatius Flaccus", "Horace"],
  ["Seneca the Elder", "Seneca Major"],
  ["Seneca, Lucius Annaeus", "Seneca Minor"],
  ["L. Annaeus Seneca", "Seneca Minor"],
  ["Valerius Maximus", "ValeriusMaximus"],
  ["Florus, Lucius Annaeus", "Florus"],
  ["Pliny the Younger", "PlinyYounger"],
]);

function toAuthorCode(author: string): string {
  if (author.split(" ").length === 1) {
    return author;
  }
  return checkPresent(
    AUTHOR_CODE_MAP.get(author),
    "No code for author " + author
  );
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
    node.getAttr("block") !== undefined ||
    node.getAttr("l") !== undefined ||
    node.getAttr("sectionHead") !== undefined ||
    node.name === "head" ||
    node.name === "li" ||
    node.name === "ul"
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
  if (WORD_BREAK_TAGS.has(node.name)) {
    return " ";
  }
  const rend = node.getAttr("rend");

  let childContent = "";
  node.children.forEach((child, i) => {
    // Rule 2: two sibling tags with nothing between them are a word break,
    // unless the first ends a word hyphenated across a line (rule 3).
    const previous = node.children[i - 1];
    if (
      typeof child !== "string" &&
      previous instanceof XmlNode &&
      !childContent.endsWith("-")
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
 *
 * A review of every seam in the library where this rule changes the tokens
 * (9,661) found about 10 errors, all missing spaces in the source TEI. See
 * `src/web/ui/corpus/TODOS.md`, "Word-boundary rule".
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
