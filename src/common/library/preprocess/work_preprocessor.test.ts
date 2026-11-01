import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import { preprocessWorkToV2 } from "@/common/library/preprocess/work_preprocessor";
import { XmlNode } from "@/common/xml/xml_node";

type ContentNode = XmlNode<ProcessedWorkContentNodeType>;

function span(
  attrs: [string, string][],
  ...children: (ContentNode | string)[]
): ContentNode {
  return new XmlNode<ProcessedWorkContentNodeType>("span", attrs, children);
}

/** A positional note marker, as `process_work.ts` leaves behind. */
function noteMarker(noteId: string): ContentNode {
  return new XmlNode<ProcessedWorkContentNodeType>("note", [
    ["noteId", noteId],
  ]);
}

const METADATA: LibraryWorkMetadata = {
  author: "Ovid",
  name: "Amores",
  id: "ovid.amores",
  urlAuthor: "ovid",
  urlName: "amores",
  attribution: "perseus",
};

interface WorkOptions {
  textParts?: string[];
  rows: [string[], ContentNode][];
  pages?: { id: string[]; rows: [number, number] }[];
  notes?: XmlNode[];
  translator?: string;
  isTranslation?: boolean;
  workId?: string;
}

function makeWork(options: WorkOptions): ProcessedWork2 {
  const rows = options.rows;
  return {
    info: {
      title: "Amores",
      author: "Ovid",
      workId: options.workId ?? "ovid.amores",
      attribution: "perseus",
      translator: options.translator,
      isTranslation: options.isTranslation,
    },
    textParts: options.textParts ?? ["book", "poem", "line"],
    rows,
    pages: options.pages ?? [{ id: ["1", "1"], rows: [0, rows.length] }],
    navTree: { id: [], children: [] },
    notes: options.notes,
  };
}

