/**
 * @jest-environment jsdom
 */
import fs from "fs";
import path from "path";
import * as he from "he";

import { divideWork, processTei2 } from "@/common/library/process_work";
import {
  extractRowText,
  LIB_CORPUS_INPUT_DIR,
} from "@/common/library/corpus/corpus_library_utils";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import { LIBRARY_DB } from "@/common/library/preprocess/preprocessed_types";
import { preprocessWorkToV2 } from "@/common/library/preprocess/work_preprocessor";
import { ReadOnlyDb } from "@/common/sql_helper";
import { processTokens } from "@/common/text_cleaning";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  isLatinWord,
  tokenizeSubtree,
} from "@/web/ui/core/text/tokenize.client";

type ContentNode = XmlNode<ProcessedWorkContentNodeType>;

function el(
  name: ProcessedWorkContentNodeType,
  attrs: [string, string][] = [],
  ...children: (ContentNode | string)[]
): ContentNode {
  return new XmlNode<ProcessedWorkContentNodeType>(name, attrs, children);
}

function span(
  attrs: [string, string][] = [],
  ...children: (ContentNode | string)[]
): ContentNode {
  return el("span", attrs, ...children);
}

const ITALIC: [string, string][] = [
  ["rend", "italic"],
  ["rendParent", "hi"],
];
const BOLD: [string, string][] = [
  ["rend", "bold"],
  ["rendParent", "hi"],
];
const OVERLINE: [string, string][] = [
  ["rend", "overline"],
  ["rendParent", "hi"],
];
const SMALLCAPS: [string, string][] = [
  ["rend", "smallcaps"],
  ["rendParent", "hi"],
];
const LINE: [string, string][] = [["l", "1"]];

function extractPlainPassageText(passageHtml: string): string | null {
  let inner = passageHtml;
  if (
    inner.startsWith('<p class="reader-paragraph">') &&
    inner.endsWith("</p>")
  ) {
    inner = inner
      .slice('<p class="reader-paragraph">'.length, -"</p>".length)
      .trim();
  } else if (
    inner.startsWith('<span class="reader-line">') &&
    inner.endsWith("</span>")
  ) {
    inner = inner.slice('<span class="reader-line">'.length, -"</span>".length);
  } else if (
    inner.startsWith('<span class="reader-line indent">') &&
    inner.endsWith("</span>")
  ) {
    inner = inner.slice(
      '<span class="reader-line indent">'.length,
      -"</span>".length
    );
  } else {
    return null;
  }
  if (
    inner.startsWith('<span class="indent indent-para">') &&
    inner.endsWith("</span>")
  ) {
    inner = inner.slice(
      '<span class="indent indent-para">'.length,
      -"</span>".length
    );
  } else if (
    inner.startsWith('<span class="indent">') &&
    inner.endsWith("</span>")
  ) {
    inner = inner.slice('<span class="indent">'.length, -"</span>".length);
  }
  return inner.includes("<") ? null : inner;
}

const TEST_METADATA: LibraryWorkMetadata = {
  author: "Test Author",
  name: "Test Work",
  id: "test.work",
  urlAuthor: "test_author",
  urlName: "test_work",
  attribution: "perseus",
};

function makeWork(
  rows: ContentNode[],
  options?: { textParts?: string[]; notes?: XmlNode[] }
): ProcessedWork2 {
  const textParts = options?.textParts ?? ["book", "chapter"];
  return {
    info: {
      title: "Test Work",
      author: "Test Author",
      workId: "test.work",
      attribution: "perseus",
    },
    textParts,
    rows: rows.map((row, i) => [
      textParts.length === 1 ? [`${i + 1}`] : ["1", `${i + 1}`],
      row,
    ]),
    pages: [
      { id: textParts.length === 1 ? ["1"] : ["1"], rows: [0, rows.length] },
    ],
    navTree: { id: [], children: [] },
    notes: options?.notes ?? [
      new XmlNode("span", [], ["First apparatus note."]),
      new XmlNode("span", [], ["Second apparatus note."]),
    ],
  };
}

