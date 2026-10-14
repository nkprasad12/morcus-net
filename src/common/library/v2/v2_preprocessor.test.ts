import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import { preprocessWorkToV2 } from "@/common/library/v2/v2_preprocessor";
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
        `<a href="#sec-1.1.${visibleLine}"\n             class="section-anchor"`
      );
    }

    // Intermediate lines (2, 3, 4, 6, 7, 8, 9) must be marked .latent
    for (const latentLine of [2, 3, 4, 6, 7, 8, 9]) {
      expect(html).toContain(
        `<a href="#sec-1.1.${latentLine}"\n             class="section-anchor latent"`
      );
    }
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
});