describe("preprocessWorkToV2 renditions", () => {
  it("does not double-wrap an indented verse line", () => {
    const work = makeWork({
      rows: [
        [
          ["1", "1", "2"],
          span(
            [
              ["l", "1"],
              ["rend", "indent"],
              ["rendParent", "l"],
            ],
            "Edere, materia conveniente modis."
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="reader-line indent">');
    expect(html).not.toContain(
      '<span class="reader-line"><span class="reader-line indent">'
    );
  });

  it("indents only the first line of a paragraph rendition", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [
              ["rend", "indent"],
              ["rendParent", "p"],
            ],
            "Gallia est omnis divisa in partes tres."
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('class="indent indent-para"');
  });

  it("renders every token of a compound rendition", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [["block", "1"]],
            span([["rend", "overline smallcaps"]], "xviri"),
            " vendent"
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="smallcaps overline">xviri</span>');
  });

  it("carries the renditions V1 supported", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [["block", "1"]],
            span([["rend", "overline"]], "XX"),
            span([["rend", "7"]], "exercitum non tradiderit"),
            span([["rend", "uppercase"]], "Lygdamus hic situs est")
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('class="overline"');
    expect(html).toContain('class="smallcaps"');
    expect(html).toContain('class="uppercase"');
  });

  it("indents the continued parts of a split verse line", () => {
    const line = (part: string | undefined, text: string) =>
      span(
        [["l", "1"], ...(part === undefined ? [] : [["linePart", part]])] as [
          string,
          string
        ][],
        text
      );
    const work = makeWork({
      rows: [
        [["1", "1", "1"], line(undefined, "Quid ais?")],
        [["1", "1", "2"], line("F", "Nihil.")],
        [["1", "1", "3"], line("M", "Tace.")],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="reader-line">Quid ais?</span>');
    // In a verse work each part also steps further across the page.
    expect(html).toContain(
      '<span class="reader-line indent reader-step-1">Nihil.</span>'
    );
    expect(html).toContain(
      '<span class="reader-line indent reader-step-2">Tace.</span>'
    );
  });

  it("only indents a split verse line quoted in a prose work", () => {
    const work = makeWork({
      textParts: ["book", "section"],
      rows: [
        [
          ["1", "1"],
          span(
            [],
            "Ut ait poeta: ",
            span(
              [
                ["l", "1"],
                ["linePart", "F"],
              ],
              "Nihil."
            )
          ),
        ],
      ],
      pages: [{ id: ["1"], rows: [0, 1] }],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="reader-line indent">Nihil.</span>');
    expect(html).not.toContain("reader-step");
  });

  it("does not indent a split verse line twice", () => {
    const work = makeWork({
      rows: [
        [
          ["1", "1", "1"],
          span(
            [
              ["l", "1"],
              ["linePart", "F"],
              ["rend", "indent"],
              ["rendParent", "l"],
            ],
            "Nihil."
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain(
      '<span class="reader-line indent reader-step-1">Nihil.</span>'
    );
  });

  it("renders bold and superscript renditions in body text", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [["block", "1"]],
            span(
              [
                ["rend", "bold"],
                ["rendParent", "hi"],
              ],
              "Caput"
            ),
            " primum",
            span(
              [
                ["rend", "sup"],
                ["rendParent", "hi"],
              ],
              "a"
            )
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="bold">Caput</span> primum');
    expect(html).toContain('primum<span class="superscript">a</span>');
  });

  it("renders subscripts in notes with the native element", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1", "1"], span([], "Aqua", noteMarker("0"))]],
      notes: [
        new XmlNode(
          "span",
          [],
          ["H", new XmlNode("span", [["rend", "subscript"]], ["2"]), "O"]
        ),
      ],
    });

    const page = preprocessWorkToV2(work, METADATA).pages[0];

    expect(page.notesHtml).toContain("H<sub>2</sub>O");
  });

  it("keeps a blockquote rendition inline-safe inside a paragraph", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [],
            "ut ait ille: ",
            span(
              [["rend", "blockquote"]],
              span([["l", "1"]], "Complaisance gets us friends.")
            )
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    // A real <blockquote> here would be reparented out of the wrapping <p>.
    expect(html).toContain('<span class="blockquote">');
    expect(html).not.toContain("<blockquote");
  });

  it("marks <gap> placeholders with data-no-tokenize so they do not skew word indices", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [],
            "Gallia ",
            new XmlNode<ProcessedWorkContentNodeType>("gap"),
            " divisa"
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    expect(html).toContain(
      '<span class="reader-gap text-muted" data-no-tokenize="true">[gap]</span>'
    );
  });

  it("renders <b> elements with rendition classes, preserving smallcaps on speaker labels", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [],
            new XmlNode<ProcessedWorkContentNodeType>(
              "b",
              [["rend", "smallcaps"]],
              ["MYS."]
            ),
            " Hercle vero serio scriptum."
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    expect(html).toContain('<strong class="smallcaps">MYS.</strong>');
  });

  it("does not wrap rows containing a reader-block or leading whitespace in invalid nested paragraphs", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [
          ["1", "1", "1"],
          span(
            [],
            "praefatio: ",
            span([["block", "1"]], "Incipit liber primus.")
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    expect(html).not.toMatch(
      /<p class="reader-paragraph">[^<]*<p class="reader-block">/
    );
    expect(html).toContain('<p class="reader-block">Incipit liber primus.</p>');
  });
});

describe("preprocessWorkToV2 word boundaries between sibling tags", () => {
  const ITALIC: [string, string][] = [
    ["rend", "italic"],
    ["rendParent", "hi"],
  ];

  /** Renders one prose row and returns the passage's inner HTML. */
  function renderRow(row: ContentNode, notes?: XmlNode[]): string {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1", "1"], row]],
      notes,
    });
    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    const match = html.match(/<p class="reader-paragraph">(.*)<\/p>/s);
    return match?.[1] ?? html;
  }

  it("separates two adjacent unstyled wrappers", () => {
    // Livy 2.10.11: `<choice>…tum…</choice><choice>…Cocles…</choice>`.
    const row = span([], "dixit ", span([], "tum"), span([], "Cocles"), " ait");
    expect(renderRow(row)).toBe("dixit tum Cocles ait");
  });

  it("separates adjacent wrappers inside a word, keeping text seams joined", () => {
    // Pliny 1.praef: `ping<add>endi</add><add>fingendi</add>que`.
    const row = span(
      [],
      "ping",
      span([["origName", "add"]], "endi"),
      span([["origName", "add"]], "fingendi"),
      "que"
    );
    expect(renderRow(row)).toBe("pingendi fingendique");
  });

  it("separates two adjacent italic spans", () => {
    const row = span(
      [],
      "compertum ",
      span(ITALIC, "se"),
      span(ITALIC, "habere")
    );
    expect(renderRow(row)).toBe(
      'compertum <span class="italic">se</span> <span class="italic">habere</span>'
    );
  });

  it("joins a word hyphenated across adjacent spans", () => {
    const row = span([], span(ITALIC, "lon-"), span(ITALIC, "gitudo"));
    expect(renderRow(row)).toBe(
      '<span class="italic">lon-</span><span class="italic">gitudo</span>'
    );
  });

  it("does not separate a tag from adjacent text", () => {
    const row = span([], span(ITALIC, "im"), "petu");
    expect(renderRow(row)).toBe('<span class="italic">im</span>petu');
  });

  it("adds no space where the source already has whitespace", () => {
    const row = span([], span(ITALIC, "se "), span(ITALIC, "habere"));
    expect(renderRow(row)).toBe(
      '<span class="italic">se </span><span class="italic">habere</span>'
    );
  });

  it("adds no space next to an element without text", () => {
    const row = span([], span(ITALIC, "se"), span([], ""), span(ITALIC, " "));
    expect(renderRow(row)).not.toContain("</span> ");
  });

  it("adds no space around note markers, gaps, breaks, and spacers", () => {
    const row = span(
      [],
      span(ITALIC, "word"),
      noteMarker("0"),
      span(ITALIC, "gap"),
      new XmlNode<ProcessedWorkContentNodeType>("gap"),
      span(ITALIC, "br"),
      new XmlNode<ProcessedWorkContentNodeType>("br"),
      span(ITALIC, "space"),
      new XmlNode<ProcessedWorkContentNodeType>("space"),
      span(ITALIC, "end")
    );
    const html = renderRow(row, [new XmlNode("span", [], ["A note."])]);
    expect(html).not.toMatch(/> </);
    expect(html).toContain('word</span><a class="reader-note-ref"');
  });

  it("adds no space between line or block elements", () => {
    const row = span(
      [],
      span([["block", "1"]], "unum"),
      span([["block", "1"]], "duo")
    );
    expect(renderRow(row)).toContain(
      '<p class="reader-block">unum</p><p class="reader-block">duo</p>'
    );
  });

  it("adds no space before superscript or subscript elements (preserving sigla like J²)", () => {
    const row = span(
      [],
      span([["rend", "italic"]], "J"),
      span([["rend", "superscript"]], "2"),
      " et ",
      span([["rend", "italic"]], "P"),
      span([["rend", "sup"]], "a"),
      " et ",
      span([["rend", "italic"]], "M"),
      span([["rend", "subscript"]], "2")
    );
    expect(renderRow(row)).toBe(
      '<span class="italic">J</span><span class="superscript">2</span> et <span class="italic">P</span><span class="superscript">a</span> et <span class="italic">M</span><sub>2</sub>'
    );
  });
});

describe("preprocessWorkToV2 critical apparatus", () => {
  const notes = [
    new XmlNode("span", [], ["Note zero body."]),
    new XmlNode("span", [], ["Note one body."]),
    new XmlNode("span", [], ["Note two body."]),
  ];

  function workWithNotes(): ProcessedWork2 {
    return makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [
        [["1", "1"], span([], "Prima pars. ", noteMarker("0"))],
        [["1", "2"], span([], "Secunda pars. ", noteMarker("1"))],
        [["2", "1"], span([], "Tertia pars. ", noteMarker("2"))],
      ],
      pages: [
        { id: ["1"], rows: [0, 2] },
        { id: ["2"], rows: [2, 3] },
      ],
      notes,
    });
  }

  it("renders markers as links to footnote bodies", () => {
    const page = preprocessWorkToV2(workWithNotes(), METADATA).pages[0];

    expect(page.singleHtml).toContain(
      '<a class="reader-note-ref" id="noteref-n1" href="#note-n1"'
    );
    expect(page.singleHtml).not.toContain("<button");
    expect(page.notesHtml).toContain('id="note-n1"');
    expect(page.notesHtml).toContain("Note zero body.");
    expect(page.notesHtml).toContain('href="#noteref-n1"');
  });

  it("numbers notes per page rather than per work", () => {
    const pages = preprocessWorkToV2(workWithNotes(), METADATA).pages;

    // Page one holds work-level notes 0 and 1, labelled 1 and 2.
    expect(pages[0].notesHtml).toContain("Note zero body.");
    expect(pages[0].notesHtml).toContain("Note one body.");
    expect(pages[0].singleHtml).toContain('href="#note-n2"');
    // Page two opens at work-level note 2, but it is still labelled 1.
    expect(pages[1].singleHtml).toContain('href="#note-n1"');
    expect(pages[1].singleHtml).not.toContain('href="#note-n2"');
    expect(pages[1].notesHtml).toContain("Note two body.");
    expect(pages[1].notesHtml).not.toContain("Note zero body.");
  });

  it("omits both marker and list when no note bodies are available", () => {
    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1"], span([], "Prima pars. ", noteMarker("0"))]],
    });

    const page = preprocessWorkToV2(work, METADATA).pages[0];

    expect(page.singleHtml).not.toContain("reader-note-ref");
    expect(page.notesHtml).toBeUndefined();
  });

  it("letters translation notes and includes them inside translationHtml", () => {
    const latin = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1"], span([], "Prima pars. ", noteMarker("0"))]],
      notes: [new XmlNode("span", [], ["Latin note body."])],
    });
    const translation = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1"], span([], "The first part. ", noteMarker("0"))]],
      notes: [new XmlNode("span", [], ["Translation note body."])],
      translator: "W. A. Falconer",
      isTranslation: true,
    });

    const page = preprocessWorkToV2(latin, METADATA, translation).pages[0];

    expect(page.translationHtml).toContain("reader-translation-section");
    expect(page.translationHtml).toContain('href="#note-t1"');
    expect(page.translationHtml).toContain("<sup>[a]</sup>");
    expect(page.translationHtml).toContain("Notes on the translation");
    expect(page.translationHtml).toContain("Translation note body.");
    // The Latin notesHtml only lists the Latin text notes.
    expect(page.notesHtml).toContain("Latin note body.");
    expect(page.notesHtml).not.toContain("Translation note body.");
  });

  it("leaves the translation note list omitted when the translation has no notes", () => {
    const latin = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1"], span([], "Prima pars. ", noteMarker("0"))]],
      notes: [new XmlNode("span", [], ["Latin note body."])],
    });
    const translation = makeWork({
      textParts: ["book", "chapter", "section"],
      rows: [[["1", "1"], span([], "The first part.")]],
      isTranslation: true,
    });

    const page = preprocessWorkToV2(latin, METADATA, translation).pages[0];

    expect(page.notesHtml).toContain("Latin note body.");
    expect(page.translationHtml).toContain("The first part.");
    expect(page.translationHtml).not.toContain("Notes on the translation");
  });
});

