import { readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  LsRewriters,
  XmlOperations,
  TargetMatch,
  iterateFromNode,
  modifyInTree,
  removeTextNode,
  rewriteLs,
  searchTree,
} from "./ls_write";
import { CANABA, PALUS1 } from "./sample_entries";
import { XmlChild, XmlNode } from "./xml_node";

const IN_FILE = "ls_write.test.tmp.in.xml";

beforeEach(() => {
  try {
    unlinkSync(IN_FILE);
  } catch (e) {}
});

afterEach(() => {
  try {
    unlinkSync(IN_FILE);
  } catch (e) {}
});

function makeNode(children: XmlChild[]): XmlNode {
  return new XmlNode("a", [], children);
}

describe("rewriters", () => {
  test("rewriteLs handles header correctly", async () => {
    const original = ["header1", "header2", "<body>", "content"].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => "\n" + line);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("rewriteLs uses transformer", async () => {
    const original = ["header1", "<body>", "content"].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => `\n${line}${line}`);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual("header1\n<body>\ncontentcontent");
  });

  test("rewriteLs handles multiline content", async () => {
    const original = [
      "header1",
      "header2",
      "<body>",
      "content1",
      "content2",
      "",
    ].join("\n");
    writeFileSync(IN_FILE, original);

    await rewriteLs(IN_FILE, (line) => "\n" + line);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("removeWhitespace skips out of content whitespace", async () => {
    const original = [
      "header1",
      "",
      "  header2",
      "<body>",
      "content1",
      "</body></TEI>",
      "",
    ].join("\n");
    writeFileSync(IN_FILE, original);

    await LsRewriters.removeWhitespace(IN_FILE);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(original);
  });

  test("removeWhitespace removes content whitespace", async () => {
    const original = ["header", "<body>", "entry1", "", "  entry2"].join("\n");
    writeFileSync(IN_FILE, original);

    await LsRewriters.removeWhitespace(IN_FILE);

    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual("header\n<body>\nentry1\nentry2");
  });

  test("transformEntries modifies entries and only entries", async () => {
    const original = ["header", "<body>", CANABA, "<div1></div>", PALUS1].join(
      "\n"
    );
    writeFileSync(IN_FILE, original);

    await LsRewriters.transformEntries(
      IN_FILE,
      (root) => new XmlNode("box", [], [root])
    );
    const rewritten = readFileSync(IN_FILE, "utf8");
    expect(rewritten).toEqual(
      [
        "header",
        "<body>",
        `<box>${CANABA}</box>`,
        "<div1></div>",
        `<box>${PALUS1}</box>`,
      ].join("\n")
    );
  });
});

describe("iterateFromNode", () => {
  const A = makeNode(["A"]);
  const B = makeNode(["B", A, "Ba"]);
  const C = makeNode(["C"]);
  const D = makeNode([B, C]);

  it("contains all text nodes in order", () => {
    const result = iterateFromNode(D);

    expect(result).toHaveLength(4);
    const textNodes = result.map((d) => d.text);
    expect(textNodes).toStrictEqual(["B", "A", "Ba", "C"]);
  });

  it("has correct parents", () => {
    const result = iterateFromNode(D);

    expect(result[0].parent).toBe(B);
    expect(result[1].parent).toBe(A);
    expect(result[2].parent).toBe(B);
    expect(result[3].parent).toBe(C);
  });

  it("has correct indicies", () => {
    const result = iterateFromNode(D);

    expect(result[0].textIndex).toBe(0);
    expect(result[1].textIndex).toBe(0);
    expect(result[2].textIndex).toBe(2);
    expect(result[3].textIndex).toBe(0);
  });

  it("has correct ancestors", () => {
    const result = iterateFromNode(D);

    expect(result[0].ancestors).toStrictEqual([D]);
    expect(result[1].ancestors).toStrictEqual([D, B]);
    expect(result[2].ancestors).toStrictEqual([D]);
    expect(result[3].ancestors).toStrictEqual([D]);
  });
});

describe("removeTextNode", () => {
  it("handles removal of node with siblings", () => {
    const A = makeNode(["A"]);
    const B = makeNode(["B", A, "Ba"]);
    const nodes = iterateFromNode(B);

    removeTextNode(nodes[0]);

    expect(B.children).toHaveLength(2);
    expect(B.children[0]).toBe(A);
    expect(B.children[1]).toBe("Ba");
  });

  it("handles removal of node without siblings", () => {
    const A = makeNode(["A"]);
    const B = makeNode(["B", A, "Ba"]);
    const nodes = iterateFromNode(B);

    removeTextNode(nodes[1]);

    expect(B.children).toHaveLength(2);
    expect(B.children[0]).toBe("B");
    expect(B.children[1]).toBe("Ba");
  });
});

describe("searchTree", () => {
  const ha = makeNode([" ha"]);
  const happ = makeNode([" sad", ha, "pp"]);
  const y = makeNode(["y "]);
  const happy = makeNode([" happy "]);
  const hahahae = makeNode(["hahahae"]);
  const root = makeNode([happ, y, hahahae, happy]);

  test("matches have expected contents", () => {
    const result = searchTree(root, "happy");

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
    const result = searchTree(root, "haha");

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].chunks).toHaveLength(1);
    const chunk = result.matches[0].chunks[0];
    expect(chunk.startIdx).toBe(0);
    expect(chunk.endIdx).toBe(4);
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
    const chunks = searchTree(fakeTree(), "happy").matches[0].chunks;
    chunks[0].endIdx = 123;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine raises on invalid end chunk", () => {
    const chunks = searchTree(fakeTree(), "happy").matches[0].chunks;
    chunks[chunks.length - 1].startIdx = 1;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine raises on invalid middle chunk", () => {
    const chunks = searchTree(fakeTree(), "happy").matches[0].chunks;
    chunks[1].endIdx = 123;
    expect(() => XmlOperations.combine(chunks)).toThrow();
  });

  test("combine merges expected blocks", () => {
    const ha = makeNode([" ha"]);
    const happ = makeNode([" sad", ha, "pp"]);
    const root = makeNode([happ, "y "]);

    const chunks = searchTree(root, "happy").matches[0].chunks;
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

    const chunks = searchTree(root, "happy").matches[0].chunks;
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

    const chunks = searchTree(root, "happy").matches[0].chunks;
    XmlOperations.combine(chunks, chunks[2]);

    expect(root.children).toHaveLength(2);
    expect(root.children[0]).toBe(happ);
    expect(root.children[1]).toBe("happy ");
    expect(happ.children).toHaveLength(1);
    expect(happ.children[0]).toBe(" sad");
  });

  test("removeMatchFromChunk handles removal from start", () => {
    const root = makeNode(["start end"]);
    const searchResult = searchTree(root, "start");

    XmlOperations.removeMatchFromChunk(searchResult.matches[0].chunks[0]);

    expect(root.children[0]).toBe(" end");
  });

  test("removeMatchFromChunk handles removal from start", () => {
    const root = makeNode(["start end"]);
    const searchResult = searchTree(root, "end");

    XmlOperations.removeMatchFromChunk(searchResult.matches[0].chunks[0]);

    expect(root.children[0]).toBe("start ");
  });
});
