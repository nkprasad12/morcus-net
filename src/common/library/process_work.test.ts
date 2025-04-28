import { checkPresent } from "@/common/assert";
import { LatinWorks } from "@/common/library/library_constants";
import type { LibraryPatch } from "@/common/library/library_patches";
import { WorkPage, type ProcessedWork2 } from "@/common/library/library_types";
import {
  analyzeQuotes,
  divideWork,
  getSectionId,
  patchText,
  processTei2,
  type DebugSideChannel,
  type MarkupTextOptions,
} from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { instanceOf } from "@/web/utils/rpc/parsing";

console.debug = jest.fn();

const TEI_HEADER = `
<teiHeader xml:lang="eng">
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
</teiHeader>`;

function testRoot(body: string): XmlNode {
  return parseRawXml(
    `<TEI xmlns="http://www.tei-c.org/ns/1.0">
      ${TEI_HEADER}
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
const BODY_WITH_NOTES = `<div n="1" type="textpart" subtype="book">Gallia <note>Gaul</note> est<note>is</note></div>`;
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

  it("parses expected text parts", () => {
    const work = processTei2(testRoot(BODY_WITH_BOOK_ONLY), {
      workId: WORK_ID,
    });
    expect(work.textParts).toStrictEqual(["book", "chapter", "section"]);
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
    expect(XmlNode.assertIsNode(noteRoot.children[1]).children[0]).toContain(
      "[gap]"
    );
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

describe("getSectionId", () => {
  const BOOK = [
    ["type", "textpart"],
    ["subtype", "book"],
  ] satisfies XmlNode["attrs"];
  const CHAPTER = [
    ["type", "textpart"],
    ["subtype", "chapter"],
  ] satisfies XmlNode["attrs"];

  function book(n: string): XmlNode["attrs"] {
    return [...BOOK, ["n", n]];
  }

  function chapter(n: string): XmlNode["attrs"] {
    return [...CHAPTER, ["n", n]];
  }

  function toNodes(attrs: XmlNode["attrs"][]): XmlNode[] {
    return attrs.map((a) => new XmlNode("span", a, []));
  }

  it("handles empty stack", () => {
    expect(getSectionId([], ["book", "chapter"])).toStrictEqual([[], false]);
  });

  it("handles no subtypes on parent section", () => {
    expect(
      getSectionId(
        [
          new XmlNode("span", [
            ["type", "book"],
            ["n", "3"],
          ]),
        ],
        ["book", "chapter"],
        LatinWorks.TACITUS_DIALOGUS
      )
    ).toStrictEqual([["3"], true]);
  });

  it("handles no subtypes on non-parent section", () => {
    expect(
      getSectionId(
        [
          new XmlNode("span", [
            ["type", "book"],
            ["n", "3"],
          ]),
          new XmlNode("span"),
        ],
        ["book", "chapter"],
        LatinWorks.TACITUS_DIALOGUS
      )
    ).toStrictEqual([["3"], false]);
  });

  it("handles no subtypes on leaf section", () => {
    expect(
      getSectionId(
        [
          new XmlNode("span", [
            ["type", "book"],
            ["n", "3"],
          ]),
          new XmlNode("span"),
          new XmlNode("span", [
            ["type", "chapter"],
            ["n", "14"],
          ]),
        ],
        ["book", "chapter"],
        LatinWorks.TACITUS_DIALOGUS
      )
    ).toStrictEqual([["3", "14"], true]);
  });

  it("handles leaf section", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([book("2"), chapter("1")]);

    expect(getSectionId(nodes, textParts)).toStrictEqual([["2", "1"], true]);
  });

  it("handles seg", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([book("2")]).concat(
      new XmlNode("seg", [
        ["type", "chapter"],
        ["n", "1"],
      ])
    );

    expect(getSectionId(nodes, textParts)).toStrictEqual([["2", "1"], true]);
  });

  it("handles l with no id due to gap", () => {
    const textParts = ["book", "line"];
    const nodes = toNodes([book("2")]).concat(
      new XmlNode("l", [], [new XmlNode("gap")])
    );

    expect(
      getSectionId(nodes, textParts, "phi0550.phi001.perseus-lat1")
    ).toStrictEqual([["2"], false]);
  });

  it("raises on bad order", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([chapter("1"), book("2")]);

    expect(() => getSectionId(nodes, textParts)).toThrow();
  });

  it("raises on unexpected section", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([book("1"), book("2")]);

    expect(() => getSectionId(nodes, textParts)).toThrow();
  });

  it("handles leaf section with intermediate nodes", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([book("2"), [], chapter("1")]);

    expect(getSectionId(nodes, textParts)).toStrictEqual([["2", "1"], true]);
  });

  it("handles leaf node without section", () => {
    const textParts = ["book", "chapter"];
    const nodes = toNodes([book("2"), [], chapter("1"), []]);

    expect(getSectionId(nodes, textParts)).toStrictEqual([["2", "1"], false]);
  });
});
