/**
 * @jest-environment jsdom
 */
import { extractRowText } from "@/common/library/corpus/corpus_library_utils";
import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import { preprocessWorkToV2 } from "@/common/library/v2/v2_preprocessor";
import { processTokens } from "@/common/text_cleaning";
import { XmlNode } from "@/common/xml/xml_node";
import { isLatinWord, tokenizeSubtree } from "@/web/v2/core/tokenize.client";

type ContentNode = XmlNode<ProcessedWorkContentNodeType>;

function el(
  name: ProcessedWorkContentNodeType,
  attrs: [string, string][],
  ...children: (ContentNode | string)[]
): ContentNode {
  return new XmlNode<ProcessedWorkContentNodeType>(name, attrs, children);
}

function span(
  attrs: [string, string][],
  ...children: (ContentNode | string)[]
): ContentNode {
  return el("span", attrs, ...children);
}

const ITALIC: [string, string][] = [
  ["rend", "italic"],
  ["rendParent", "hi"],
];
const LINE: [string, string][] = [["l", "1"]];

function words(text: string): string[] {
  return Array.from(processTokens(text))
    .filter(([, isWord]) => isWord)
    .map(([token]) => token);
}

describe("extractRowText", () => {
  it("keeps a word whole across a bare inline wrapper", () => {
    const row = span([], "licentiore epist", span([], "u"), "la narrare");
    expect(extractRowText(row)).toBe("licentiore epistula narrare");
  });

  it("keeps a word whole across styled inline markup", () => {
    const row = span([], "ut ", span(ITALIC, "i"), "am e", span(ITALIC, "st"));
    expect(words(extractRowText(row))).toEqual(["ut", "iam", "est"]);
  });

  it("joins an enclitic to marked-up text", () => {
    const row = span([], "per ", span(ITALIC, "vallem"), "que Duriae");
    expect(words(extractRowText(row))).toEqual(["per", "vallemque", "Duriae"]);
  });

  it("breaks words between adjacent sibling elements", () => {
    const row = span(
      [],
      "compertum ",
      span(ITALIC, "se"),
      span(ITALIC, "habere"),
      " dilectum ",
      span(ITALIC, "et"),
      span([["origName", "corr"]], "legionibus")
    );
    expect(words(extractRowText(row))).toEqual([
      "compertum",
      "se",
      "habere",
      "dilectum",
      "et",
      "legionibus",
    ]);
  });

  it("joins a word hyphenated across adjacent sibling elements", () => {
    const row = span(
      [],
      "Europae ",
      span(ITALIC, "lon-"),
      span(ITALIC, "gitudo"),
      " est"
    );
    expect(words(extractRowText(row))).toEqual([
      "Europae",
      "lon-gitudo",
      "est",
    ]);
  });

  it("keeps source whitespace between ordinary words", () => {
    const row = span(
      [],
      "Gallia est ",
      span(ITALIC, "omnis"),
      " divisa in ",
      span([["origName", "corr"]], "partes"),
      " tres."
    );
    expect(extractRowText(row)).toBe("Gallia est omnis divisa in partes tres.");
  });

  it("does not add spaces before punctuation after inline markup", () => {
    const row = span([], span([["origName", "abbr"]], "Q"), ". Caecilius");
    expect(extractRowText(row)).toBe("Q. Caecilius");
  });

  it("breaks words at verse lines", () => {
    const row = span(
      [],
      span(LINE, "arma virumque"),
      span(LINE, "cano Troiae")
    );
    expect(extractRowText(row)).toBe("arma virumque\ncano Troiae");
  });

  it("breaks words at blocks, blockquotes, and headings", () => {
    const row = span(
      [],
      el("head", [], "Caput"),
      span([["block", "1"]], "unum"),
      span([["rend", "blockquote"]], "duo"),
      "tria"
    );
    expect(extractRowText(row)).toBe("Caput\nunum\nduo\ntria");
  });

  it("indents indented lines", () => {
    const row = span(
      [],
      span(LINE, "Hexameter"),
      span([...LINE, ["rend", "indent"]], " pentameter ")
    );
    expect(extractRowText(row)).toBe("Hexameter\n    pentameter");
  });

  it("breaks words at markers that contribute no text", () => {
    const row = span(
      [],
      "alpha",
      el("note", [["noteId", "0"]]),
      "beta",
      el("gap", []),
      "gamma",
      el("br", []),
      "delta"
    );
    expect(words(extractRowText(row))).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
  });

  it("collapses whitespace runs and trims the row", () => {
    const row = span([], "\n  una  ", span([], "  duae \n"), "  tres  ");
    expect(extractRowText(row)).toBe("una duae tres");
  });

  it("upper-cases small caps", () => {
    const row = span([], "senatus ", span([["rend", "smallcaps"]], "populus"));
    expect(extractRowText(row)).toBe("senatus POPULUS");
  });
});

