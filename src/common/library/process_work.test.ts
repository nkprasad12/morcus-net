import { checkPresent } from "@/common/assert";
import type { LibraryPatch } from "@/common/library/library_patches";
import { WorkPage, type ProcessedWork2 } from "@/common/library/library_types";
import {
  analyzeQuotes,
  assertOutputInvariants,
  divideWork,
  patchText,
  processTei2,
  transformNoteNode,
  type DebugSideChannel,
  type MarkupTextOptions,
} from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { instanceOf } from "@/web/utils/rpc/parsing";

console.debug = jest.fn();

const ENCODING_DESC = `
  <encodingDesc>
    <refsDecl n="CTS">
      <cRefPattern n="Chapter"
        matchPattern="(\\w+).(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1']/tei:div[@n='$2'])">
        <p>This pointer pattern extracts Book and Chapter</p>
      </cRefPattern>
      <cRefPattern n="Book"
        matchPattern="(\\w+)"
        replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1'])">
        <p>This pointer pattern extracts Book</p>
      </cRefPattern>
    </refsDecl>
    <refsDecl>
      <refState unit="book" delim="."/>
      <refState unit="chapter" delim="."/>
      <refState unit="section"/>
    </refsDecl>
  </encodingDesc>
`;

const SECTION_ONLY_ENCODING_DESC = `
  <encodingDesc>
      <refsDecl n="CTS">
        <cRefPattern n="section" matchPattern="(\\w+)" replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1'])"><p>This pointer pattern extracts section</p></cRefPattern>
      </refsDecl>
  </encodingDesc>
`;

function getTeiHeader(encodingDesc: string = ENCODING_DESC) {
  return `<teiHeader xml:lang="eng">
<fileDesc>
<titleStmt>
<title xml:lang="lat">De bello Gallico</title>
<author>Julius Caesar</author>
<editor>T. Rice Holmes</editor>
<sponsor>Perseus Project, Tufts University</sponsor>
<principal>Gregory Crane</principal>
  <respStmt>
  <resp>Prepared under the supervision of</resp>
  <name>Lisa Cerrato</name>
  <name>William Merrill</name>
  <name>David Smith</name>
  </respStmt>
<funder n="org:NEH">The National Endowment for the Humanities</funder>
</titleStmt>
<sourceDesc>
<biblStruct>
<monogr>
<author>Julius Caesar</author>
<title xml:lang="lat">C. Iuli Commentarii Rerum in Gallia Gestarum VII A. Hirti Commentarius VII</title>
<editor>T. Rice Holmes</editor>
<imprint>
<pubPlace>Oxford</pubPlace>
<publisher>Clarendon</publisher>
<date>1914</date>
</imprint>
</monogr>
<series>
<title>Scriptorum Classicorum Bibliotheca Oxoniensis</title>
</series>
<ref target="https://archive.org/details/ciulicaesarisco00caesgoog">Internet Archive</ref>
</biblStruct>
</sourceDesc>
</fileDesc>

${encodingDesc}
</teiHeader>`;
}

function testRoot(body: string, encodingDesc: string = ENCODING_DESC): XmlNode {
  return parseRawXml(
    `<TEI xmlns="http://www.tei-c.org/ns/1.0">
      ${getTeiHeader(encodingDesc)}
      <text>
        <body>${body}</body>
      </text>
    </TEI>`,
    { keepWhitespace: true }
  );
}

function testRootWithNote(noteBody: string): XmlNode {
  return testRoot(
    `<div n="1" type="textpart" subtype="book">${noteBody}</div>`
  );
}

function testRootWithBookAndChapter(content: string): XmlNode {
  return testRoot(
    `<div n="1" type="textpart" subtype="book">
      <div n="1" type="textpart" subtype="chapter">${content}</div>
    </div>`
  );
}

const BODY_WITH_BOOK_ONLY = `<div n="1" type="textpart" subtype="book">Gallia est</div>`;
const BODY_WITH_CHOICE = `<div n="1" type="textpart" subtype="book"><choice><reg>FooBar</reg><orig>BazBap</orig></choice></div>`;
const BODY_WITH_CHOICE_AND_CORR = `<div n="1" type="textpart" subtype="book"><choice><corr>FooBar</corr><orig>BazBap</orig></choice></div>`;
const BODY_WITH_ABBR_AND_EXPAN = `<div n="1" type="textpart" subtype="book"><abbr>orig.<expan>original</expan> </div>`;
const BODY_WITH_NOTES = `<div n="1" type="textpart" subtype="book">Gallia <note>Gaul</note> est<note>is</note></div>`;
const BODY_WITH_TARGET_NOTES = `<div n="1" type="textpart" subtype="book">Gallia <note target="n1"/> est<note target="n2"/><note xml:id="n1">Gaul</note><note xml:id="n2">is</note></div>`;
const WORK_ID = "workId";

