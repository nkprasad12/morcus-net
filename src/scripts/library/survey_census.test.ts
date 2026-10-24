import type { ProcessedWork2 } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  categorizeV1Error,
  censusOfBody,
  fingerprintOf,
  headerFacts,
  outputChecks,
  stripProlog,
  workCensusEntry,
} from "@/scripts/library/survey_census";
import { surveyWork } from "@/scripts/library/survey";

console.debug = jest.fn();

const ENCODING_DESC = `
  <encodingDesc>
    <refsDecl n="CTS">
      <cRefPattern n="section" matchPattern="(\\w+).(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1']/tei:div[@n='$2'])"><p>x</p></cRefPattern>
      <cRefPattern n="chapter" matchPattern="(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1'])"><p>x</p></cRefPattern>
    </refsDecl>
  </encodingDesc>`;

function tei(body: string, extraHeader = ""): string {
  return `<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Opus</title><author>Auctor</author></titleStmt>
      <publicationStmt><availability><licence>CC  BY-SA
        4.0</licence></availability></publicationStmt>
    </fileDesc>
    ${ENCODING_DESC}
    ${extraHeader}
  </teiHeader>
  <text xml:lang="lat"><body>${body}</body></text>
</TEI>`;
}

const BODY = `<div type="edition" n="urn:x">
  <div type="textpart" subtype="chapter" n="1">
    <div type="textpart" subtype="section" n="1"><p>Gallia <hi rend="italic">est</hi> omnis<note place="foot">see <hi rend="bold">x</hi> <foreign xml:lang="grc">y</foreign></note></p></div>
    <div type="textpart" subtype="section" n="2"><p>divisa <milestone unit="page" n="2"/>in</p></div>
  </div>
  <div type="textpart" subtype="chapter" n="2">
    <div type="textpart" subtype="section" n="1"><p rend="indent">partes</p></div>
  </div>
</div>`;

function bodyOf(xml: string): XmlNode {
  const root = parseRawXml(xml, { keepWhitespace: true });
  return root.name === "body" ? root : root.findDescendants("body")[0];
}

describe("censusOfBody", () => {
  const census = censusOfBody(bodyOf(tei(BODY)));

  it("splits elements inside and outside notes", () => {
    expect(census.elements.get("note")).toBe(1);
    expect(census.elements.get("hi")).toBe(1);
    expect(census.elements.get("p")).toBe(3);
    expect(census.elements.has("foreign")).toBe(false);
    expect(census.noteElements.get("hi")).toBe(1);
    expect(census.noteElements.get("foreign")).toBe(1);
    expect(census.noteElements.has("note")).toBe(false);
  });

  it("records rends and attributes by element", () => {
    expect([...census.rends.keys()].sort()).toEqual(["hi@italic", "p@indent"]);
    expect([...census.noteRends.keys()]).toEqual(["hi@bold"]);
    expect(census.attrs.get("div@n")).toBe(6);
    expect(census.attrs.get("note@place")).toBe(1);
    expect(census.noteAttrs.get("foreign@xml:lang")).toBe(1);
    expect(census.attrs.has("foreign@xml:lang")).toBe(false);
  });

  it("records structure", () => {
    expect(Object.fromEntries(census.milestoneUnits)).toEqual({ page: 1 });
    expect(Object.fromEntries(census.divTypes)).toEqual({
      "edition/-": 1,
      "textpart/chapter": 2,
      "textpart/section": 3,
    });
    expect(Object.fromEntries(census.leafDepths)).toEqual({ "2": 3 });
    expect(census.textpartNoN).toBe(0);
    expect(census.textChars).toBe("Galliaestomnisseexydivisainpartes".length);
  });

  it("counts textparts without @n and mixed leaf depths", () => {
    const c = censusOfBody(
      bodyOf(
        `<body><div type="textpart"><div type="textpart" n="1">a</div></div><div type="textpart" n="2">b</div></body>`
      )
    );
    expect(c.textpartNoN).toBe(1);
    expect(Object.fromEntries(c.leafDepths)).toEqual({ "1": 1, "2": 1 });
  });
});