describe("preprocessWorkToV2 translation matching", () => {
  const PROSE = ["book", "chapter", "section"];
  const VERSE = ["book", "poem", "line"];

  function line(text: string): ContentNode {
    return span([["l", "1"]], text);
  }

  function translationOf(options: WorkOptions): ProcessedWork2 {
    return makeWork({ ...options, isTranslation: true, translator: "T" });
  }

  /** The `[gutter, text]` pairs of each translation section, in order. */
  function sections(html: string | undefined): [string, string][] {
    const pattern =
      /<div class="reader-translation-gutter">(.*?)<\/div>\s*<div class="reader-translation-text">(.*?)<\/div>/g;
    return [...(html ?? "").matchAll(pattern)].map((m) => [
      m[1].replace(/<[^>]*>/g, ""),
      m[2].replace(/<[^>]*>/g, ""),
    ]);
  }

  it("renders the matching translation page with its own citations", () => {
    const latin = makeWork({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "Prima.")],
        [["1", "1", "2"], span([], "Secunda.")],
      ],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "First.")],
        [["1", "1", "2"], span([], "Second.")],
      ],
    });

    const html = preprocessWorkToV2(latin, METADATA, translation).pages[0]
      .translationHtml;

    expect(sections(html)).toEqual([
      ["1", "First."],
      ["2", "Second."],
    ]);
    expect(html).toContain('id="trans-sec-1.1.1"');
    expect(html).toContain('id="trans-sec-1.1.2"');
  });

  it("renders every translation row, even past the Latin row count", () => {
    const latin = makeWork({
      textParts: VERSE,
      rows: [
        [["1", "1", "1"], line("Arma gravi numero")],
        [["1", "1", "2"], line("edere parabam")],
      ],
    });
    const translation = translationOf({
      textParts: VERSE,
      rows: [
        [["1", "1", "1"], line("For mighty wars")],
        [["1", "1", "2"], line("I thought to tune")],
        [["1", "1", "3"], line("my lute")],
      ],
    });

    const html = preprocessWorkToV2(latin, METADATA, translation).pages[0]
      .translationHtml;

    expect(sections(html)).toEqual([
      ["1", "For mighty wars"],
      ["2", "I thought to tune"],
      ["3", "my lute"],
    ]);
    expect(html).toContain('<span class="reader-line">my lute</span>');
  });

  it("leaves pages without a translation page untranslated", () => {
    const latin = makeWork({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "Prima.")],
        [["11", "1", "1"], span([], "Undecima.")],
      ],
      pages: [
        { id: ["1", "1"], rows: [0, 1] },
        { id: ["11", "1"], rows: [1, 2] },
      ],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [[["1", "1", "1"], span([], "First.")]],
    });

    const pages = preprocessWorkToV2(latin, METADATA, translation).pages;

    expect(pages[0].translationHtml).toContain("First.");
    expect(pages[1].translationHtml).toBeUndefined();
  });

  it("leaves a page untranslated when every translation row is empty", () => {
    const latin = makeWork({
      textParts: PROSE,
      rows: [[["1", "1", "1"], span([], "Prima.")]],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [[["1", "1", "1"], span([], "  ")]],
    });

    const page = preprocessWorkToV2(latin, METADATA, translation).pages[0];

    expect(page.translationHtml).toBeUndefined();
  });

  it("skips empty translation rows", () => {
    const latin = makeWork({
      textParts: PROSE,
      rows: [[["1", "1", "1"], span([], "Prima.")]],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "First.")],
        [["1", "1", "2"], span([], "")],
        [["1", "1", "3"], span([], "Third.")],
      ],
    });

    const html = preprocessWorkToV2(latin, METADATA, translation).pages[0]
      .translationHtml;

    expect(sections(html)).toEqual([
      ["1", "First."],
      ["3", "Third."],
    ]);
    expect(html).not.toContain("trans-sec-1.1.2");
  });

  it("maps known page id aliases to the translation page", () => {
    const latin = makeWork({
      workId: "phi0914.phi001.perseus-lat2",
      textParts: PROSE,
      rows: [[["1", "pr", "1"], span([], "Facturusne operae pretium sim.")]],
      pages: [{ id: ["1", "pr"], rows: [0, 1] }],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [[["1", "0", "1"], span([], "Whether I am likely to accomplish.")]],
      pages: [{ id: ["1", "0"], rows: [0, 1] }],
    });

    const html = preprocessWorkToV2(latin, METADATA, translation).pages[0]
      .translationHtml;

    expect(sections(html)).toEqual([
      ["1", "Whether I am likely to accomplish."],
    ]);
  });

  it("does not apply another work's page id aliases", () => {
    const latin = makeWork({
      workId: "some.other.work",
      textParts: PROSE,
      rows: [[["1", "pr", "1"], span([], "Praefatio.")]],
      pages: [{ id: ["1", "pr"], rows: [0, 1] }],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [[["1", "0", "1"], span([], "Preface.")]],
      pages: [{ id: ["1", "0"], rows: [0, 1] }],
    });

    const page = preprocessWorkToV2(latin, METADATA, translation).pages[0];

    expect(page.translationHtml).toBeUndefined();
  });

  it("matches a translation paginated more coarsely than the Latin", () => {
    const latin = makeWork({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "Prima.")],
        [["1", "2", "1"], span([], "Secunda.")],
      ],
      pages: [
        { id: ["1", "1"], rows: [0, 1] },
        { id: ["1", "2"], rows: [1, 2] },
      ],
    });
    const translation = translationOf({
      textParts: PROSE,
      rows: [
        [["1", "1", "1"], span([], "First.")],
        [["1", "2", "1"], span([], "Second.")],
      ],
      pages: [{ id: ["1"], rows: [0, 2] }],
    });

    const pages = preprocessWorkToV2(latin, METADATA, translation).pages;

    // Both Latin chapters show the whole translated book, cited within it.
    for (const page of pages) {
      expect(sections(page.translationHtml)).toEqual([
        ["1.1", "First."],
        ["2.1", "Second."],
      ]);
    }
  });

  it("gives heading rows no citation or id", () => {
    const latin = makeWork({
      textParts: VERSE,
      rows: [[["1", "1", "1"], line("Arma gravi numero")]],
    });
    const translation = translationOf({
      textParts: VERSE,
      rows: [
        [
          ["1", "1"],
          new XmlNode<ProcessedWorkContentNodeType>("head", [], ["Elegy I"]),
        ],
        [["1", "1", "1"], line("For mighty wars")],
      ],
    });

    const html = preprocessWorkToV2(latin, METADATA, translation).pages[0]
      .translationHtml;

    expect(sections(html)).toEqual([
      ["", "Elegy I"],
      ["1", "For mighty wars"],
    ]);
    expect(html).not.toContain('id="trans-sec-1.1"');
  });
});