describe("processTei2", () => {
  it("gets same result with and without side channel", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    const withSideChannel = processTei2(
      testRoot(BODY_WITH_BOOK_ONLY),
      { workId: WORK_ID },
      {
        sideChannel,
      }
    );
    const withoutSideChannel = processTei2(testRoot(BODY_WITH_BOOK_ONLY), {
      workId: WORK_ID,
    });

    expect(withSideChannel).toStrictEqual(withoutSideChannel);
  });

  it("gets side channel callbacks", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    processTei2(
      testRoot(BODY_WITH_BOOK_ONLY),
      { workId: WORK_ID },
      { sideChannel }
    );

    expect(sideChannel.onWord).toHaveBeenCalledWith("Gallia");
    expect(sideChannel.onWord).toHaveBeenCalledWith("est");
    expect(sideChannel.onWord).toHaveBeenCalledTimes(2);
  });

  it("processes work with leaf level nodes", () => {
    const body = `<div n="1" type="textpart" subtype="book">
      <div n="1" type="textpart" subtype="chapter">First chapter text</div>
      <div n="2" type="textpart" subtype="chapter">Second chapter text</div>
    </div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows).toHaveLength(2);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[0][1].toString()).toContain("First chapter text");
    expect(work.rows[1][1].toString()).toContain("Second chapter text");
  });

  it("processes work with final line group", () => {
    const body = `<div n="1" type="textpart" subtype="book">
      <div n="1" type="textpart" subtype="chapter">First chapter text</div>
      <lg>
        <div n="2" type="textpart" subtype="chapter">Second chapter text</div>
        <div n="3" type="textpart" subtype="chapter">Third chapter text</div>
      </lg>
    </div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows).toHaveLength(4);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[0][1].toString()).toContain("First chapter text");
    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[1][1].toString()).toContain("Second chapter text");
    expect(work.rows[2][0]).toEqual(["1", "3"]);
    expect(work.rows[2][1].toString()).toContain("Third chapter text");
    expect(work.rows[3][0]).toEqual(["1"]);
    expect(XmlNode.assertIsNode(work.rows[3][1]).name).toBe("space");
  });

  it("processes work with split line group", () => {
    const body = `<div n="1" type="textpart" subtype="book">
      <div n="1" type="textpart" subtype="chapter">First chapter text</div>
      <lg>
        <div n="2" type="textpart" subtype="chapter">Second chapter text</div>
      </lg>
      <lg>
        <div n="3" type="textpart" subtype="chapter">Third chapter text</div>
      </lg>
    </div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows).toHaveLength(5);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[0][1].toString()).toContain("First chapter text");

    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[1][1].toString()).toContain("Second chapter text");
    expect(work.rows[2][0]).toEqual(["1"]);
    expect(XmlNode.assertIsNode(work.rows[2][1]).name).toBe("space");

    expect(work.rows[3][0]).toEqual(["1", "3"]);
    expect(work.rows[3][1].toString()).toContain("Third chapter text");
    expect(work.rows[4][0]).toEqual(["1"]);
    expect(XmlNode.assertIsNode(work.rows[4][1]).name).toBe("space");
  });

  it("processes work with non-line group after line group", () => {
    const body = `<div n="1" type="textpart" subtype="book">
      <div n="1" type="textpart" subtype="chapter">First chapter text</div>
      <lg>
        <div n="2" type="textpart" subtype="chapter">Second chapter text</div>
      </lg>
      <div n="3" type="textpart" subtype="chapter">Third chapter text</div>
    </div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows).toHaveLength(4);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[0][1].toString()).toContain("First chapter text");

    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[1][1].toString()).toContain("Second chapter text");
    expect(work.rows[2][0]).toEqual(["1"]);
    expect(XmlNode.assertIsNode(work.rows[2][1]).name).toBe("space");

    expect(work.rows[3][0]).toEqual(["1", "3"]);
    expect(work.rows[3][1].toString()).toContain("Third chapter text");
  });

  it("processes inner lines correctly", () => {
    const body = `<div type="textpart" n="5" subtype="section"><ab><lg>
                    <l>cliensve cenas impotentium captet,</l>
                    <l>nec perditis addictus obruat vino</l>
                  </lg></ab></div>`;

    const work = processTei2(testRoot(body, SECTION_ONLY_ENCODING_DESC), {
      workId: WORK_ID,
    });

    expect(work.rows).toHaveLength(1);
    const section = work.rows[0][1];
    const block = XmlNode.assertIsNode(section.children[0]);
    expect(block.getAttr("block")).toBe("1");
    const lineHolder = XmlNode.assertIsNode(block.children[0]);
    const lines = lineHolder.findChildren("span");
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttr("l")).toBe("1");
    expect(lines[0].toString()).toContain("cliensve cenas impotentium captet,");
    expect(lines[1].getAttr("l")).toBe("1");
    expect(lines[1].toString()).toContain("nec perditis addictus obruat vino");
  });

  it("derives text parts from the tree without a citeStructure", () => {
    // The header declares book > chapter > section, but only books exist.
    const work = processTei2(testRoot(BODY_WITH_BOOK_ONLY), {
      workId: WORK_ID,
    });
    expect(work.textParts).toStrictEqual(["book"]);
    expect(work.rows[0][0]).toEqual(["1"]);
    expect(work.pages).toEqual([{ id: ["1"], rows: [0, 1] }]);
  });

  it("renders supplied text in angle brackets", () => {
    const body = `<div n="1" type="textpart" subtype="book">Do <supplied reason="omitted">not</supplied> go</div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows[0][1].toString()).toContain("⟨not⟩");
  });

  it("reads text parts from upstream's citeStructure refsDecl", () => {
    // Upstream canonical-latinLit (2026) adds this alongside the old two.
    const citeStructure = `
    <refsDecl xml:id="CTS">
      <citeStructure match="/TEI/text/body" use="@xml:base">
        <citeStructure unit="book" match="div/div[@subtype='book']" use="@n">
          <citeStructure unit="chapter" delim="." match="div[@subtype='chapter']" use="@n"/>
        </citeStructure>
      </citeStructure>
    </refsDecl>
  </encodingDesc>`;
    const encodingDesc = ENCODING_DESC.replace(
      "</encodingDesc>",
      citeStructure
    );

    const body = `<div type="edition">
      <div n="1" type="textpart" subtype="book">
        <div n="1" type="textpart" subtype="chapter">Gallia est</div>
      </div>
    </div>`;
    const work = processTei2(testRoot(body, encodingDesc), {
      workId: WORK_ID,
    });

    expect(work.textParts).toStrictEqual(["book", "chapter"]);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
  });

  it("handles elements with choice and reg", () => {
    const work = processTei2(testRoot(BODY_WITH_CHOICE), {
      workId: WORK_ID,
    });
    expect(work.rows[0][1].toString()).toContain("FooBar");
    expect(work.rows[0][1].toString()).not.toContain("BazBap");
  });

  it("handles elements with choice and corr", () => {
    const work = processTei2(testRoot(BODY_WITH_CHOICE_AND_CORR), {
      workId: WORK_ID,
    });
    expect(work.rows[0][1].toString()).toContain("FooBar");
    expect(work.rows[0][1].toString()).not.toContain("BazBap");
  });

  it("handles elements with expan inside abbr", () => {
    const work = processTei2(testRoot(BODY_WITH_ABBR_AND_EXPAN), {
      workId: WORK_ID,
    });
    expect(work.rows[0][1].toString()).toContain("orig.");
    expect(work.rows[0][1].toString()).not.toContain("original");
  });

  it("handles elements with notes", () => {
    const work = processTei2(testRoot(BODY_WITH_NOTES), {
      workId: WORK_ID,
    });
    const root = work.rows[0][1];
    expect(root.children[0]).toBe("Gallia ");
    expect(root.children[2]).toBe(" est");
    const note1 = XmlNode.assertIsNode(root.children[1]);
    expect(note1.getAttr("noteId")).toBe("0");
    expect(note1.children).toHaveLength(0);
    const note2 = XmlNode.assertIsNode(root.children[3]);
    expect(note2.getAttr("noteId")).toBe("1");
    expect(note2.children).toHaveLength(0);

    expect(work.notes).toHaveLength(2);
    expect(work.notes?.[0].toString()).toContain("Gaul");
    expect(work.notes?.[1].toString()).toContain("is");
  });

  it("handles elements with target-type notes", () => {
    const work = processTei2(testRoot(BODY_WITH_TARGET_NOTES), {
      workId: WORK_ID,
    });

    const root = work.rows[0][1];
    expect(root.children[0]).toBe("Gallia ");
    expect(root.children[2]).toBe(" est");
    const note1 = XmlNode.assertIsNode(root.children[1]);
    expect(note1.getAttr("noteId")).toBe("0");
    expect(note1.children).toHaveLength(0);
    const note2 = XmlNode.assertIsNode(root.children[3]);
    expect(note2.getAttr("noteId")).toBe("1");
    expect(note2.children).toHaveLength(0);

    expect(work.notes).toHaveLength(2);
    expect(work.notes?.[0].toString()).toContain("Gaul");
    expect(work.notes?.[1].toString()).toContain("is");
  });

  it("handles note markup for gap", () => {
    const work = processTei2(
      testRootWithNote('<note>text <gap reason="omitted"/> more text</note>'),
      {
        workId: WORK_ID,
      }
    );

    expect(work.notes).toHaveLength(1);
    const noteRoot = XmlNode.assertIsNode(checkPresent(work.notes?.[0]));
    expect(noteRoot.children).toHaveLength(3);
    expect(noteRoot.children[0]).toBe("text ");
    const gapNode = XmlNode.assertIsNode(noteRoot.children[1]);
    expect(gapNode.name).toBe("gap");
    expect(gapNode.children).toEqual([]);
    expect(noteRoot.children[2]).toBe(" more text");
  });

  it("processes list with headLabel", () => {
    const xml = `<div n="1" type="textpart" subtype="book">
                   <list type="simple">
                     <headLabel>Chapter 1</headLabel>
                     <item>Item 1</item>
                     <item>Item 2</item>
                   </list>
                 </div>`;
    const result = processTei2(testRoot(xml), { workId: WORK_ID });

    expect(result.rows).toHaveLength(1);
    const root = XmlNode.assertIsNode(checkPresent(result.rows?.[0][1]));
    const listRoot = checkPresent(root.children.find(instanceOf(XmlNode)));

    expect(listRoot.name).toBe("ul");
    const listChildren = listRoot.children.filter(instanceOf(XmlNode));
    expect(listChildren).toHaveLength(3);
    expect(listChildren[0].name).toBe("li");
    expect(listChildren[0].toString()).toContain("Chapter 1");
    expect(listChildren[1].name).toBe("li");
    expect(listChildren[1].toString()).toContain("Item 1");
    expect(listChildren[2].name).toBe("li");
    expect(listChildren[2].toString()).toContain("Item 2");
  });

  it("converts beta-code in foreign xml:lang=greek to unicode", () => {
    const betacode = "mh=nin";
    const body = `<div n="1" type="textpart" subtype="book"><foreign xml:lang="greek">${betacode}</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows).toHaveLength(1);
    const out = work.rows[0][1].toString();
    // Expect at least one Greek character in the output (Unicode Greek block).
    expect(out).toMatch(/[\u0370-\u03FF]/);
    // Ensure original beta-code is not left in the output.
    expect(out).not.toContain(betacode);
  });

  it("converts beta-code in foreign xml:lang=grc to unicode", () => {
    const body = `<div n="1" type="textpart" subtype="book">dicebant: <foreign xml:lang="grc">Si/bulla, ti/ qe/leis; *promhqeu= DAMAS</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("Σίβυλλα, τί θέλεις; Προμηθεῦ ΔΑΜΑΣ");
    expect(out).toContain("dicebant: ");
  });

  it("converts beta-code inside child nodes of foreign xml:lang=grc", () => {
    const body = `<div n="1" type="textpart" subtype="book"><foreign xml:lang="grc">to\\n a)/ndra <add>ei)</add> gege/nnhtai</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("τὸν ἄνδρα");
    expect(out).toContain("εἰ");
    expect(out).toContain("γεγέννηται");
  });

  it("converts beta-code in quote xml:lang=grc to unicode", () => {
    const body = `<div n="1" type="textpart" subtype="book">inquit: <quote xml:lang="grc">Si/bulla, ti/ qe/leis;</quote></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("Σίβυλλα, τί θέλεις;");
  });

  it("converts beta-code in cit xml:lang=grc to unicode", () => {
    const body = `<div n="1" type="textpart" subtype="book"><cit xml:lang="grc"><quote>lo/gos</quote></cit></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("λόγος");
  });

  it("converts beta-code in quote xml:lang=greek to unicode", () => {
    const body = `<div n="1" type="textpart" subtype="book"><quote xml:lang="greek">lo/gos</quote></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("λόγος");
  });

  it("uses a medial sigma for a lone beta-code sigma", () => {
    const body = `<div n="1" type="textpart" subtype="book">H<foreign xml:lang="grc">s</foreign> et <foreign xml:lang="grc">lo/gos</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    const out = work.rows[0][1].toString();
    expect(out).toContain("σ");
    expect(out).toContain("λόγος");
  });

  it("leaves unicode text in foreign xml:lang=grc unchanged", () => {
    const body = `<div n="1" type="textpart" subtype="book"><foreign xml:lang="grc">κέρας ʼαμαλθείας, a)</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows[0][1].toString()).toContain("κέρας ʼαμαλθείας, a)");
  });

  it("leaves non-letter ascii in foreign xml:lang=grc unchanged", () => {
    const body = `<div n="1" type="textpart" subtype="book"><foreign xml:lang="grc">2, 3</foreign></div>`;

    const work = processTei2(testRoot(body), { workId: WORK_ID });

    expect(work.rows[0][1].toString()).toContain("2, 3");
  });

  it("processes list nodes with label", () => {
    const xml = `<div n="1" type="textpart" subtype="book">
                   <list type="simple">
                     <label>First</label><item>Item 1</item>
                     <item>Item 2</item>
                   </list>
                 </div>`;
    const result = processTei2(testRoot(xml), { workId: WORK_ID });

    expect(result.rows).toHaveLength(1);
    const root = XmlNode.assertIsNode(checkPresent(result.rows?.[0][1]));
    const listRoot = checkPresent(root.children.find(instanceOf(XmlNode)));

    expect(listRoot.name).toBe("ul");
    const listChildren = listRoot.children.filter(instanceOf(XmlNode));
    expect(listChildren).toHaveLength(2);
    expect(listChildren[0].name).toBe("li");
    expect(listChildren[0].toString()).toContain("First");
    expect(listChildren[0].toString()).toContain("Item 1");
    expect(listChildren[1].name).toBe("li");
    expect(listChildren[1].toString()).toContain("Item 2");
  });

  it("raises error on unknown nodes", () => {
    const xml = `<div n="1" type="textpart" subtype="book">
                   <list type="simple">
                     <item>Item 1 <mystery>text</mystery></item>
                     <item>Item 2</item>
                   </list>
                 </div>`;
    expect(() => processTei2(testRoot(xml), { workId: WORK_ID })).toThrow();
  });

  it("processes item nodes with no labels", () => {
    const xml = `<div n="1" type="textpart" subtype="book">
                     <list type="simple">
                       <item>Item 1</item>
                       <item>Item 2</item>
                     </list>
                   </div>`;
    const result = processTei2(testRoot(xml), { workId: WORK_ID });

    expect(result.rows).toHaveLength(1);
    const root = XmlNode.assertIsNode(checkPresent(result.rows?.[0][1]));
    const listRoot = checkPresent(root.children.find(instanceOf(XmlNode)));

    expect(listRoot.name).toBe("ul");
    const listChildren = listRoot.children.filter(instanceOf(XmlNode));
    expect(listChildren).toHaveLength(2);
    expect(listChildren[0].name).toBe("li");
    expect(listChildren[0].toString()).toContain("Item 1");
    expect(listChildren[1].name).toBe("li");
    expect(listChildren[1].toString()).toContain("Item 2");
  });

  it("raises on note with unknown rend", () => {
    expect(() =>
      processTei2(
        testRootWithNote(`<note>text <hi rend="magic">more text</hi></note>`),
        {
          workId: WORK_ID,
        }
      )
    ).toThrow();
  });

  it("handles note with known rend", () => {
    const work = processTei2(
      testRootWithNote(`<note>text <hi rend="italic">more text</hi></note>`),
      {
        workId: WORK_ID,
      }
    );

    expect(work.notes).toHaveLength(1);
    const noteRoot = XmlNode.assertIsNode(checkPresent(work.notes?.[0]));
    expect(noteRoot.children).toHaveLength(2);
    expect(noteRoot.children[0]).toBe("text ");
    const hiNode = XmlNode.assertIsNode(noteRoot.children[1]);
    expect(hiNode.getAttr("rend")).toBe("italic");
    expect(hiNode.children).toEqual(["more text"]);
  });

  it("handles note markup for q", () => {
    const work = processTei2(
      testRootWithNote("<note>text <q>more text</q></note>"),
      {
        workId: WORK_ID,
      }
    );

    expect(work.notes).toHaveLength(1);
    const noteRoot = XmlNode.assertIsNode(checkPresent(work.notes?.[0]));
    expect(noteRoot.children).toHaveLength(2);
    expect(noteRoot.children[0]).toBe("text ");
    const moreText = XmlNode.assertIsNode(noteRoot.children[1]);
    expect(moreText.getAttr("rend")).toBe("italic");
    expect(moreText.children).toEqual(["more text"]);
  });

  it("handles note markup for add", () => {
    const work = processTei2(
      testRootWithNote("<note>text <add>more text</add></note>"),
      {
        workId: WORK_ID,
      }
    );

    expect(work.notes).toHaveLength(1);
    const noteRoot = XmlNode.assertIsNode(checkPresent(work.notes?.[0]));
    expect(noteRoot.children).toHaveLength(2);
    expect(noteRoot.children[0]).toBe("text ");
    expect(XmlNode.assertIsNode(noteRoot.children[1]).children).toEqual([
      "<",
      "more text",
      ">",
    ]);
  });

  it("handles normal leaf section with rend", () => {
    const work = processTei2(
      testRootWithBookAndChapter(
        `<div n="1" type="textpart" subtype="section" rend="indent">Text 1</div>
         <div n="1" type="textpart" subtype="section" rend="ital">Text 2</div>
         <div n="1" type="textpart" subtype="section" rend="italic">Text 3</div>`
      ),
      {
        workId: WORK_ID,
      }
    );

    expect(work.rows?.[0][1].getAttr("rend")).toBe("indent");
    expect(work.rows?.[1][1].getAttr("rend")).toBe("italic");
    expect(work.rows?.[2][1].getAttr("rend")).toBe("italic");
  });
});

describe("patchText", () => {
  function markupTextOptions(
    unhandled: LibraryPatch[],
    handled?: LibraryPatch[]
  ): MarkupTextOptions {
    return {
      unhandledPatches: new Set(unhandled),
      handledPatches: new Set(handled ?? []),
    };
  }

  function patchOf(target: string, replacement: string): LibraryPatch {
    return { target, replacement, location: [], reason: "" };
  }

  it("patches simplest path", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([fooToBar]);
    const rawText = "hi foo";

    const patched = patchText(rawText, options);

    expect(patched).toBe("hi bar");
    expect(options.unhandledPatches?.size).toBe(0);
    expect(options.handledPatches?.size).toBe(1);
    expect(options.handledPatches).toContain(fooToBar);
  });

  it("patches multiple unhandled", () => {
    const fooToBar = patchOf("fooo", "bar");
    const bazToBar = patchOf("baz", "barr");
    const options = markupTextOptions([fooToBar, bazToBar]);
    const rawText = "hi fooobaz hi";

    const patched = patchText(rawText, options);

    expect(patched).toBe("hi barbarr hi");
    expect(options.unhandledPatches?.size).toBe(0);
    expect(options.handledPatches?.size).toBe(2);
    expect(options.handledPatches).toContain(fooToBar);
    expect(options.handledPatches).toContain(bazToBar);
  });

  it("throws on matching handled patches", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([], [fooToBar]);
    const rawText = "hi foo";

    expect(() => patchText(rawText, options)).toThrow(/Duplicate match/);
  });

  it("throws on patch with multiple matches", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([fooToBar]);
    const rawText = "hi foo hi foo";

    expect(() => patchText(rawText, options)).toThrow(/Doubly used/);
  });

  it("throws on overlapping patch", () => {
    const thatToThis = patchOf("that", "this");
    const options = markupTextOptions([thatToThis]);
    const rawText = "hi thathat hi";

    expect(() => patchText(rawText, options)).toThrow(/Overlapping/);
  });
});

describe("divideWork", () => {
  function toRows(ids: string[]): ProcessedWork2["rows"] {
    return ids.map((id) => [
      id.length === 0 ? [] : id.split("."),
      new XmlNode("span"),
    ]);
  }

  it("handles empty rows", () => {
    const rows = toRows([]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toHaveLength(0);
  });

  it("makes a work cited by line alone a single page", () => {
    const rows = toRows(["", "1", "2", "3"]);

    expect(divideWork(rows, ["line"])).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 4] },
    ]);
  });

  it("keeps one page per section for other single-level schemes", () => {
    const rows = toRows(["1", "2"]);

    expect(divideWork(rows, ["section"])).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 1] },
      { id: ["2"], rows: [1, 2] },
    ]);
  });

  it("puts top-level headings before the first page on that page", () => {
    const rows = toRows(["", "", "1", "1.1", "1.2", "2.1"]);

    const pages = divideWork(rows, ["chapter", "section"], new Set([0, 1]));

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 5] },
      { id: ["2"], rows: [5, 6] },
    ]);
  });

  it("leaves a top-level non-heading before the first page off the pages", () => {
    // Livy's index of sigla, then the work's title heading.
    const rows = toRows(["", "", "1.1"]);

    const pages = divideWork(rows, ["chapter", "section"], new Set([1]));

    expect(pages).toStrictEqual<WorkPage[]>([{ id: ["1"], rows: [1, 3] }]);
  });

  it("does not attach top-level headings between pages to the next page", () => {
    const rows = toRows(["1.1", "", "2.1"]);

    const pages = divideWork(rows, ["chapter", "section"], new Set([1]));

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 1] },
      { id: ["2"], rows: [2, 3] },
    ]);
  });

  it("handles clean division", () => {
    const rows = toRows(["1.1", "1.2", "2.1", "2.2"]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 2] },
      { id: ["2"], rows: [2, 4] },
    ]);
  });

  it("handles divisions with headers on sections", () => {
    const rows = toRows(["1.1", "1", "1.2", "2.1", "2.2", "2"]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 3] },
      { id: ["2"], rows: [3, 6] },
    ]);
  });

  it("handles initial top level headers", () => {
    const rows = toRows(["", "1.1", "1.2", "2.1"]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [1, 3] },
      { id: ["2"], rows: [3, 4] },
    ]);
  });

  it("handles middle top level headers", () => {
    const rows = toRows(["1.1", "1.2", "", "2.1"]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 2] },
      { id: ["2"], rows: [3, 4] },
    ]);
  });

  it("handles final top level headers", () => {
    const rows = toRows(["1.1", "1.2", "2.1", ""]);
    const textParts = ["chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1"], rows: [0, 2] },
      { id: ["2"], rows: [2, 3] },
    ]);
  });

  it("includes shallower headings before pagination depth into following page", () => {
    const rows = toRows(["1", "1.1.1", "1.1.2", "1.2.1", "2", "2.1.1"]);
    const textParts = ["book", "chapter", "section"];

    const pages = divideWork(rows, textParts);

    expect(pages).toStrictEqual<WorkPage[]>([
      { id: ["1", "1"], rows: [0, 3] },
      { id: ["1", "2"], rows: [3, 4] },
      { id: ["2", "1"], rows: [4, 6] },
    ]);
  });

  it("raises on malformed sections", () => {
    const rows = toRows(["1.1", "1", "2.1", "2.2", "2", "1.2"]);
    const textParts = ["chapter", "section"];
    expect(() => divideWork(rows, textParts)).toThrow();
  });
});

describe("analyzeQuotes", () => {
  it("detects and raises on unsafe closes", () => {
    const rows: ProcessedWork2["rows"] = [
      [[], new XmlNode("span", [], ["“‘”’”"])],
    ];
    expect(() => analyzeQuotes(rows)).toThrow();
  });

  it("handles combinations of quote types", () => {
    const rows: ProcessedWork2["rows"] = [
      [[], new XmlNode("span", [], ['“‘’”""'])],
    ];
    expect(analyzeQuotes(rows)).toHaveLength(0);
  });

  it("looks across siblings", () => {
    const rows: ProcessedWork2["rows"] = [
      [[], new XmlNode("span", [], ["“‘", '’”""'])],
    ];
    expect(analyzeQuotes(rows)).toHaveLength(0);
  });

  it("does a DFS search", () => {
    const rows: ProcessedWork2["rows"] = [
      [
        [],
        new XmlNode("span", [], ["“‘", new XmlNode("span", [], ["’”"]), '""']),
      ],
    ];
    expect(analyzeQuotes(rows)).toHaveLength(0);
  });

  it("Returns unclosed quotes", () => {
    const rows: ProcessedWork2["rows"] = [
      [[], new XmlNode("span", [], ["“hi", "hello"])],
    ];
    const unclosed = analyzeQuotes(rows);

    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]).toStrictEqual(["“", "“hi"]);
  });
});

describe("transformNoteNode renditions", () => {
  function noteRend(name: string, rend?: string) {
    const attrs: [string, string][] =
      rend === undefined ? [] : [["rend", rend]];
    return transformNoteNode(new XmlNode(name, attrs, ["Bouhier"]));
  }

  it("keeps single-token renditions as before", () => {
    expect(noteRend("hi", "italics").getAttr("rend")).toBe("italic");
    expect(noteRend("hi", "sup").getAttr("rend")).toBe("sup");
    expect(noteRend("hi").getAttr("rend")).toBeUndefined();
  });

  it("accepts upstream's quotation renditions in notes", () => {
    expect(noteRend("hi", "single").getAttr("rend")).toBeUndefined();
    expect(noteRend("hi", "single; italic").getAttr("rend")).toBe("italic");
  });

  it("rejects unknown note renditions", () => {
    expect(() => noteRend("hi", "spacing")).toThrow();
  });

  it("treats an empty note rendition like an absent one", () => {
    expect(noteRend("hi", "").getAttr("rend")).toBeUndefined();
    expect(noteRend("hi", "  ").getAttr("rend")).toBeUndefined();
  });

  it.each([
    ["super", "superscript"],
    ["superscript", "superscript"],
    ["align(raised)", "superscript"],
    ["sub", "subscript"],
    ["subscript", "subscript"],
    ["align(lowered)", "subscript"],
  ])("maps note rendition %s to %s", (rend, emitted) => {
    expect(noteRend("hi", rend).getAttr("rend")).toBe(emitted);
  });

  it.each(["indent", "align(indent)"])(
    "knows but ignores note rendition %s",
    (rend) => {
      expect(noteRend("hi", rend).getAttr("rend")).toBeUndefined();
    }
  );

  it("adds smallcaps to num without dropping overline", () => {
    const result = transformNoteNode(
      new XmlNode("num", [["rend", "overline"]], ["V"])
    );
    const rends = result.attrs.filter(([name]) => name === "rend");
    expect(rends).toHaveLength(1);
    expect(result.getAttr("rend")).toBe("overline smallcaps");
  });

  it("styles unstyled emph as italic in notes", () => {
    const result = transformNoteNode(new XmlNode("emph", [], ["text"]));
    expect(result.getAttr("rend")).toBe("italic");
  });

  it("preserves explicitly styled emph in notes", () => {
    const result = transformNoteNode(
      new XmlNode("emph", [["rend", "bold"]], ["text"])
    );
    expect(result.getAttr("rend")).toBe("bold");
  });
});

describe("transformNoteNode vocabulary", () => {
  function note(xml: string): string {
    return transformNoteNode(parseRawXml(xml)).toString();
  }

  it("drops comments", () => {
    expect(note("<note>a<!-- hidden -->b</note>")).not.toContain("hidden");
  });

  it.each(["p", "head"])("renders %s as a block", (name) => {
    const result = transformNoteNode(new XmlNode(name, [], ["x"]));
    expect(result.getAttr("block")).toBe("1");
  });

  it("renders l as a line, not a block", () => {
    const result = transformNoteNode(new XmlNode("l", [], ["x"]));
    expect(result.getAttr("l")).toBe("1");
    expect(result.getAttr("block")).toBeUndefined();
  });

  it.each([
    ["<choice><sic>teh</sic><corr>the</corr></choice>", "the", "teh"],
    ["<choice><orig>vltra</orig><reg>ultra</reg></choice>", "ultra", "vltra"],
    [
      "<choice><abbr>C.</abbr><expan><ex>Gaius</ex></expan></choice>",
      "C.",
      "Gaius",
    ],
    [
      "<choice><expan><abbr>acturu's</abbr><ex>acturus es</ex></expan></choice>",
      "acturu's",
      "acturus es",
    ],
  ])("picks the chosen form of %s", (xml, shown, hidden) => {
    const result = note(`<note>${xml}</note>`);
    expect(result).toContain(shown);
    expect(result).not.toContain(hidden);
  });

  it("drops the expansion inside an abbr", () => {
    const result = note(
      "<note><abbr><expan><ex>Gaio</ex></expan>C.</abbr></note>"
    );
    expect(result).toContain("C.");
    expect(result).not.toContain("Gaio");
  });

  it("capitalizes a standalone reg, as in the text", () => {
    expect(note("<note>ed. <reg>cobet</reg></note>")).toContain("Cobet");
  });

  it("does not capitalize a reg chosen from a choice", () => {
    const result = note(
      "<note><choice><orig>vltra</orig><reg>ultra</reg></choice></note>"
    );
    expect(result).toContain("ultra");
    expect(result).not.toContain("Ultra");
  });

  it("validates the branches of a choice that are not shown", () => {
    expect(() =>
      note("<note><choice><corr>a</corr><bogus>b</bogus></choice></note>")
    ).toThrow(/bogus/);
    expect(() =>
      note(
        '<note><choice><corr>a</corr><sic rend="inddent">b</sic></choice></note>'
      )
    ).toThrow(/inddent/);
  });

  it("validates the expansion dropped from an abbr", () => {
    expect(() =>
      note("<note><abbr><expan><bogus>Gaio</bogus></expan>C.</abbr></note>")
    ).toThrow(/bogus/);
  });

  it("drops whitespace with the expansion of an abbr", () => {
    const result = transformNoteNode(
      parseRawXml("<abbr> <expan><ex>Gaio</ex></expan>C. </abbr>", {
        keepWhitespace: true,
      })
    );
    expect(result.children).toEqual(["C. "]);
  });

  it("removes comments rather than leaving empty elements", () => {
    const result = transformNoteNode(
      parseRawXml("<note><hi>a</hi><!-- c --><hi>b</hi></note>")
    );
    expect(result.children).toHaveLength(2);
  });

  it("removes pb rather than leaving empty elements", () => {
    const result = transformNoteNode(
      parseRawXml("<note><hi>LO</hi><pb/><hi>L</hi></note>")
    );
    expect(result.children).toHaveLength(2);
    expect(result.children.map((c) => (c as XmlNode).name)).toEqual([
      "span",
      "span",
    ]);
  });

  it("brackets supplied text", () => {
    expect(note("<note>a<supplied>b</supplied></note>")).toContain("⟨b⟩");
  });

  it.each([
    "name",
    "forename",
    "addName",
    "genName",
    "corr",
    "sic",
    "orig",
    "seg",
    "ex",
  ])("renders %s as plain text", (name) => {
    const result = transformNoteNode(new XmlNode(name, [], ["x"]));
    expect(result.name).toBe("span");
    expect(result.children).toEqual(["x"]);
  });
});

describe("Phase 1 markup in the text", () => {
  function inSection(content: string): string {
    return `<div n="1" type="textpart" subtype="section">${content}</div>`;
  }

  function onlyRow(body: string): XmlNode {
    const work = processTei2(testRootWithNote(body), { workId: WORK_ID });
    expect(work.rows).toHaveLength(1);
    return work.rows[0][1];
  }

  function findAll(root: XmlNode, pred: (n: XmlNode) => boolean): XmlNode[] {
    const found = pred(root) ? [root] : [];
    for (const child of root.children) {
      if (typeof child !== "string") found.push(...findAll(child, pred));
    }
    return found;
  }

  it.each([
    ["bold", "bold"],
    ["sup", "sup"],
    ["super", "sup"],
    ["superscript", "sup"],
  ])("renders hi@%s in body text as %s", (rend, emitted) => {
    const row = onlyRow(`a <hi rend="${rend}">b</hi> c`);
    const hi = findAll(row, (n) => n.getAttr("rendParent") === "hi");
    expect(hi).toHaveLength(1);
    expect(hi[0].getAttr("rend")).toBe(emitted);
  });

  it("treats an empty rend as absent", () => {
    const row = onlyRow(`a <hi rend="">b</hi> <hi rend=" ">c</hi>`);
    expect(findAll(row, (n) => n.getAttr("rend") !== undefined)).toEqual([]);
    expect(row.toString()).toContain("b");
  });

  it("marks continued half-lines of split verse lines", () => {
    const body = `<l part="I">Quid ais?</l><l part="F">Nihil.</l><l part="M">Tace.</l><l part="N">Totus.</l><l part="Y">Dimidius</l><l>Plenus.</l>`;
    const work = processTei2(testRootWithBookAndChapter(inSection(body)), {
      workId: WORK_ID,
    });
    const lines = work.rows.flatMap(([_, root]) =>
      findAll(root, (n) => n.getAttr("l") === "1")
    );
    expect(lines.map((l) => l.getAttr("linePart"))).toEqual([
      undefined,
      "F",
      "M",
      undefined,
      undefined,
      undefined,
    ]);
    // An indent rendition would also change the corpus text.
    expect(lines.map((l) => l.getAttr("rend"))).toEqual(
      lines.map(() => undefined)
    );
  });

  it("rejects unknown l@part values", () => {
    expect(() =>
      processTei2(testRootWithBookAndChapter(inSection(`<l part="X">a</l>`)), {
        workId: WORK_ID,
      })
    ).toThrow(/part="X"/);
  });

  it.each(["forename", "addName", "genName"])(
    "renders name part %s as plain text",
    (name) => {
      const row = onlyRow(`<persName><${name}>Gaius</${name}></persName> est`);
      expect(row.toString()).toContain("Gaius");
    }
  );

  it("shows the abbreviation in choice/abbr/expan (Cicero)", () => {
    const row = onlyRow(
      `<choice><abbr>L.</abbr><expan><ex>Lucius</ex></expan></choice> Sulla`
    );
    expect(row.toString()).toContain("L.");
    expect(row.toString()).not.toContain("Lucius");
  });

  it("shows the abbreviation in choice/expan/abbr (Plautus)", () => {
    const row = onlyRow(
      `<choice><expan><abbr>acturu's</abbr><ex>acturus es</ex></expan></choice> age.`
    );
    expect(row.toString()).toContain("acturu's");
    expect(row.toString()).not.toContain("acturus es");
  });

  it.each([
    ["<abbr><expan><ex>Gaio</ex></expan>C.</abbr> Mario", "C.", "Gaio"],
    ["<abbr>L.<expan><ex>Lucium</ex></expan></abbr> Domitium", "L.", "Lucium"],
    ["<abbr> <expan><ex>Gaio</ex></expan>C. </abbr>", "C. ", "Gaio"],
  ])("drops the expan inside abbr in %s", (xml, shown, hidden) => {
    const row = onlyRow(xml);
    const abbr = findAll(
      row,
      (n) => n.name === "span" && n.toString().includes(shown.trim())
    );
    expect(abbr.length).toBeGreaterThan(0);
    expect(row.toString()).not.toContain(hidden);
  });

  it("keeps the flush rendering of a lone abbr/expan with trailing space", () => {
    const row = onlyRow(`<abbr>L.<expan>Lucium</expan> </abbr>x`);
    expect(row.toString()).toContain("L.</span>x");
  });

  it("shows the abbreviation in a bare expan/abbr (Cicero speeches)", () => {
    const row = onlyRow(
      `<p><expan><abbr>L.</abbr><ex>Lucium</ex></expan> Sullam</p>`
    );
    expect(row.toString()).toContain("L.");
    expect(row.toString()).not.toContain("Lucium");
  });

  it("rejects a bare abbr outside choice or expan", () => {
    expect(() => onlyRow(`<abbr>L.</abbr>`)).toThrow();
  });

  it("marks sibling paragraphs with block=1", () => {
    const row = onlyRow(`<p>First paragraph</p><p>Second paragraph</p>`);
    const ps = findAll(row, (n) => n.getAttr("block") === "1");
    expect(ps).toHaveLength(2);
    expect(ps[0].toString()).toContain("First paragraph");
    expect(ps[1].toString()).toContain("Second paragraph");
  });

  it("suppresses quotes on quote with align(blockquote)", () => {
    const row = onlyRow(`<quote rend="align(blockquote)">content</quote>`);
    expect(row.toString()).not.toContain("“");
    expect(row.toString()).not.toContain("”");
    expect(row.toString()).toContain("content");
  });

  it("strips leading br elements in blockquotes while preserving internal ones", () => {
    const rowWithInternal = onlyRow(
      `<quote rend="blockquote"><lb/>first line<lb/>second line</quote>`
    );
    expect(rowWithInternal.toString()).toBe(
      `<span><span rend="blockquote" rendParent="quote">first line<br></br>second line</span></span>`
    );

    const rowWithMultipleLeading = onlyRow(
      `<quote rend="blockquote"> <lb/> <lb/>first line</quote>`
    );
    expect(rowWithMultipleLeading.toString()).toBe(
      `<span><span rend="blockquote" rendParent="quote">first line</span></span>`
    );
  });

  it("keeps quotes on quote with rend=merge (treated as no-op)", () => {
    const row = onlyRow(`<quote rend="merge">content</quote>`);
    expect(row.toString()).toContain("“");
    expect(row.toString()).toContain("”");
    expect(row.toString()).toContain("content");
  });

  it("keeps quotes on quote with ordinary rendition", () => {
    const row = onlyRow(`<quote rend="italic">content</quote>`);
    expect(row.toString()).toContain("“");
    expect(row.toString()).toContain("”");
  });
});

