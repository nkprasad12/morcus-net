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
}

function makeWork(options: WorkOptions): ProcessedWork2 {
  const rows = options.rows;
  return {
    info: {
      title: "Amores",
      author: "Ovid",
      workId: "ovid.amores",
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