describe("preprocessWorkToV2 metadata and attribution", () => {
  it("preserves funder, sponsor, editor, and sourceRef from work.info", () => {
    const work = makeWork({
      rows: [[["1", "1"], span([], "Test text")]],
    });
    work.info.editor = "William Armistead Falconer";
    work.info.funder = "The National Endowment for the Humanities";
    work.info.sponsor = "Perseus Project, Tufts University";
    work.info.sourceRef = [
      "https://archive.org/details/desenectutedeami0000cice/page/108",
    ];

    const v2Work = preprocessWorkToV2(work, METADATA);
    expect(v2Work.editor).toBe("William Armistead Falconer");
    expect(v2Work.funder).toBe("The National Endowment for the Humanities");
    expect(v2Work.sponsor).toBe("Perseus Project, Tufts University");
    expect(v2Work.sourceRef).toEqual([
      "https://archive.org/details/desenectutedeami0000cice/page/108",
    ]);
  });

  it("uses the file's licence statement and says the text may be modified", () => {
    const work = makeWork({
      rows: [[["1", "1"], span([], "Test text")]],
    });
    work.info.licence =
      "Available under a Creative Commons Attribution-ShareAlike 4.0 International License";

    expect(preprocessWorkToV2(work, METADATA).license).toBe(
      "Available under a Creative Commons Attribution-ShareAlike 4.0 International License. The text may have been modified from the original."
    );
  });

  it("falls back to the repository licence", () => {
    const work = makeWork({
      rows: [[["1", "1"], span([], "Test text")]],
    });

    const license = preprocessWorkToV2(work, METADATA).license;

    expect(license).toContain(
      "Creative Commons Attribution-ShareAlike 4.0 International License."
    );
    expect(license).toContain("may have been modified");
    expect(license).not.toContain("3.0");
  });
});