describe("note n/target pairing", () => {
  function process(body: string) {
    return processTei2(testRootWithNote(body), { workId: WORK_ID });
  }

  it("pairs <note target> with a later <note n> body (Historia Augusta)", () => {
    const work = process(
      `Gallia <note target="n1.1"/> est <note n="n1.1">dudum Peter</note>`
    );
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("dudum Peter"),
    ]);
    const row = work.rows[0][1].toString();
    expect(row).not.toContain("dudum Peter");
  });

  it("pairs a <note n> body that comes before its target", () => {
    const work = process(
      `<note n="a">first body</note>Gallia <note target="a"/> est`
    );
    expect(work.notes).toHaveLength(1);
    expect(work.notes?.[0].toString()).toContain("first body");
  });

  it("strips a leading # from the target", () => {
    const work = process(
      `Gallia <note target="#n2"/> est <note xml:id="n2">by id</note> <note target="#n3"/><note n="n3">by n</note>`
    );
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("by id"),
      expect.stringContaining("by n"),
    ]);
  });

  it("prefers xml:id over n", () => {
    const work = process(
      `a <note target="x"/> <note xml:id="x">by id</note> <note n="x">by n</note>`
    );
    // The target resolves to `xml:id`, and `<note n="x">` stays an inline note.
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("by id"),
      expect.stringContaining("by n"),
    ]);
  });

  it("fails on duplicate xml:id note bodies", () => {
    expect(() =>
      process(
        `a <note target="d"/> <note xml:id="d">one</note><note xml:id="d">two</note>`
      )
    ).toThrow(/Duplicate/);
  });

  it("fails on an inline note body", () => {
    expect(() =>
      process(`a <note target="i"/> <note n="i" place="inline">Lucullus</note>`)
    ).toThrow('Inline note (place="inline")');
  });

  it("fails on unknown note body attributes", () => {
    expect(() =>
      process(`a <note target="i"/> <note xml:id="i" bogus="1">body</note>`)
    ).toThrow(/bogus/);
  });

  it("keeps unreferenced <note n> as ordinary inline notes", () => {
    const work = process(`Gallia <note n="1">inline</note> est`);
    expect(work.notes).toHaveLength(1);
    expect(work.notes?.[0].toString()).toContain("inline");
    const marker = (work.rows[0][1].children as XmlNode[]).find(
      (c) => typeof c !== "string" && c.name === "note"
    );
    expect(marker?.getAttr("noteId")).toBe("0");
  });

  it("keeps unreferenced <note xml:id> as ordinary inline notes (Ex Ponto)", () => {
    const work = process(
      `Gallia <note xml:id="note.1">first</note> est <note xml:id="note.2">second</note>`
    );
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("first"),
      expect.stringContaining("second"),
    ]);
    const markers = (work.rows[0][1].children as XmlNode[]).filter(
      (c) => typeof c !== "string" && c.name === "note"
    );
    expect(markers.map((m) => m.getAttr("noteId"))).toEqual(["0", "1"]);
  });

  it("keeps a <note xml:id> that no target names as an inline note", () => {
    const work = process(
      `a <note target="#t"/> b <note xml:id="t">body</note> c <note xml:id="u">orphan</note>`
    );
    // The body is detached and paired with its target, which comes first;
    // the orphan (its anchor lost upstream) stays where it stands.
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("body"),
      expect.stringContaining("orphan"),
    ]);
    const row = work.rows[0][1].toString();
    expect(row).not.toContain("body");
    expect(row).not.toContain("orphan");
    expect(row).toContain('noteId="1"');
  });

  it("allows the same body to be referenced twice", () => {
    const work = process(
      `a <note target="n"/> b <note target="n"/> <note n="n">twice</note>`
    );
    expect(work.notes).toHaveLength(2);
  });

  it("fails on a dangling target", () => {
    expect(() => process(`a <note target="missing"/>`)).toThrow(/missing/);
  });

  it("fails on duplicate <note n> bodies for one target", () => {
    expect(() =>
      process(
        `a <note target="d"/> <note n="d">one</note><note n="d">two</note>`
      )
    ).toThrow(/Duplicate/);
  });
});