describe("workCensusEntry", () => {
  it("returns sorted, de-duplicated sets", () => {
    const entry = workCensusEntry(
      censusOfBody(bodyOf(tei(BODY))),
      "data/a/b/a.b.perseus-lat1.xml",
      true
    );
    expect(entry).toEqual({
      path: "data/a/b/a.b.perseus-lat1.xml",
      onboarded: true,
      elements: ["body", "div", "hi", "milestone", "note", "p"],
      noteElements: ["foreign", "hi"],
      rends: ["hi@italic", "p@indent"],
      noteRends: ["hi@bold"],
      attrs: [
        "div@n",
        "div@subtype",
        "div@type",
        "hi@rend",
        "milestone@n",
        "milestone@unit",
        "note@place",
        "p@rend",
      ],
      noteAttrs: ["foreign@xml:lang", "hi@rend"],
    });
  });
});

describe("headerFacts", () => {
  it("extracts header facts", () => {
    const facts = headerFacts(parseRawXml(tei(BODY), { keepWhitespace: true }));
    expect(facts).toEqual({
      hasAuthor: true,
      hasTitle: true,
      refsDeclCount: 1,
      nonCtsRefsDeclCount: 0,
      hasCiteStructure: false,
      hasFront: false,
      hasBack: false,
      bodyCount: 1,
      language: "lat",
      licence: "CC BY-SA 4.0",
    });
  });

  it("detects citeStructure", () => {
    const facts = headerFacts(
      parseRawXml(
        `<TEI><teiHeader><refsDecl><citeStructure unit="book" match="x" use="@n"/></refsDecl></teiHeader><text><body/></text></TEI>`
      )
    );
    expect(facts.hasCiteStructure).toBe(true);
    expect(facts.nonCtsRefsDeclCount).toBe(1);
    expect(facts.hasAuthor).toBe(false);
    expect(facts.licence).toBeNull();
    expect(facts.language).toBeNull();
  });
});

describe("stripProlog", () => {
  it("removes comments and DOCTYPE before TEI, keeps PIs", () => {
    const raw = `<?xml version="1.0"?>
<!-- a comment -->
<!DOCTYPE TEI.2 PUBLIC "x" "y" [
<!ENTITY % TEI.XML "INCLUDE">
]>
<?xml-model href="x"?>
<TEI><text><body><!-- kept --></body></text></TEI>`;
    const out = stripProlog(raw);
    expect(out).not.toContain("DOCTYPE");
    expect(out).not.toContain("a comment");
    expect(out).toContain("<?xml-model");
    expect(out).toContain("<!-- kept -->");
  });

  it("removes a simple DOCTYPE", () => {
    expect(stripProlog(`<!DOCTYPE TEI SYSTEM "x.dtd"><TEI/>`)).toBe("<TEI/>");
  });
});

describe("categorizeV1Error", () => {
  it("buckets by throwing function", () => {
    expect(categorizeV1Error("boom", "Error\n    at getTextparts (x)")).toBe(
      "textParts: refsDecl ambiguous"
    );
    expect(
      categorizeV1Error("Unknown node foo\nmore", "    at transformContentNode")
    ).toBe("markup: content node (Unknown node foo)");
    expect(categorizeV1Error("odd", "")).toBe("other: odd");
    expect(categorizeV1Error("\n  late\n", "")).toBe("other: late");
  });
});

function fakeWork(): ProcessedWork2 {
  const row = (children: (XmlNode<any> | string)[]) =>
    new XmlNode<any>("span", [], children);
  return {
    info: { title: "t", author: "a", workId: "w", attribution: "perseus" },
    textParts: ["chapter", "section"],
    rows: [
      [[], new XmlNode<any>("head", [], ["Title"])],
      [["1"], row(["Chapter heading"])],
      [["1", "1"], row([new XmlNode("span", [["rend", "italic"]], ["a"])])],
      [["1", "2"], row(["b", new XmlNode("note", [["noteId", "0"]])])],
      [["2", "1"], row([new XmlNode("br")])],
    ],
    pages: [
      { id: ["1"], rows: [1, 4] },
      { id: ["2"], rows: [4, 5] },
    ],
    navTree: { id: [], children: [] },
    notes: [new XmlNode("note", [], ["n"])],
  };
}

