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
			<cRefPattern n="Section"
				matchPattern="(\\w+).(\\w+).(\\w+)"
				replacementPattern="#xpath(/tei:TEI/tei:text/tei:body/tei:div/tei:div[@n='$1']/tei:div[@n='$2']/tei:div[@n='$3'])">
				<p>This pointer pattern extracts Book and Chapter and Section</p>
			</cRefPattern>
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

const BODY_WITH_BOOK_ONLY = `<div n="1" type="textpart" subtype="book">Gallia est</div>`;
const BODY_WITH_CHOICE = `<div n="1" type="textpart" subtype="book"><choice><reg>FooBar</reg><orig>BazBap</orig></choice></div>`;
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

  it("parses expected text parts", () => {
    const work = processTei2(testRoot(BODY_WITH_BOOK_ONLY), {
      workId: WORK_ID,
    });
    expect(work.textParts).toStrictEqual(["book", "chapter", "section"]);
  });

  it("handles elements with choice", () => {
    const work = processTei2(testRoot(BODY_WITH_CHOICE), {
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
    expect(XmlNode.assertIsNode(root.children[1]).getAttr("noteId")).toBe("0");
    expect(root.children[2]).toBe(" est");
    expect(XmlNode.assertIsNode(root.children[3]).getAttr("noteId")).toBe("1");

    expect(work.notes).toHaveLength(2);
    expect(work.notes?.[0].toString()).toContain("Gaul");
    expect(work.notes?.[1].toString()).toContain("is");
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