describe("inline notes", () => {
  it("fails loudly on note@place=inline", () => {
    expect(() =>
      processTei2(
        testRootWithNote(`<note place="inline">Lucullus</note> dixit`),
        { workId: WORK_ID }
      )
    ).toThrow(
      'Inline note (place="inline") is not yet supported as a footnote'
    );
  });

  it("still accepts other placements", () => {
    const work = processTei2(
      testRootWithNote(`a <note place="foot">foot</note> b`),
      { workId: WORK_ID }
    );
    expect(work.notes).toHaveLength(1);
  });
});

describe("processTei2 with citeStructure point levels", () => {
  function citeStructureDesc(levels: string): string {
    return `<encodingDesc>
      <refsDecl xml:id="CTS">
        <citeStructure match="/TEI/text/body" use="@xml:base">${levels}</citeStructure>
      </refsDecl>
    </encodingDesc>`;
  }

  it("cites milestone spans inside paragraphs, keeping notes in order", () => {
    const encoding = citeStructureDesc(`
      <citeStructure unit="book" match="div1[@type='book']" use="@n">
        <citeStructure unit="chapter" match=".//milestone[@unit='chapter']" use="@n"/>
      </citeStructure>`);
    const body = `<div1 type="book" n="1"><head>LIBER I</head>
      <milestone n="1" unit="chapter"/><p>Urbem<note>first</note> Romam
      <milestone n="2" unit="chapter"/>Postquam<note>second</note></p>
      <p>Igitur</p>
    </div1>`;

    const work = processTei2(testRoot(body, encoding), { workId: WORK_ID });

    expect(work.textParts).toStrictEqual(["book", "chapter"]);
    expect(work.rows.map(([id]) => id.join("."))).toStrictEqual([
      "1",
      "1.1",
      "1.2",
    ]);
    expect(work.rows[0][1].toString()).toContain("LIBER I");
    const first = work.rows[1][1].toString();
    const second = work.rows[2][1].toString();
    expect(first).toContain("Urbem");
    expect(first).toContain('noteId="0"');
    expect(first).not.toContain("Postquam");
    expect(second).toContain("Postquam");
    expect(second).toContain('noteId="1"');
    expect(second).toContain("Igitur");
    expect(work.notes?.map((n) => n.toString())).toStrictEqual([
      "<span>first</span>",
      "<span>second</span>",
    ]);
    expect(work.pages).toStrictEqual([{ id: ["1"], rows: [0, 3] }]);
  });

  it("cites lines marked by <lb n> rather than rendering line breaks", () => {
    const encoding = citeStructureDesc(
      `<citeStructure unit="line" match=".//lb" use="@n"/>`
    );
    const body = `<head>Dirae</head><p>
<lb n="1"/>Battare, cycneas
<lb n="2"/>diuisas iterum
</p>`;

    const work = processTei2(testRoot(body, encoding), { workId: WORK_ID });

    expect(work.textParts).toStrictEqual(["line"]);
    expect(work.rows.map(([id]) => id.join("."))).toStrictEqual(["", "1", "2"]);
    expect(work.rows[1][1].toString()).toContain("Battare, cycneas");
    expect(work.rows[2][1].toString()).toContain("diuisas iterum");
    expect(work.rows.map(([, row]) => row.toString()).join("")).not.toContain(
      "<br>"
    );
  });

  it("ignores upstream's unnamed chunking levels", () => {
    const encoding = citeStructureDesc(`
      <citeStructure use="@n" match="milestone[@unit='card']" n="chunk"/>
      <citeStructure unit="line" match=".//l" use="@n"/>`);
    const body = `<milestone unit="card" n="1"/><l n="1">a</l><l n="2">b</l>`;

    const work = processTei2(testRoot(body, encoding), { workId: WORK_ID });

    expect(work.textParts).toStrictEqual(["line"]);
    expect(work.rows.map(([id]) => id.join("."))).toStrictEqual(["1", "2"]);
  });

  it("names an unnamed level with levels below it after its elements", () => {
    const encoding = citeStructureDesc(`
      <citeStructure use="@n" match="div[@type]" n="chunk">
        <citeStructure unit="line" match="l" use="@n"/>
      </citeStructure>`);
    const body = `<div type="edition">
      <div type="prologue" n="pr"><l n="1">a</l></div>
      <div type="satire" n="1"><l n="1">b</l></div>
      <div type="satire" n="2"><l n="1">c</l></div>
    </div>`;

    const work = processTei2(testRoot(body, encoding), { workId: WORK_ID });

    expect(work.textParts).toStrictEqual(["satire", "line"]);
    expect(work.rows.map(([id]) => id.join("."))).toStrictEqual([
      "pr.1",
      "1.1",
      "2.1",
    ]);
  });

  it("fails on a work with no citable structure", () => {
    expect(() =>
      processTei2(testRoot(`<p>No divisions at all</p>`), { workId: WORK_ID })
    ).toThrow(/No citation levels/);
  });
});