describe("fingerprintOf", () => {
  it("fingerprints a processed work", () => {
    expect(fingerprintOf(fakeWork())).toEqual({
      textParts: ["chapter", "section"],
      rows: 5,
      pages: 2,
      citableRows: 3,
      firstCitation: "1.1",
      lastCitation: "2.1",
      notes: 1,
      nodes: { br: 1, head: 1, note: 1, span: 4, "span@italic": 1 },
    });
  });

  it("has null citations without citable rows", () => {
    const work = fakeWork();
    work.rows = work.rows.slice(0, 2);
    const f = fingerprintOf(work);
    expect(f.citableRows).toBe(0);
    expect(f.firstCitation).toBeNull();
    expect(f.lastCitation).toBeNull();
  });
});

describe("outputChecks", () => {
  it("passes a well-formed work", () => {
    expect(outputChecks(fakeWork())).toEqual({
      hasCitableRow: true,
      arityOk: true,
      pagesOrdered: true,
      rowsOutsidePages: 1,
    });
  });

  it("flags gaps, over-long ids and no citable rows", () => {
    const work = fakeWork();
    work.pages = [
      { id: ["1"], rows: [1, 3] },
      { id: ["2"], rows: [4, 5] },
    ];
    expect(outputChecks(work).pagesOrdered).toBe(true);
    expect(outputChecks(work).rowsOutsidePages).toBe(2);
    work.pages = [
      { id: ["1"], rows: [1, 4] },
      { id: ["2"], rows: [3, 5] },
    ];
    expect(outputChecks(work).pagesOrdered).toBe(false);
    work.pages = [];
    expect(outputChecks(work).pagesOrdered).toBe(false);
    work.rows = [[["1", "1", "1"], new XmlNode<any>("span")]];
    expect(outputChecks(work).arityOk).toBe(false);
    expect(outputChecks(work).hasCitableRow).toBe(false);
  });
});

describe("surveyWork", () => {
  const file = {
    workId: "phi9999.phi001.perseus-lat1",
    relPath: "data/phi9999/phi001/phi9999.phi001.perseus-lat1.xml",
    scope: "perseus-lat" as const,
  };

  it("surveys a work V1 processes", () => {
    const { survey, census } = surveyWork(file, tei(BODY));
    expect(survey.v1).toEqual({ ok: true, category: "OK", detail: "" });
    expect(survey.onboarded).toBe(false);
    expect(survey.fingerprint?.textParts).toEqual(["chapter", "section"]);
    expect(survey.fingerprint?.citableRows).toBe(3);
    expect(survey.fingerprint?.firstCitation).toBe("1.1");
    expect(survey.fingerprint?.lastCitation).toBe("2.1");
    expect(survey.fingerprint?.nodes["span@italic"]).toBe(1);
    expect(survey.checks).toEqual({
      hasCitableRow: true,
      arityOk: true,
      pagesOrdered: true,
      rowsOutsidePages: 0,
    });
    expect(survey.census?.noteRends).toEqual({ "hi@bold": 1 });
    expect(census?.rends).toEqual(["hi@italic", "p@indent"]);
  });

  it("buckets a V1 failure but still takes the census", () => {
    const { survey, census } = surveyWork(
      file,
      tei(BODY.replace("<p>divisa", "<p><unknownThing>divisa</unknownThing>"))
    );
    expect(survey.v1.ok).toBe(false);
    expect(survey.v1.category).not.toBe("OK");
    expect(survey.fingerprint).toBeUndefined();
    expect(census?.elements).toContain("unknownThing");
  });

  it("reports unparseable XML", () => {
    const { survey, census } = surveyWork(file, "not xml");
    expect(survey.v1.category).toBe("xml: parse error");
    expect(survey.parseError).toBeDefined();
    expect(census).toBeUndefined();
  });
});