describe("preprocessWorkToV2 poetry line labels", () => {
  it("marks non-5th verse line anchors as latent (keeping line 1 and multiples of 5 visible) and skips stanza break rows", () => {
    const rows: [string[], ContentNode][] = [];
    for (let i = 1; i <= 10; i++) {
      if (i === 5) {
        // Insert a non-leaf stanza break row (<space lg="2"/>) before line 5
        rows.push([
          ["1", "1"],
          new XmlNode<ProcessedWorkContentNodeType>("space", [["lg", "2"]]),
        ]);
      }
      rows.push([["1", "1", String(i)], span([["l", "1"]], `Versus ${i}`)]);
    }

    const work = makeWork({
      textParts: ["book", "poem", "line"],
      rows,
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    // Lines 1, 5, and 10 must be visible by default (no .latent class)
    for (const visibleLine of [1, 5, 10]) {
      expect(html).toContain(
        `<a href="#sec-1.1.${visibleLine}" class="section-anchor"><span class="cite-prefix">1.1.</span><span class="cite-local">${visibleLine}</span></a>`
      );
    }

    // Intermediate lines (2, 3, 4, 6, 7, 8, 9) must be marked .latent
    for (const latentLine of [2, 3, 4, 6, 7, 8, 9]) {
      expect(html).toContain(
        `<a href="#sec-1.1.${latentLine}" class="section-anchor latent"><span class="cite-prefix">1.1.</span><span class="cite-local">${latentLine}</span></a>`
      );
    }
  });

  it("omits .cite-prefix when the section has no prefix", () => {
    const work = makeWork({
      textParts: ["section"],
      pages: [{ id: [], rows: [0, 1] }],
      rows: [[["1"], span([], "Prima.")]],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    expect(html).toContain(
      '<a href="#sec-1" class="section-anchor"><span class="cite-local">1</span></a>'
    );
    expect(html).not.toContain("cite-prefix");
  });

  it("never marks prose section labels as latent", () => {
    const rows: [string[], ContentNode][] = [];
    for (let i = 1; i <= 6; i++) {
      rows.push([["1", "1", String(i)], span([], `Sectio ${i}.`)]);
    }

    const work = makeWork({
      textParts: ["book", "chapter", "section"],
      rows,
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;
    expect(html).not.toContain("section-anchor latent");
  });

  it("throws when a work contains duplicate page ids", () => {
    const work = makeWork({
      rows: [
        [["1", "7", "1"], span([], "Prima.")],
        [["1", "7", "2"], span([], "Secunda.")],
      ],
      pages: [
        { id: ["1", "7"], rows: [0, 1] },
        { id: ["1", "7"], rows: [1, 2] },
      ],
    });

    expect(() => preprocessWorkToV2(work, METADATA)).toThrow(
      "Duplicate page id 1.7 in ovid.amores"
    );
  });
});

describe("preprocessWorkToV2 shallow leaf rows", () => {
  const head = (text: string) =>
    new XmlNode<ProcessedWorkContentNodeType>("head", [], [text]);

  it("cites a page whose only rows sit at the page's own depth", () => {
    const work = makeWork({
      textParts: ["letter", "section"],
      rows: [
        [["44"], head("Ad Marcellam")],
        [["44"], span([], "Absentiam corporis spiritu confabulandi.")],
        [["44"], span([], "Vale.")],
      ],
      pages: [{ id: ["44"], rows: [0, 3] }],
    });

    const page = preprocessWorkToV2(work, METADATA).pages[0];

    expect(page.citationRange).toEqual(["44", "44"]);
    expect(page.sectionCount).toBe(1);
    expect(page.singleHtml.match(/id="sec-44"/g)).toHaveLength(1);
    expect(page.singleHtml).toContain(
      '<div class="reader-section" id="sec-44"><div class="reader-gutter"><a href="#sec-44" class="section-anchor"><span class="cite-local">44</span></a></div><div class="reader-passage"><p class="reader-paragraph">Absentiam'
    );
  });

  it("gives a heading no citation when the page has deeper rows", () => {
    const work = makeWork({
      textParts: ["letter", "section"],
      rows: [
        [["3"], head("Ad Rufinum")],
        [["3", "1"], span([], "Plus deum tribuere quam mereor.")],
      ],
      pages: [{ id: ["3"], rows: [0, 2] }],
    });

    const page = preprocessWorkToV2(work, METADATA).pages[0];

    expect(page.citationRange).toEqual(["3.1", "3.1"]);
    expect(page.singleHtml).not.toContain('id="sec-3"');
    expect(page.singleHtml).not.toContain('href="#sec-3"');
  });

  it("does not count a shallow leaf as a verse line", () => {
    const rows: [string[], ContentNode][] = [
      [["pr"], span([["para", "1"]], "Ausonius lectori salutem.")],
    ];
    const work = makeWork({
      textParts: ["poem", "line"],
      rows,
      pages: [{ id: ["pr"], rows: [0, 1] }],
    });

    const page = preprocessWorkToV2(work, METADATA).pages[0];

    expect(page.citationRange).toEqual(["pr", "pr"]);
    expect(page.singleHtml).toContain(
      '<a href="#sec-pr" class="section-anchor"><span class="cite-local">pr</span></a>'
    );
  });
});

describe("preprocessWorkToV2 prose in verse works", () => {
  it("renders a paragraph row as a paragraph, not a verse line", () => {
    const work = makeWork({
      rows: [
        [
          ["1", "1", "1"],
          span([["para", "1"]], "Ausonius Hesperio filio salutem."),
        ],
        [["1", "1", "2"], span([["l", "1"]], "Arma gravi numero")],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain(
      '<div class="reader-passage"><p class="reader-block">Ausonius Hesperio filio salutem.</p></div>'
    );
    expect(html).not.toContain('<span class="reader-line"><p');
    expect(html).toContain(
      '<span class="reader-line">Arma gravi numero</span>'
    );
  });

  it("renders a division holding a heading and a paragraph as prose", () => {
    const work = makeWork({
      rows: [
        [
          ["1", "1"],
          span(
            [],
            new XmlNode<ProcessedWorkContentNodeType>(
              "head",
              [],
              ["Praefatio"]
            ),
            span([["para", "1"]], "Lectori salutem.")
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain(
      '<div class="reader-passage"><h3 class="reader-subheading">Praefatio</h3><p class="reader-block">Lectori salutem.</p></div>'
    );
  });

  it("keeps a Hypotactic-shaped row as a verse line", () => {
    const work = makeWork({
      rows: [
        [
          ["1", "1", "1"],
          span(
            [["meter", "hexameter"]],
            span([], "Arma"),
            " ",
            span([], "virumque")
          ),
        ],
      ],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain(
      '<div class="reader-passage"><span class="reader-line">Arma virumque</span></div>'
    );
  });

  it("renders a paragraph row unchanged in a prose work", () => {
    const rows: [string[], ContentNode][] = [
      [["1", "1", "1"], span([], "Gallia est omnis divisa.")],
    ];
    const withPara: [string[], ContentNode][] = [
      [["1", "1", "1"], span([["para", "1"]], "Gallia est omnis divisa.")],
    ];
    const textParts = ["book", "chapter", "section"];

    const plain = preprocessWorkToV2(makeWork({ textParts, rows }), METADATA);
    const tagged = preprocessWorkToV2(
      makeWork({ textParts, rows: withPara }),
      METADATA
    );

    expect(tagged.pages[0].singleHtml).toBe(plain.pages[0].singleHtml);
    expect(tagged.pages[0].singleHtml).toContain(
      '<p class="reader-paragraph">Gallia est omnis divisa.</p>'
    );
  });

  it("leaves an empty paragraph row as it was", () => {
    const work = makeWork({
      rows: [[["1", "1", "1"], span([["para", "1"]], "  ")]],
    });

    const html = preprocessWorkToV2(work, METADATA).pages[0].singleHtml;

    expect(html).toContain('<span class="reader-line">  </span>');
    expect(html).not.toContain("reader-block");
  });
});

describe("preprocessWorkToV2 line-only works", () => {
  function lineOnlyWork(lineCount: number): ProcessedWork2 {
    const rows: [string[], ContentNode][] = [
      [[], new XmlNode<ProcessedWorkContentNodeType>("head", [], ["Culex"])],
    ];
    for (let i = 1; i <= lineCount; i++) {
      rows.push([[String(i)], span([["l", "1"]], `Versus ${i}`)]);
    }
    const work = makeWork({
      textParts: ["line"],
      rows,
      pages: [{ id: ["1"], rows: [0, rows.length] }],
    });
    work.navTree = { id: [], children: [{ id: ["1"], children: [] }] };
    return work;
  }

  it("titles the single page and its TOC entry by line range", () => {
    const v2 = preprocessWorkToV2(lineOnlyWork(414), METADATA);

    expect(v2.pages).toHaveLength(1);
    expect(v2.pages[0].title).toBe("Lines 1–414");
    expect(v2.pages[0].citationRange).toEqual(["1", "414"]);
    expect(v2.tocHtml).toContain(
      '<span class="reader-toc-item-title">Lines 1–414</span>'
    );
    expect(v2.tocHtml).not.toContain("Line 1<");
  });

  it("cites each line by its bare number", () => {
    const html = preprocessWorkToV2(lineOnlyWork(5), METADATA).pages[0]
      .singleHtml;

    expect(html).toContain(
      '<a href="#sec-5" class="section-anchor"><span class="cite-local">5</span></a>'
    );
    expect(html).not.toContain("cite-prefix");
  });

  it("keeps the usual titles for other single-level works", () => {
    const work = makeWork({
      textParts: ["section"],
      rows: [
        [["1"], span([], "Prima.")],
        [["2"], span([], "Secunda.")],
      ],
      pages: [
        { id: ["1"], rows: [0, 1] },
        { id: ["2"], rows: [1, 2] },
      ],
    });

    const v2 = preprocessWorkToV2(work, METADATA);

    expect(v2.pages.map((p) => p.title)).toEqual(["Section 1", "Section 2"]);
    expect(v2.tocHtml).toContain(
      '<span class="reader-toc-item-title">Section 1</span>'
    );
  });
});

describe("preprocessWorkToV2 drama and dialogue", () => {
  const kind = (k: string, ...children: (ContentNode | string)[]) =>
    span([["kind", k]], ...children);
  const line = (text: string, part?: string) =>
    span(
      part === undefined
        ? [["l", "1"]]
        : [
            ["l", "1"],
            ["linePart", part],
          ],
      text
    );
  const DRAMA = { textParts: ["act", "scene", "line"] };

  function render(
    rows: [string[], ContentNode][],
    options: Partial<WorkOptions> = DRAMA
  ): string {
    return preprocessWorkToV2(
      makeWork({
        pages: [{ id: ["1", "1"], rows: [0, rows.length] }],
        ...options,
        rows,
      }),
      METADATA
    ).pages[0].singleHtml;
  }

  it("sets a speaker row as a block above the speech, with no citation", () => {
    const html = render([
      [["1", "1"], kind("speaker", "Mercvrivs")],
      [["1", "1", "292"], line("Ibo ut erus quod imperavit.")],
    ]);

    expect(html).toContain(
      '<div class="reader-section section-verse"><div class="reader-gutter"></div><div class="reader-passage"><div class="reader-speaker">Mercvrivs</div></div></div>'
    );
    expect(html).not.toContain('<span class="reader-line"><div');
  });

  it("sets a stage direction and a cast list as blocks", () => {
    const html = render([
      [
        ["1", "1"],
        span(
          [],
          kind(
            "cast-list",
            kind("cast-person", "CHREMES, ", kind("role-name", "senex."))
          ),
          span(
            [
              ["para", "1"],
              ["block", "1"],
            ],
            "ACTA LUDIS"
          )
        ),
      ],
      [["1", "1"], kind("stage", "(SIMO. SOSIA.)")],
    ]);

    expect(html).toContain(
      '<div class="reader-passage"><div class="reader-cast-list"><div class="reader-cast-person">CHREMES, <span class="reader-role-name italic">senex.</span></div></div><p class="reader-block">ACTA LUDIS</p></div>'
    );
    expect(html).toContain(
      '<div class="reader-passage"><div class="reader-stage">(SIMO. SOSIA.)</div></div>'
    );
  });

  it("keeps a speaker inside a prose row a span, so the paragraph stays valid", () => {
    const html = render(
      [
        [
          ["1", "66"],
          span(
            [],
            "Tum ",
            span([], kind("speaker", "H."), line("Sed quid oculis"))
          ),
        ],
      ],
      { textParts: ["book", "section"], pages: [{ id: ["1"], rows: [0, 1] }] }
    );

    expect(html).toContain(
      '<p class="reader-paragraph">Tum <span class="reader-speaker">H.</span><span class="reader-line">Sed quid oculis</span></p>'
    );
  });

  it("renders a dialogue's speaker label, unclear letters and a manuscript blank inline", () => {
    const html = render(
      [
        [
          ["1", "4"],
          span(
            [],
            kind("speaker-inline", "VA."),
            " Quod comba",
            kind("unclear", "e"),
            "pumam ",
            kind("tei-space"),
            " haec"
          ),
        ],
      ],
      { textParts: ["book", "section"], pages: [{ id: ["1"], rows: [0, 1] }] }
    );

    expect(html).toContain(
      '<span class="reader-speaker-inline">VA.</span> Quod comba<span class="reader-unclear">e</span>pumam <span class="tei-space italic text-muted" data-no-tokenize="true">[space]</span> haec'
    );
  });

  describe("split-line staircase", () => {
    /** `[row text, class]` of each verse line and speaker on the page. */
    const steps = (html: string) =>
      Array.from(
        html.matchAll(
          /<(?:span|div) class="(reader-(?:line|speaker)[^"]*)">([^<]*)</g
        )
      ).map(([, cls, text]) => [text, /reader-step-\d/.exec(cls)?.[0] ?? ""]);

    it("steps each part further, with its speaker over it, and resets on a new line", () => {
      const html = render([
        [["1", "1"], kind("speaker", "A")],
        [["1", "1", "170"], line("Quid?")],
        [["1", "1"], kind("speaker", "B")],
        [["1", "1", "170b"], line("Nihil.", "M")],
        [["1", "1"], kind("stage", "(A. B.)")],
        [["1", "1"], kind("speaker", "A")],
        [["1", "1", "170c"], line("Tace.", "F")],
        [["1", "1", "171"], line("Abi.")],
        [["1", "1"], kind("speaker", "B")],
        [["1", "1", "172"], line("Eo.")],
      ]);
      expect(steps(html)).toEqual([
        ["A", ""],
        ["Quid?", ""],
        ["B", "reader-step-1"],
        ["Nihil.", "reader-step-1"],
        ["A", "reader-step-2"],
        ["Tace.", "reader-step-2"],
        ["Abi.", ""],
        ["B", ""],
        ["Eo.", ""],
      ]);
      // The stage direction between the parts is not stepped.
      expect(html).toContain('<div class="reader-stage">(A. B.)</div>');
    });

    it("stops stepping at six parts", () => {
      const rows: [string[], ContentNode][] = [[["1", "1", "9"], line("p0")]];
      for (let i = 1; i <= 7; i++) {
        rows.push([["1", "1", `9${"bcdefgh"[i - 1]}`], line(`p${i}`, "M")]);
      }
      expect(steps(render(rows)).map(([, step]) => step)).toEqual([
        "",
        "reader-step-1",
        "reader-step-2",
        "reader-step-3",
        "reader-step-4",
        "reader-step-5",
        "reader-step-6",
        "reader-step-6",
      ]);
    });
  });

  describe("gutter line numbers", () => {
    const anchors = (html: string) =>
      Array.from(
        html.matchAll(
          /class="section-anchor( latent)?">(?:<span class="cite-prefix">[^<]*<\/span>)?<span class="cite-local">([^<]*)</g
        )
      ).map(([, latent, n]) => (latent ? `(${n})` : n));

    it("numbers a scene that opens mid-count by its line numbers", () => {
      const rows: [string[], ContentNode][] = [];
      for (let n = 153; n <= 161; n++) {
        rows.push([["1", "1", String(n)], line(`v${n}`)]);
      }
      expect(anchors(render(rows))).toEqual([
        "153",
        "(154)",
        "155",
        "(156)",
        "(157)",
        "(158)",
        "(159)",
        "160",
        "(161)",
      ]);
    });

    it("never numbers or counts the continuation of a split line", () => {
      const html = render([
        [["1", "1"], kind("speaker", "A")],
        // `process_work` marks only medial and final parts (`linePart`).
        [["1", "1", "293"], line("sed quis")],
        [["1", "1"], kind("speaker", "B")],
        [["1", "1", "293b"], line("Nullus est", "F")],
        [["1", "1", "294"], line("mihi")],
        [["1", "1", "295"], line("par")],
        [["1", "1", "295b"], line("Quid?")],
        [["1", "1", "295c"], line("Nihil.", "M")],
      ]);
      expect(anchors(html)).toEqual([
        "293",
        "(293b)",
        "(294)",
        "295",
        "(295b)",
        "(295c)",
      ]);
    });

    it("numbers a merged line that covers a fifth line", () => {
      const html = render([
        [["1", "1", "158"], line("a")],
        [["1", "1", "159_160"], line("b")],
        [["1", "1", "161_162"], line("c")],
      ]);
      expect(anchors(html)).toEqual(["158", "159_160", "(161_162)"]);
    });

    it("counts lines whose ids are not numbers", () => {
      const rows: [string[], ContentNode][] = [
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
      ].map((n) => [["1", "1", n], line(n)]);
      expect(anchors(render(rows))).toEqual([
        "a",
        "(b)",
        "(c)",
        "(d)",
        "e",
        "(f)",
      ]);
    });

    it("never numbers a line whose id has anything after its number", () => {
      const html = render([
        [["1", "1", "1033"], line("a")],
        [["1", "1", "1034_frg1"], line("b")],
        [["1", "1", "1034_frg6"], line("c")],
        [["1", "1", "1018a1019b"], line("d")],
        [["1", "1", "375O"], line("e")],
        [["1", "1", "1035"], line("f")],
      ]);
      expect(anchors(html)).toEqual([
        "1033",
        "(1034_frg1)",
        "(1034_frg6)",
        "(1018a1019b)",
        "(375O)",
        "1035",
      ]);
    });

    it("always numbers cited prose paragraphs in a verse work", () => {
      const para = (text: string) => span([["para", "1"]], text);
      const html = render(
        [
          [["2"], span([], "EPISTULA")],
          [["2", "1"], para("Prima.")],
          [["2", "2"], para("Secunda.")],
          [["2", "3"], para("Tertia.")],
        ],
        {
          textParts: ["poem", "line"],
          pages: [{ id: ["2"], rows: [0, 4] }],
        }
      );
      expect(anchors(html)).toEqual(["1", "2", "3"]);
    });

    it("numbers one row of a line that spans several rows", () => {
      const html = render([
        [["1", "1", "4"], line("a")],
        [["1", "1", "5"], line("b")],
        [["1", "1", "5"], line("c")],
      ]);
      expect(anchors(html)).toEqual(["4", "5", "(5)"]);
    });
  });
});

describe("preprocessWorkToV2 roman_law citationStyle and smallcaps inscriptions", () => {
  const DIGEST_METADATA: LibraryWorkMetadata = {
    author: "Justinian",
    name: "Digesta",
    id: "tll.justinian.digest",
    urlAuthor: "justinian",
    urlName: "digest",
    attribution: "theLatinLibrary",
  };

  it("renders smallcaps editorial inscriptions (Rule D) with reader-editorial-smallcaps and data-no-tokenize", () => {
    const work = makeWork({
      textParts: ["book", "title", "lex", "paragraph"],
      rows: [
        [
          ["1", "1", "1", "pr"],
          span(
            [],
            span(
              [
                ["kind", "editorial"],
                ["style", "smallcaps"],
              ],
              "Ulpianus libro primo institutionum."
            ),
            " Iuri operam daturum prius nosse oportet."
          ),
        ],
      ],
    });
    work.info.citationStyle = "roman_law";

    const v2 = preprocessWorkToV2(work, DIGEST_METADATA);
    expect(v2.citationStyle).toBe("roman_law");
    expect(v2.pages[0].singleHtml).toContain(
      '<span class="reader-editorial reader-editorial-smallcaps" data-no-tokenize="true">Ulpianus libro primo institutionum.</span>'
    );
  });

  it("formats compact pr citations (1.1.1pr), gutter labels (1pr, 1, 2pr), undivided laws, and Book 30 Title 0 elision (Rules A, B, C)", () => {
    const head = (text: string) =>
      new XmlNode<ProcessedWorkContentNodeType>("head", [], [text]);
    const work = makeWork({
      textParts: ["book", "title", "lex", "paragraph"],
      rows: [
        [["1", "1"], head("I. DE IUSTITIA ET IURE")],
        [["1", "1", "1", "pr"], span([], "Iuri operam daturum.")],
        [["1", "1", "1", "1"], span([], "Cuius merito quis nos sacerdotes.")],
        [["1", "1", "2"], span([], "Veluti erga deum religio.")],
        [["1", "1", "3", "pr"], span([], "Ut vim atque iniuriam.")],
        [["30", "0"], head("DE LEGATIS ET FIDEICOMMISSIS")],
        [["30", "0", "1", "pr"], span([], "Per omnia exaequata sunt legata.")],
        [["30", "0", "79"], span([], "Si chorus aut familia legata sit.")],
        [["30", "0", "79", "1"], span([], "Proinde si fundus.")],
      ],
      pages: [
        { id: ["1", "1"], rows: [0, 5] },
        { id: ["30", "0"], rows: [5, 9] },
      ],
    });
    work.info.citationStyle = "roman_law";
    work.navTree = {
      id: [],
      children: [
        { id: ["1"], children: [{ id: ["1", "1"], children: [] }] },
        { id: ["30"], children: [{ id: ["30", "0"], children: [] }] },
      ],
    };

    const v2 = preprocessWorkToV2(work, DIGEST_METADATA);

    // Page 1.1: Book 1, Title 1
    // Canonical `.reader-section` id, href, and citationRange stay on the raw `secId.join(".")`
    // so corpus matchText highlights and `#sec-...` target flashes match, while `.cite-prefix`
    // and `.cite-local` display the compact/elided form and compact anchors are gutter aliases.
    const page1 = v2.pages[0];
    expect(page1.title).toBe("Book 1, Title 1");
    expect(page1.citationRange).toEqual(["1.1.1.pr", "1.1.3.pr"]);
    expect(page1.singleHtml).toContain(
      '<div class="reader-section" id="sec-1.1.1.pr">'
    );
    expect(page1.singleHtml).toContain('<span id="sec-1.1.1pr"></span>');
    expect(page1.singleHtml).toContain(
      '<a href="#sec-1.1.1.pr" class="section-anchor"><span class="cite-prefix">1.1.</span><span class="cite-local">1pr</span></a>'
    );
    expect(page1.singleHtml).toContain(
      '<a href="#sec-1.1.1.1" class="section-anchor"><span class="cite-prefix">1.1.1.</span><span class="cite-local">1</span></a>'
    );
    expect(page1.singleHtml).toContain(
      '<a href="#sec-1.1.2" class="section-anchor"><span class="cite-prefix">1.1.</span><span class="cite-local">2</span></a>'
    );
    expect(page1.singleHtml).toContain(
      '<a href="#sec-1.1.3.pr" class="section-anchor"><span class="cite-prefix">1.1.</span><span class="cite-local">3pr</span></a>'
    );

    // Page 30.0: Book 30 (Title 0 elided in display, raw join on `.reader-section`)
    const page30 = v2.pages[1];
    expect(page30.title).toBe("Book 30");
    expect(page30.title).not.toContain("Title 0");
    expect(page30.citationRange).toEqual(["30.0.1.pr", "30.0.79.1"]);
    expect(page30.singleHtml).toContain(
      '<div class="reader-section" id="sec-30.0.1.pr">'
    );
    expect(page30.singleHtml).toContain('<span id="sec-30.1pr"></span>');
    expect(page30.singleHtml).toContain(
      '<a href="#sec-30.0.1.pr" class="section-anchor"><span class="cite-prefix">30.</span><span class="cite-local">1pr</span></a>'
    );
    expect(page30.singleHtml).toContain(
      '<div class="reader-section" id="sec-30.0.79">'
    );
    expect(page30.singleHtml).toContain('<span id="sec-30.79"></span>');
    expect(page30.singleHtml).toContain(
      '<div class="reader-section" id="sec-30.0.79.1">'
    );
    expect(page30.singleHtml).toContain('<span id="sec-30.79.1"></span>');
    expect(page30.singleHtml).toContain(
      '<a href="#sec-30.0.79.1" class="section-anchor"><span class="cite-prefix">30.79.</span><span class="cite-local">1</span></a>'
    );

    // TOC omits Title 0
    expect(v2.tocHtml).toContain(
      '<span class="reader-toc-item-title">Book 30</span>'
    );
    expect(v2.tocHtml).not.toContain("Title 0");
  });
});