describe("Phase 2B markup and notes", () => {
  function inSection(content: string): string {
    return `<div n="1" type="textpart" subtype="section">${content}</div>`;
  }

  function process(body: string) {
    return processTei2(testRootWithNote(body), { workId: WORK_ID });
  }

  it("renders a body <title> inline in italics, not as a heading", () => {
    const row = process(
      inSection(`<p>qui <title>Halieutica</title> scripsit</p>`)
    ).rows[0][1].toString();
    expect(row).not.toContain("sectionHead");
    expect(row).toMatch(/rend="italic"[^>]*>Halieutica</);
  });

  it("marks prose paragraphs for the reader", () => {
    const row = process(inSection(`<p>prose</p>`)).rows[0][1];
    expect(row.toString()).toContain('para="1"');
  });

  it("sets indirect discourse (q@undirect) without quotation marks", () => {
    const row = process(
      inSection(`<p>ut <q rend="undirect">si aequalia</q> dicas</p>`)
    ).rows[0][1].toString();
    expect(row).toContain("si aequalia");
    expect(row).not.toContain("“");
  });

  it("converts Beta Code in <foreign lang='greek'> (no xml: prefix)", () => {
    const row = process(
      inSection(`<p>vinum <foreign lang="greek">pnhi/on</foreign></p>`)
    ).rows[0][1].toString();
    expect(row).not.toContain("pnhi/on");
    expect(row).toMatch(/[\u0370-\u03ff\u1f00-\u1fff]/);
  });

  it("leaves Unicode Greek in <foreign xml:lang='greek'> unchanged", () => {
    const row = process(
      inSection(`<p><foreign xml:lang="greek">γνῶθι σεαυτόν</foreign></p>`)
    ).rows[0][1].toString();
    expect(row).toContain("γνῶθι σεαυτόν");
  });

  it("drops empty notes and OCR'd marginal line numbers", () => {
    const work = process(
      inSection(
        `<p>a <note n="3"/> b <note n="marg ">35</note> c <note n="marg">see 35</note></p>`
      )
    );
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("see 35"),
    ]);
  });

  it("shows a reference carried in an empty note's @n (Tertullian)", () => {
    const work = process(
      inSection(`<p>nubere in domino <note n="I Cor. VII, 39."/> licet</p>`)
    );
    expect(work.notes?.map((n) => n.toString())).toEqual([
      expect.stringContaining("I Cor. VII, 39."),
    ]);
  });

  it("puts a docAuthor byline as a heading on the first page", () => {
    const work = processTei2(
      testRoot(`<docAuthor>Flavius Vopiscus</docAuthor>${BODY_WITH_BOOK_ONLY}`),
      { workId: WORK_ID }
    );
    expect(work.rows[0][0]).toEqual([]);
    expect(work.rows[0][1].name).toBe("head");
    expect(work.pages[0].rows[0]).toBe(0);
  });
});