/**
 * Extracts `[wordIndex, word]` pairs as tokenized by the V2 reader on a
 * rendered `.reader-passage` element.
 */
function tokenizeReaderPassage(passage: HTMLElement): [number, string][] {
  const linked: [number, string][] = [];
  tokenizeSubtree(passage, {
    joinAcrossInline: true,
    renderWord: (token, _cleanWord, wordIndex, _root, part) => {
      if (part === undefined || part.index === 0) {
        linked.push([wordIndex, part?.word ?? token]);
      }
      const out = document.createElement("span");
      out.textContent = token;
      return out;
    },
  });
  return linked;
}

/**
 * Renders `work` via `preprocessWorkToV2` and returns the reader's tokenized
 * `[wordIndex, word]` sequence for each row on page 0.
 */
function readerWordsForWork(work: ProcessedWork2): [number, string][][] {
  const html = preprocessWorkToV2(work, TEST_METADATA).pages[0].singleHtml;
  const root = document.createElement("div");
  root.innerHTML = html;
  return Array.from(
    root.querySelectorAll<HTMLElement>(".reader-section > .reader-passage")
  ).map(tokenizeReaderPassage);
}

/**
 * Extracts `[wordIndex, word]` pairs as indexed by the corpus pipeline from
 * `extractRowText(row)`.
 */
function corpusWordsFromText(text: string): [number, string][] {
  return Array.from(processTokens(text))
    .filter(([, isWord]) => isWord)
    .map(([token], i): [number, string] => [i, token])
    .filter(([, word]) => isLatinWord(word, true).isLatin);
}

function corpusWordsForRow(row: ContentNode): [number, string][] {
  return corpusWordsFromText(extractRowText(row));
}

function assertRowParity(
  rows: ContentNode[],
  options?: { textParts?: string[]; notes?: XmlNode[] }
): [number, string][][] {
  const work = makeWork(rows, options);
  const actualReader = readerWordsForWork(work);
  const expectedCorpus = rows.map(corpusWordsForRow);
  expect(actualReader).toEqual(expectedCorpus);
  return actualReader;
}

const TEI_HEADER = `
<teiHeader xml:lang="eng">
  <fileDesc>
    <titleStmt>
      <title xml:lang="lat">Test Work</title>
      <author>Julius Caesar</author>
    </titleStmt>
    <sourceDesc><p>Test</p></sourceDesc>
  </fileDesc>
  <encodingDesc>
    <refsDecl>
      <refState unit="book" delim="."/>
      <refState unit="section"/>
    </refsDecl>
  </encodingDesc>
</teiHeader>`;

function parseTeiWork(
  sectionsXml: string[],
  leafUnit: "section" | "line" = "section"
): ProcessedWork2 {
  const header =
    leafUnit === "line"
      ? TEI_HEADER.replace('unit="section"', 'unit="line"')
      : TEI_HEADER;
  const body =
    leafUnit === "line"
      ? `<div type="textpart" subtype="book" n="1">${sectionsXml
          .map((s, i) => `<l n="${i + 1}">${s}</l>`)
          .join("\n")}</div>`
      : `<div type="textpart" subtype="book" n="1">${sectionsXml
          .map(
            (s, i) =>
              `<div type="textpart" subtype="section" n="${i + 1}">${s}</div>`
          )
          .join("\n")}</div>`;
  const xml = parseRawXml(
    `<TEI xmlns="http://www.tei-c.org/ns/1.0">${header}<text><body>${body}</body></text></TEI>`,
    { keepWhitespace: true }
  );
  return processTei2(xml, { workId: "test.work" });
}

