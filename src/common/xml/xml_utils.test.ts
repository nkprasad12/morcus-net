import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import {
  TargetMatch,
  XmlOperations,
  findTextNodes,
  findXmlNodes,
  modifyInTree,
  parseRawXml,
  removeTextNode,
  searchTree,
  searchTreeSimple,
} from "@/common/xml/xml_utils";

function makeNode(children: XmlChild[]): XmlNode {
  return new XmlNode("a", [], children);
}

describe("parseRawXml", () => {
  it("defaults to skip whitespace", () => {
    const result = parseRawXml('<a f="g"><b>hi</b>\n</a>');
    expect(result).toEqual(
      new XmlNode("a", [["f", "g"]], [new XmlNode("b", [], ["hi"])])
    );
  });

  it("returns expected with pi nodes", () => {
    const result = parseRawXml("<?xml blah?><a></a>");
    expect(result).toEqual(new XmlNode("a"));
  });

  it("handles whitespace mode", () => {
    const result = parseRawXml('<a f="g"><b>hi</b>\n</a>', {
      keepWhitespace: true,
    });
    expect(result).toEqual(
      new XmlNode("a", [["f", "g"]], [new XmlNode("b", [], ["hi"]), "\n"])
    );
  });

  it("handles validation if requested", () => {
    expect(() =>
      parseRawXml('<a f="g">hi</b></a>', { validate: true })
    ).toThrow();
    expect(() =>
      parseRawXml('<a f="g">hi</a>', { validate: true })
    ).not.toThrow();
  });
});

describe("findTextNode", () => {
  const A = makeNode(["A"]);
  const B = makeNode(["B", A, "Ba"]);
  const C = makeNode(["C"]);
  const D = makeNode([B, C]);

  it("contains all text nodes in order", () => {
    const result = findTextNodes(D);

    expect(result).toHaveLength(4);
    const textNodes = result.map((d) => d.text);
    expect(textNodes).toStrictEqual(["B", "A", "Ba", "C"]);
  });

  it("has correct parents", () => {
    const result = findTextNodes(D);

    expect(result[0].parent).toBe(B);
    expect(result[1].parent).toBe(A);
    expect(result[2].parent).toBe(B);
    expect(result[3].parent).toBe(C);
  });

  it("has correct indicies", () => {
    const result = findTextNodes(D);

    expect(result[0].textIndex).toBe(0);
    expect(result[1].textIndex).toBe(0);
    expect(result[2].textIndex).toBe(2);
    expect(result[3].textIndex).toBe(0);
  });

  it("has correct ancestors", () => {
    const result = findTextNodes(D);

    expect(result[0].ancestors).toStrictEqual([D]);
    expect(result[1].ancestors).toStrictEqual([D, B]);
    expect(result[2].ancestors).toStrictEqual([D]);
    expect(result[3].ancestors).toStrictEqual([D]);
  });
});

describe("findXmlNodes", () => {
  it("returns expected results", () => {
    const A = new XmlNode("a");
    const B = new XmlNode("b", [], ["b"]);
    const C = new XmlNode("c", [], [A]);
    const D = new XmlNode("d", [], [C, "d", B]);

    const result = findXmlNodes(D);

    expect(result).toHaveLength(4);
    expect(result[0]).toStrictEqual([D, []]);
    expect(result[1]).toStrictEqual([C, [D]]);
    expect(result[2]).toStrictEqual([A, [D, C]]);
    expect(result[3]).toStrictEqual([B, [D]]);
  });
});

describe("removeTextNode", () => {
  it("handles removal of node with siblings", () => {
    const A = makeNode(["A"]);
    const B = makeNode(["B", A, "Ba"]);
    const nodes = findTextNodes(B);

    removeTextNode(nodes[0]);

    expect(B.children).toHaveLength(2);
    expect(B.children[0]).toBe(A);
    expect(B.children[1]).toBe("Ba");
  });

  it("handles removal of node without siblings", () => {
    const A = makeNode(["A"]);
    const B = makeNode(["B", A, "Ba"]);
    const nodes = findTextNodes(B);

    removeTextNode(nodes[1]);

    expect(B.children).toHaveLength(2);
    expect(B.children[0]).toBe("B");
    expect(B.children[1]).toBe("Ba");
  });
});

describe("searchTreeSimple", () => {
  const ha = makeNode([" ha"]);
  const happ = makeNode([" sad", ha, "pp"]);
  const y = makeNode(["y "]);
  const happy = makeNode([" happy "]);
  const hahahae = makeNode(["hahahae"]);
  const root = makeNode([happ, y, hahahae, happy]);

  test("matches have expected contents", () => {
    const result = searchTreeSimple(root, "happy");

    expect(result.matches).toHaveLength(2);
    const first = result.matches[0].chunks;
    const second = result.matches[1].chunks;

    expect(first).toHaveLength(3);
    expect(first[0].data.parent).toBe(ha);
    expect(first[0].match).toBe("ha");
    expect(first[0].startIdx).toBe(1);
    expect(first[0].endIdx).toBe(3);
    expect(first[1].data.parent).toBe(happ);
    expect(first[1].match).toBe("pp");
    expect(first[1].startIdx).toBe(0);
    expect(first[1].endIdx).toBe(2);
    expect(first[2].data.parent).toBe(y);
    expect(first[2].match).toBe("y");
    expect(first[2].startIdx).toBe(0);
    expect(first[2].endIdx).toBe(1);

    expect(second).toHaveLength(1);
    expect(second[0].data.parent).toBe(happy);
    expect(second[0].match).toBe("happy");
    expect(second[0].startIdx).toBe(1);
    expect(second[0].endIdx).toBe(6);
  });

  it("does not return overlapping values", () => {
    const result = searchTreeSimple(root, "haha");

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].chunks).toHaveLength(1);
    const chunk = result.matches[0].chunks[0];
    expect(chunk.startIdx).toBe(0);
    expect(chunk.endIdx).toBe(4);
  });
});