describe("assertOutputInvariants", () => {
  const row = (id: string): ProcessedWork2["rows"][number] => [
    id.length === 0 ? [] : id.split("."),
    new XmlNode("span", [], ["x"]),
  ];

  it("accepts a well-formed work", () => {
    const rows = [row("1"), row("1.1"), row("1.2"), row("2.1")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: divideWork(rows, ["book", "chapter"]),
      })
    ).not.toThrow();
  });

  it("rejects a citation that occurs in two places (Cato's two chapter 1s)", () => {
    const rows = [row("1.1"), row("1.2"), row("1.1")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 3] }],
      })
    ).toThrow(/Citation 1.1 occurs twice/);
  });

  it("accepts a citation spread over consecutive rows", () => {
    const rows = [row("1.1"), row("1.1"), row("1.2")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 3] }],
      })
    ).not.toThrow();
  });

  it("requires a citable row", () => {
    const rows = [row("1"), row("2")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 2] }],
      })
    ).toThrow(/No citable rows/);
  });

  it("rejects malformed ids", () => {
    const rows: ProcessedWork2["rows"] = [
      [["1", ""], new XmlNode("span")],
      row("1.2"),
    ];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 2] }],
      })
    ).toThrow(/Malformed row id/);
  });

  it("requires pages", () => {
    expect(() =>
      assertOutputInvariants({
        rows: [row("1")],
        textParts: ["section"],
        pages: [],
      })
    ).toThrow(/No pages/);
  });

  it("requires every citable row to be on a page", () => {
    const rows = [row("1.1"), row("2.1")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 1] }],
      })
    ).toThrow(/Citable row 2.1 is on no page/);
  });

  it("requires unique page ids", () => {
    const rows = [row("1.1"), row("1.2")];
    expect(() =>
      assertOutputInvariants({
        rows,
        textParts: ["book", "chapter"],
        pages: [
          { id: ["1"], rows: [0, 1] },
          { id: ["1"], rows: [1, 2] },
        ],
      })
    ).toThrow(/Duplicate page ids/);
  });

  it("is enforced by divideWork for non-contiguous sections", () => {
    const rows = [row("1.1"), row("2.1"), row("1.2")];
    expect(() => divideWork(rows, ["book", "chapter"])).toThrow(
      /Duplicate page id 1/
    );
  });
});

