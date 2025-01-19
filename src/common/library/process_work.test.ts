import type { LibraryPatch } from "@/common/library/library_patches";
import { WorkPage, type ProcessedWork2 } from "@/common/library/library_types";
import {
  analyzeQuotes,
  divideWork,
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
    </TEI>`
  );
}

const BODY_WITH_BOOK_ONLY = `<div n="1" type="textpart" subtype="book">Gallia est</div>`;

describe("processTei2", () => {
  it("gets same result with and without side channel", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    const withSideChannel = processTei2(testRoot(BODY_WITH_BOOK_ONLY), {
      sideChannel,
    });
    const withoutSideChannel = processTei2(testRoot(BODY_WITH_BOOK_ONLY));

    expect(withSideChannel).toStrictEqual(withoutSideChannel);
  });

  it("gets side channel callbacks", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    processTei2(testRoot(BODY_WITH_BOOK_ONLY), { sideChannel });

    expect(sideChannel.onWord).toHaveBeenCalledWith("Gallia");
    expect(sideChannel.onWord).toHaveBeenCalledWith("est");
    expect(sideChannel.onWord).toHaveBeenCalledTimes(2);
  });

  it("parses expected text parts", () => {
    const work = processTei2(testRoot(BODY_WITH_BOOK_ONLY));
    expect(work.textParts).toStrictEqual(["book", "chapter", "section"]);
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