describe("searchTree", () => {
  const start = makeNode([" happ"]);
  const end = makeNode(["y birthday;happy"]);

  test("matches have expected contents", () => {
    const result = searchTree(makeNode([start, end]), (text) => {
      return [{ index: text.indexOf("happy "), text: "happy" }];
    });

    expect(result.matches).toHaveLength(1);
    const first = result.matches[0].chunks;

    expect(first).toHaveLength(2);
    expect(first[0].data.parent).toBe(start);
    expect(first[0].match).toBe("happ");
    expect(first[0].startIdx).toBe(1);
    expect(first[0].endIdx).toBe(5);
    expect(first[1].data.parent).toBe(end);
    expect(first[1].match).toBe("y");
    expect(first[1].startIdx).toBe(0);
    expect(first[1].endIdx).toBe(1);
  });
});

describe("modifyInTree", () => {
  const ha = makeNode([" ha"]);
  const happ = makeNode([" sad", ha, "pp"]);
  const y = makeNode(["y "]);
  const happy = makeNode([" happy "]);
  const hahahae = makeNode(["hahahae"]);
  const root = makeNode([happ, y, hahahae, happy]);

  const modifier = (match: TargetMatch) => {
    match.chunks.forEach((value) => {
      value.data.parent.children[value.data.textIndex] =
        value.match + value.match.length;
    });
  };

  it("does not modify the original", () => {
    const copy = root.deepcopy();
    modifyInTree(root, ["happy", "sad"], modifier);
    expect(copy).toStrictEqual(root);
  });

  it("modifies the expected terms", () => {
    const haNew = makeNode(["ha2"]);
    const happNew = makeNode([" sad", haNew, "pp2"]);
    const yNew = makeNode(["y1"]);
    const happyNew = makeNode(["happy5"]);
    const rootNew = makeNode([happNew, yNew, hahahae, happyNew]);

    const result = modifyInTree(root, ["happy", "sad3"], modifier);

    expect(result).toStrictEqual(rootNew);
  });
});

describe("XmlOperations", () => {
  function fakeTree(): XmlNode {
    const ha = makeNode([" ha"]);
    const happ = makeNode([" sad", ha, "pp"]);
    const y = makeNode(["y "]);
    return makeNode([happ, y]);
  }

  test("combine raises on invalid start chunk", () => {
    const chunks = searchTreeSimple(fakeTree(), "happy").matches[0].chunks;
    chunks[0].endIdx = 123;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine raises on invalid end chunk", () => {
    const chunks = searchTreeSimple(fakeTree(), "happy").matches[0].chunks;
    chunks[chunks.length - 1].startIdx = 1;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine raises on invalid middle chunk", () => {
    const chunks = searchTreeSimple(fakeTree(), "happy").matches[0].chunks;
    chunks[1].endIdx = 123;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine merges expected blocks", () => {
    const ha = makeNode([" ha"]);
    const happ = makeNode([" sad", ha, "pp"]);
    const root = makeNode([happ, "y "]);

    const chunks = searchTreeSimple(root, "happy").matches[0].chunks;
    XmlOperations.combine(chunks);

    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(happ);
    expect(root.children[1]).toBe(" ");
    expect(happ.children).toHaveLength(2);
    expect(happ.children[0]).toBe(" sad");
    expect(happ.children[1]).toBe(ha);
    expect(ha.children).toHaveLength(1);
    expect(ha.children[0]).toBe(" happy");
  });

  test("combine merges to middle block correctly", () => {
    const ha = makeNode([" ha"]);
    const happ = makeNode([" sad", ha, "pp"]);
    const root = makeNode([happ, "y "]);

    const chunks = searchTreeSimple(root, "happy").matches[0].chunks;
    XmlOperations.combine(chunks, chunks[1]);

    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(happ);
    expect(root.children[1]).toBe(" ");
    expect(happ.children).toHaveLength(3);
    expect(happ.children[0]).toBe(" sad");
    expect(happ.children[1]).toBe(ha);
    expect(ha.children).toHaveLength(1);
    expect(ha.children[0]).toBe(" ");
    expect(happ.children[2]).toBe("happy");
  });

  test("combine collapses nested nodes", () => {
    const ha = makeNode(["ha"]);
    const happ = makeNode([" sad", ha, "pp"]);
    const root = makeNode([happ, "y "]);

    const chunks = searchTreeSimple(root, "happy").matches[0].chunks;
    XmlOperations.combine(chunks, chunks[2]);

    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(happ);
    expect(root.children[1]).toBe("happy ");
    expect(happ.children).toHaveLength(1);
    expect(happ.children[0]).toBe(" sad");
  });

  test("removeMatchFromChunk handles removal from start", () => {
    const root = makeNode(["start end"]);
    const searchResult = searchTreeSimple(root, "start");

    XmlOperations.removeMatchFromChunk(searchResult.matches[0].chunks[0]);

    expect(root.children[0]).toBe(" end");
  });

  test("removeMatchFromChunk handles removal from end", () => {
    const root = makeNode(["start end"]);
    const searchResult = searchTreeSimple(root, "end");

    XmlOperations.removeMatchFromChunk(searchResult.matches[0].chunks[0]);

    expect(root.children[0]).toBe("start ");
  });
});