describe("assertOutputInvariants text on no page", () => {
  const row = (id: string, text = "x"): ProcessedWork2["rows"][number] => [
    id.length === 0 ? [] : id.split("."),
    new XmlNode("span", [], [text]),
  ];
  const textParts = ["book", "chapter", "section"];
  const check = (
    rows: ProcessedWork2["rows"],
    facts?: Parameters<typeof assertOutputInvariants>[1]
  ) =>
    assertOutputInvariants(
      { rows, textParts, pages: divideWork(rows, textParts) },
      facts
    );

  it("allows a book's preamble before its first page", () => {
    expect(() =>
      check([row("1.1.1"), row("2", "salutem"), row("2.1.1")])
    ).not.toThrow();
  });

  it("allows top-level matter before the first page", () => {
    expect(() => check([row("", "Argument"), row("1.1.1")])).not.toThrow();
  });

  it("rejects text after its section's pages", () => {
    expect(() =>
      check([row("1.1.1"), row("1", "stray"), row("2.1.1")])
    ).toThrow(/Text on no page at 1: <span>stray<\/span>/);
    expect(() => check([row("1.1.1"), row("", "stray")])).toThrow(
      /Text on no page at \(top level\)/
    );
  });

  it("allows editorial rows and leaf sections anywhere", () => {
    const rows = [row("1.1.1"), row("", "Index"), row("46", "summary")];
    expect(() => check(rows)).toThrow(/Text on no page/);
    expect(() =>
      check(rows, { editorialRows: new Set([1]), leafIds: new Set(["46"]) })
    ).not.toThrow();
  });

  it("rejects rows deeper than the scheme", () => {
    expect(() =>
      assertOutputInvariants({
        rows: [row("1.1"), row("1.2.1")],
        textParts: ["book", "chapter"],
        pages: [{ id: ["1"], rows: [0, 2] }],
      })
    ).toThrow(/Ragged citation depth: 1.2.1 is deeper than book.chapter/);
  });
});