const METADATA: LibraryWorkMetadata = {
  author: "Pliny",
  name: "Naturalis Historia",
  id: "pliny.nh",
  urlAuthor: "pliny",
  urlName: "nh",
  attribution: "perseus",
};

function makeWork(rows: ContentNode[]): ProcessedWork2 {
  return {
    info: {
      title: "Naturalis Historia",
      author: "Pliny",
      workId: "pliny.nh",
      attribution: "perseus",
    },
    textParts: ["book", "chapter"],
    rows: rows.map((row, i) => [["1", `${i + 1}`], row]),
    pages: [{ id: ["1"], rows: [0, rows.length] }],
    navTree: { id: [], children: [] },
    notes: [new XmlNode("note", [], ["A note on the text."])],
  };
}

/** The `[wordIndex, word]` pairs the V2 reader links in each rendered row. */
function readerWords(work: ProcessedWork2): [number, string][][] {
  const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return Array.from(root.querySelectorAll<HTMLElement>(".reader-passage")).map(
    (passage) => {
      const linked: [number, string][] = [];
      tokenizeSubtree(passage, {
        renderWord: (token, _cleanWord, wordIndex) => {
          linked.push([wordIndex, token]);
          const out = document.createElement("span");
          out.textContent = token;
          return out;
        },
      });
      return linked;
    }
  );
}

/** The `[wordIndex, word]` pairs the corpus indexes for a row, Latin words only. */
function corpusWords(row: ContentNode): [number, string][] {
  return words(extractRowText(row))
    .map((word, i): [number, string] => [i, word])
    .filter(([, word]) => isLatinWord(word, true).isLatin);
}

describe("corpus row text matches V2 reader tokens", () => {
  it("agrees on word offsets across inline markup and markers", () => {
    const rows = [
      span(
        [],
        "Libros Naturalis Historiae, novicium Camenis Quiritium tuorum opus, ",
        "natos apud me proxima fetura licentiore epist",
        span([], "u"),
        "la narrare constitui tibi."
      ),
      span(
        [],
        "Gallia est ",
        span([["origName", "corr"]], "omnis"),
        " divisa",
        el("note", [["noteId", "0"]]),
        " in partes ",
        el("gap", []),
        " tres, ",
        span(ITALIC, "quarum"),
        " unam incolunt Belgae."
      ),
      span(
        [],
        span(LINE, "arma virumque cano,"),
        span([...LINE, ["rend", "indent"]], "Troiae qui primus ab oris"),
        span([["rend", "blockquote"]], "Italiam fato profugus"),
        "Laviniaque venit"
      ),
    ];
    const work = makeWork(rows);

    expect(readerWords(work)).toEqual(rows.map(corpusWords));
  });

  it("finds the whole word that inline markup falls inside", () => {
    const row = span([], "licentiore epist", span([], "u"), "la narrare");
    const [linked] = readerWords(makeWork([row]));

    expect(linked).toContainEqual([1, "epistula"]);
    expect(corpusWords(row)).toContainEqual([1, "epistula"]);
  });
});