describe("row_text_parity: extractRowText vs V2 reader tokenization", () => {
  describe("Rule 1: source whitespace decides where a tag meets text", () => {
    it("joins unstyled inline tags flush against surrounding text into one word", () => {
      const rows = [
        // `ping<add>endi</add>`
        span([], "rationem ping", span([], "endi"), " artis"),
        // `epist<add>u</add>la`
        span([], "licentiore epist", span([], "u"), "la narrare"),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "rationem"],
        [1, "pingendi"],
        [2, "artis"],
      ]);
      expect(result[1]).toEqual([
        [0, "licentiore"],
        [1, "epistula"],
        [2, "narrare"],
      ]);
    });

    it("joins styled inline spans (<hi>, <strong>, smallcaps, overline) flush with text", () => {
      const rows = [
        // `<hi>im</hi>petu`
        span([], span(ITALIC, "im"), "petu liberavissent"),
        // enclitic after italic: `<hi>vallem</hi>que`
        span([], "per ", span(ITALIC, "vallem"), "que Duriae"),
        // bold and italic within the same word
        span([], "ut ", span(ITALIC, "i"), "am e", span(BOLD, "st")),
        // partly overlined Roman numeral: `<hi rend="overline">DC</hi>VII`
        span([], "passus ", span(OVERLINE, "DC"), "VII et ora"),
        // smallcaps mid-word and whole-word (uppercased in source text, as in Perseus)
        span([], "senatus ", span(SMALLCAPS, "POPULUS"), "que Romanus"),
        // `<b>` (from `<label>`) flush with text
        span([], el("b", [], "C"), "aecilius Metellus"),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "impetu"],
        [1, "liberavissent"],
      ]);
      expect(result[1]).toEqual([
        [0, "per"],
        [1, "vallemque"],
        [2, "Duriae"],
      ]);
      expect(result[2]).toEqual([
        [0, "ut"],
        [1, "iam"],
        [2, "est"],
      ]);
      expect(result[3]).toEqual([
        [0, "passus"],
        [1, "DCVII"],
        [2, "et"],
        [3, "ora"],
      ]);
      expect(result[4]).toEqual([
        [0, "senatus"],
        [1, "POPULUSque"],
        [2, "Romanus"],
      ]);
      expect(result[5]).toEqual([
        [0, "Caecilius"],
        [1, "Metellus"],
      ]);
    });

    it("preserves word breaks when whitespace is inside or outside inline tags", () => {
      const rows = [
        span(
          [],
          "Gallia ",
          span(ITALIC, "est "),
          "omnis ",
          span(ITALIC, " divisa")
        ),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "Gallia"],
        [1, "est"],
        [2, "omnis"],
        [3, "divisa"],
      ]);
    });
  });

  describe("Rule 2: two adjacent sibling tags with nothing between them break words", () => {
    it("breaks words at unstyled sibling seams (e.g. `</choice><choice>`, `</add><add>`)", () => {
      const rows = [
        // Livy `</choice><choice>`
        span(
          [],
          "dixit ",
          span([["origName", "reg"]], "tum"),
          span([["origName", "corr"]], "Cocles"),
          " ait"
        ),
        // Pliny `ping<add>endi</add><add>fingendi</add>que`
        span(
          [],
          "rationem ping",
          span([], "endi"),
          span([], "fingendi"),
          "que artis"
        ),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "dixit"],
        [1, "tum"],
        [2, "Cocles"],
        [3, "ait"],
      ]);
      expect(result[1]).toEqual([
        [0, "rationem"],
        [1, "pingendi"],
        [2, "fingendique"],
        [3, "artis"],
      ]);
    });

    it("breaks words at styled sibling seams (`</hi><hi>`, `<hi>...</hi><corr>...</corr>`)", () => {
      const rows = [
        span(
          [],
          "compertum ",
          span(ITALIC, "se"),
          span(ITALIC, "habere"),
          " dilectum ",
          span(ITALIC, "et"),
          span([["origName", "corr"]], "legionibus")
        ),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "compertum"],
        [1, "se"],
        [2, "habere"],
        [3, "dilectum"],
        [4, "et"],
        [5, "legionibus"],
      ]);
    });

    it("agrees end-to-end from TEI `<choice>...</choice><choice>...</choice>`", () => {
      const work = parseTeiWork([
        "dixit <choice><reg>tum</reg><orig>tunc</orig></choice><choice><corr>Cocles</corr><sic>Coclez</sic></choice> ait.",
        "rationem ping<add>endi</add><add>fingendi</add>que artis.",
      ]);
      const actualReader = readerWordsForWork(work);
      const expectedCorpus = work.rows.map(([, row]) => corpusWordsForRow(row));
      expect(actualReader).toEqual(expectedCorpus);
      expect(actualReader[0]).toEqual([
        [0, "dixit"],
        [1, "tum"],
        [2, "Cocles"],
        [3, "ait"],
      ]);
      expect(actualReader[1]).toEqual([
        [0, "rationem"],
        [1, "pingendi"],
        [2, "fingendique"],
        [3, "artis"],
      ]);
    });
  });

  describe("Rule 3: adjacent sibling tags where the first ends in `-` join as one hyphenated word", () => {
    it("joins `<hi>lon-</hi><hi>gitudo</hi>` and unstyled `<span>lon-</span><span>gitudo</span>`", () => {
      const rows = [
        span(
          [],
          "Europae ",
          span(ITALIC, "lon-"),
          span(ITALIC, "gitudo"),
          " est"
        ),
        span([], "Europae ", span([], "lon-"), span([], "gitudo"), " est"),
        span([], "Europae ", span(ITALIC, "lon-"), span([], "gitudo"), " est"),
      ];
      const result = assertRowParity(rows);
      for (const rowTokens of result) {
        expect(rowTokens).toEqual([
          [0, "Europae"],
          [1, "lon-gitudo"],
          [2, "est"],
        ]);
      }
    });

    it('agrees end-to-end from TEI `<hi rend="italic">lon-</hi><hi rend="italic">gitudo</hi>`', () => {
      const work = parseTeiWork([
        'Europae <hi rend="italic">lon-</hi><hi rend="italic">gitudo</hi> est.',
      ]);
      const actualReader = readerWordsForWork(work);
      const expectedCorpus = work.rows.map(([, row]) => corpusWordsForRow(row));
      expect(actualReader).toEqual(expectedCorpus);
      expect(actualReader[0]).toEqual([
        [0, "Europae"],
        [1, "lon-gitudo"],
        [2, "est"],
      ]);
    });
  });

  describe("Rule 4: structural elements and markers always break words", () => {
    it("breaks words at <note>, <gap>, <space>, and <br> markers even without surrounding spaces", () => {
      const rows = [
        span(
          [],
          "alpha",
          el("note", [["noteId", "0"]]),
          "beta",
          el("gap"),
          "gamma",
          el("space"),
          "delta",
          el("br"),
          "epsilon"
        ),
        // Styled word split by a note marker: `<hi>i</hi>am<note/>que`
        span(
          [],
          "ut ",
          span(ITALIC, "i"),
          "am",
          el("note", [["noteId", "1"]]),
          "que e",
          span(BOLD, "st")
        ),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "alpha"],
        [1, "beta"],
        [2, "gamma"],
        [3, "delta"],
        [4, "epsilon"],
      ]);
      expect(result[1]).toEqual([
        [0, "ut"],
        [1, "iam"],
        [2, "que"],
        [3, "est"],
      ]);
    });

    it("breaks words at verse lines, blocks, blockquotes, indented elements, headings, and lists", () => {
      const rows = [
        // Verse lines inside a prose row
        span(
          [],
          span(LINE, "arma virumque"),
          span([...LINE, ["rend", "indent"]], "cano Troiae")
        ),
        // Heading, block, blockquote, indented paragraph
        span(
          [],
          el("head", [], "Caput"),
          span([["sectionHead", "1"]], "Titulus"),
          span([["block", "1"]], "unum"),
          span([["rend", "blockquote"]], "duo"),
          span(
            [
              ["rend", "indent"],
              ["rendParent", "p"],
            ],
            "tria"
          ),
          "quattuor"
        ),
        // List items
        span(
          [],
          el(
            "ul",
            [],
            el("li", [], el("b", [], "I"), span([], "primus")),
            el("li", [], span([], "secundus"))
          )
        ),
      ];
      const result = assertRowParity(rows);
      expect(result[0]).toEqual([
        [0, "arma"],
        [1, "virumque"],
        [2, "cano"],
        [3, "Troiae"],
      ]);
      expect(result[1]).toEqual([
        [0, "Caput"],
        [1, "Titulus"],
        [2, "unum"],
        [3, "duo"],
        [4, "tria"],
        [5, "quattuor"],
      ]);
      expect(result[2]).toEqual([
        [0, "I"],
        [1, "primus"],
        [2, "secundus"],
      ]);
    });

    it("agrees on verse works (where `isVerseWork` wraps rows in `.reader-line`)", () => {
      const work = parseTeiWork(
        [
          "Arma virumque cano, <note>Note 1</note>Troiae qui primus ab oris",
          '<hi rend="indent">Italiam fato profugus Laviniaque venit</hi>',
        ],
        "line"
      );
      const actualReader = readerWordsForWork(work);
      const expectedCorpus = work.rows.map(([, row]) => corpusWordsForRow(row));
      expect(actualReader).toEqual(expectedCorpus);
    });
  });

  const dbPath = path.resolve(process.cwd(), LIB_DEFAULT_DIR, LIBRARY_DB);
  const corpusDir = path.resolve(process.cwd(), LIB_CORPUS_INPUT_DIR);
  const runSweep =
    process.env.LIBRARY_PARITY_SWEEP === "1" &&
    fs.existsSync(dbPath) &&
    fs.existsSync(corpusDir);

  (runSweep ? describe : describe.skip)(
    "whole-library sweep (LIBRARY_PARITY_SWEEP=1)",
    () => {
      it("walks every row of every built work and checks corpus vs reader word parity", () => {
        const db = ReadOnlyDb.getDatabase(dbPath);
        const works = db
          .prepare("SELECT id FROM works ORDER BY sort_order ASC")
          .all() as { id: string }[];
        const selectPages = db.prepare(
          "SELECT page_index, single_html FROM pages WHERE work_id = ? ORDER BY page_index ASC"
        );

        let totalWorks = 0;
        let totalRows = 0;
        let mismatchedRows = 0;
        const mismatchesByWork = new Map<
          string,
          {
            count: number;
            examples: {
              rowIdx: number;
              rowId: string;
              firstDiffIdx: number;
              readerSlice: [number, string][];
              corpusSlice: [number, string][];
              corpusText: string;
              passageHtml: string;
            }[];
          }
        >();

        const passageEl = document.createElement("div");
        const PASSAGE_MARKER = '<div class="reader-passage">';
        const SECTION_END_SUFFIX = "</div></div>";

        let caseOnlyRows = 0;
        const caseOnlyByWork = new Map<string, number>();

        for (const { id: workId } of works) {
          const corpusFile = path.join(corpusDir, `${workId}.json`);
          if (!fs.existsSync(corpusFile)) {
            continue;
          }
          totalWorks++;
          const corpus: CorpusInputWork = JSON.parse(
            fs.readFileSync(corpusFile, "utf8")
          );
          const stubRows: ProcessedWork2["rows"] = corpus.rowIds.map((id) => [
            id,
            new XmlNode("span"),
          ]);
          const stubTextParts = Array.from(
            { length: corpus.sectionDepth },
            (_, idx) => `p${idx}`
          );
          const expectedPages = divideWork(stubRows, stubTextParts);
          const dbPages = selectPages.all(workId) as {
            page_index: number;
            single_html: string;
          }[];
          expect(dbPages.length).toBe(expectedPages.length);

          for (let p = 0; p < dbPages.length; p++) {
            const [startIdx, endIdx] = expectedPages[p].rows;
            const sectionLines = dbPages[p].single_html.split(
              /\n(?=<div class="reader-section)/
            );
            expect(sectionLines.length).toBe(endIdx - startIdx);

            for (let k = 0; k < sectionLines.length; k++) {
              const rowIdx = startIdx + k;
              totalRows++;
              const line = sectionLines[k];
              const markerIdx = line.indexOf(PASSAGE_MARKER);
              expect(markerIdx).toBeGreaterThanOrEqual(0);
              expect(line.endsWith(SECTION_END_SUFFIX)).toBe(true);
              const passageHtml = line.slice(
                markerIdx + PASSAGE_MARKER.length,
                line.length - SECTION_END_SUFFIX.length
              );

              let linked: [number, string][];
              const plainText = extractPlainPassageText(passageHtml);
              if (plainText !== null) {
                // Fast path: a single text node inside `<p class="reader-paragraph">`
                // or `<span class="reader-line">` with no inner markup produces one
                // text run in `tokenizeSubtree`, which feeds `processTokens` +
                // `isLatinWord` identically to `corpusWordsFromText`.
                linked = corpusWordsFromText(he.decode(plainText));
              } else {
                passageEl.innerHTML = passageHtml;
                delete passageEl.dataset.wordsEnhanced;
                linked = tokenizeReaderPassage(passageEl);
              }

              const expected = corpusWordsFromText(corpus.rows[rowIdx]);

              let firstBoundaryDiffIdx = -1;
              let hasCaseDiff = false;
              if (linked.length !== expected.length) {
                firstBoundaryDiffIdx = Math.min(linked.length, expected.length);
              }
              const limit = Math.min(linked.length, expected.length);
              for (let m = 0; m < limit; m++) {
                if (
                  linked[m][0] !== expected[m][0] ||
                  linked[m][1].toLowerCase() !== expected[m][1].toLowerCase()
                ) {
                  firstBoundaryDiffIdx = m;
                  break;
                }
                if (linked[m][1] !== expected[m][1]) {
                  hasCaseDiff = true;
                }
              }

              if (hasCaseDiff && firstBoundaryDiffIdx === -1) {
                caseOnlyRows++;
                caseOnlyByWork.set(
                  workId,
                  (caseOnlyByWork.get(workId) ?? 0) + 1
                );
              }

              if (firstBoundaryDiffIdx !== -1) {
                const firstDiffIdx = firstBoundaryDiffIdx;
                mismatchedRows++;
                let entry = mismatchesByWork.get(workId);
                if (!entry) {
                  entry = { count: 0, examples: [] };
                  mismatchesByWork.set(workId, entry);
                }
                entry.count++;
                if (entry.examples.length < 5) {
                  entry.examples.push({
                    rowIdx,
                    rowId: corpus.rowIds[rowIdx].join("."),
                    firstDiffIdx,
                    readerSlice: linked.slice(
                      Math.max(0, firstDiffIdx - 1),
                      firstDiffIdx + 3
                    ),
                    corpusSlice: expected.slice(
                      Math.max(0, firstDiffIdx - 1),
                      firstDiffIdx + 3
                    ),
                    corpusText: corpus.rows[rowIdx].slice(0, 200),
                    passageHtml: passageHtml.slice(0, 240),
                  });
                }
              }
            }
          }
        }

        if (mismatchedRows > 0) {
          const lines: string[] = [
            `Found ${mismatchedRows} mismatched row(s) across ${mismatchesByWork.size}/${totalWorks} works (${totalRows} rows checked):`,
          ];
          for (const [workId, info] of mismatchesByWork) {
            lines.push(`  ${workId}: ${info.count} row(s)`);
            for (const ex of info.examples) {
              lines.push(
                `    row ${ex.rowIdx} (${ex.rowId}) @ token #${ex.firstDiffIdx}:`
              );
              lines.push(`      reader: ${JSON.stringify(ex.readerSlice)}`);
              lines.push(`      corpus: ${JSON.stringify(ex.corpusSlice)}`);
              lines.push(`      text:   ${JSON.stringify(ex.corpusText)}`);
              lines.push(`      html:   ${JSON.stringify(ex.passageHtml)}`);
            }
          }
          throw new Error(lines.join("\n"));
        }

        expect(mismatchedRows).toBe(0);
      });
    }
  );
});