describe("processTei2 coverage of text", () => {
  it("fails a work whose sections leave text off every page", () => {
    // Pages are chapters; text in book 2 after its chapter is on none.
    const section = (n: string, text: string) =>
      `<div n="${n}" type="textpart" subtype="section"><p>${text}</p></div>`;
    const body = `<div n="1" type="textpart" subtype="book">
        <div n="1" type="textpart" subtype="chapter">${section("1", "a")}</div>
      </div>
      <div n="2" type="textpart" subtype="book"><head>II</head><p>preamble</p>
        <div n="1" type="textpart" subtype="chapter">${section("1", "b")}</div>
        <p>lost text</p>
      </div>`;
    expect(() => processTei2(testRoot(body), { workId: WORK_ID })).toThrow(
      /Text on no page at 2: .*lost text/
    );
  });

  it("keeps editorial matter off the pages (Livy's index)", () => {
    const body = `<div type="textpart" subtype="index"><head>Index</head><p>V = Veronensis</p></div>
      <div n="1" type="textpart" subtype="book">
        <div n="1" type="textpart" subtype="chapter">a</div>
      </div>
      <div type="textpart" subtype="index"><p>M = Mediceus</p></div>
      <div n="2" type="textpart" subtype="book">
        <div n="1" type="textpart" subtype="chapter">b</div>
      </div>`;
    const work = processTei2(testRoot(body), { workId: WORK_ID });
    expect(work.pages.map((p) => p.id.join("."))).toEqual(["1", "2"]);
  });
});
