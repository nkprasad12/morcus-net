import {
  nextSegmentNumber,
  normalizeNestedActs,
  normalizeSplitLineParts,
  normalizeTerenceFrontMatter,
  numberContinuedLines,
} from "@/common/library/drama_normalize";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";

function parse(xml: string): XmlNode {
  return parseRawXml(xml);
}

/** The `@n` of every `<l>` under `root`, in document order (`-` if none). */
function lineNumbers(root: XmlNode): string[] {
  return root.findDescendants("l").map((l) => l.getAttr("n") ?? "-");
}

describe("nextSegmentNumber", () => {
  it.each([
    ["185", "185b"],
    ["185b", "185c"],
    ["28a", "28b"],
  ])("numbers the segment after %s as %s", (n, expected) => {
    expect(nextSegmentNumber(n)).toBe(expected);
  });

  it.each(["cast", "159_160", "12z", ""])("has no next segment for %s", (n) => {
    expect(nextSegmentNumber(n)).toBeUndefined();
  });
});

describe("numberContinuedLines", () => {
  it("numbers unnumbered medial and final parts after their first part", () => {
    const body = parse(`<body>
      <sp><l n="185" part="I">a</l></sp>
      <sp><l part="M">b</l></sp>
      <sp><l part="F">c</l></sp>
      <sp><l n="186">d</l></sp>
    </body>`);
    numberContinuedLines(body);
    expect(lineNumbers(body)).toEqual(["185", "185b", "185c", "186"]);
  });

  it("leaves numbered parts and parts with no split line before them alone", () => {
    const body = parse(`<body>
      <sp><l n="10" part="I">a</l></sp>
      <sp><l n="10b" part="F">b</l></sp>
      <sp><l part="F">c</l></sp>
      <sp><l>d</l></sp>
    </body>`);
    numberContinuedLines(body);
    expect(lineNumbers(body)).toEqual(["10", "10b", "-", "-"]);
  });

  it("only numbers lines inside a speech", () => {
    const body = parse(
      `<body><p><l n="3" part="I">a</l><l part="F">b</l></p></body>`
    );
    numberContinuedLines(body);
    expect(lineNumbers(body)).toEqual(["3", "-"]);
  });
});

describe("normalizeNestedActs", () => {
  it("makes an act inside an act a scene, and leaves other divisions", () => {
    const body = parse(`<body><div type="edition">
      <div type="textpart" subtype="act" n="prologue">
        <div type="textpart" subtype="act" n="prologue"><l n="1">a</l></div>
      </div>
      <div type="textpart" subtype="act" n="1">
        <div type="textpart" subtype="scene" n="1"><l n="2">b</l></div>
      </div>
    </div></body>`);
    normalizeNestedActs(body);
    expect(
      body.findDescendants("div").map((d) => d.getAttr("subtype") ?? "-")
    ).toEqual(["-", "act", "scene", "act", "scene"]);
  });
});

describe("normalizeTerenceFrontMatter", () => {
  const FRONT = `<div type="textpart" subtype="act" n="front">
    <l n="cast" rend="bulletted"><listPerson><person>SIMO</person></listPerson></l>
    <l n="subject_1" xml:lang="eng">INTRODUCTION.</l>
    <l n="subject_2" xml:lang="eng">More English.</l>
    <l n="production">ACTA LUDIS</l>
  </div>`;

  it("moves the cast list and didascalia into the first scene", () => {
    const body = parse(`<body><div type="edition">${FRONT}
      <div type="textpart" subtype="act" n="1">
        <div type="textpart" subtype="scene" n="prologue"><l n="1">a</l></div>
      </div>
    </div></body>`);
    normalizeTerenceFrontMatter(body);

    const edition = body.findChildren("div")[0];
    expect(edition.findChildren("div").map((d) => d.getAttr("n"))).toEqual([
      "1",
    ]);
    const scene = body
      .findDescendants("div")
      .find((d) => d.getAttr("subtype") === "scene")!;
    const front = XmlNode.assertIsNode(scene.children[0]);
    expect(front.name).toBe("div");
    expect(front.attrs).toEqual([["type", "front"]]);
    expect(front.findDescendants("listPerson")).toHaveLength(1);
    expect(front.findChildren("l")).toHaveLength(0);
    expect(front.findChildren("ab")[0].toString()).toContain("ACTA LUDIS");
    expect(front.toString()).not.toContain("INTRODUCTION");
    expect(front.toString()).not.toContain("English");
  });

  it("does nothing to a work without front matter", () => {
    const xml = `<body><div type="edition"><div type="textpart" subtype="act" n="1"><l n="1">a</l></div></div></body>`;
    const body = parse(xml);
    normalizeTerenceFrontMatter(body);
    expect(body.toString()).toBe(parse(xml).toString());
  });

  it("fails when there is no scene to attach the front matter to", () => {
    const body = parse(`<body><div type="edition">${FRONT}</div></body>`);
    expect(() => normalizeTerenceFrontMatter(body)).toThrow(
      /No scene to attach/
    );
  });
});

describe("normalizeSplitLineParts", () => {
  /** A body of one `<sp>` per `[n, part]`; `part` may be absent. */
  function speeches(lines: [string, string?][]): XmlNode {
    return parse(
      `<body>${lines
        .map(
          ([n, part]) =>
            `<sp><speaker>A</speaker><l n="${n}"${
              part === undefined ? "" : ` part="${part}"`
            }>x</l></sp>`
        )
        .join("")}</body>`
    );
  }
  const parts = (root: XmlNode) =>
    root.findDescendants("l").map((l) => l.getAttr("part") ?? "-");

  it.each([
    ["Medea 170", ["170", "170b", "170c", "170d"], "FFFF", "IMMF"],
    ["Medea 171", ["171", "171b", "171c", "171d"], "IIIF", "IMMF"],
    ["Thyestes 1102", ["1102", "1102b"], "II", "IF"],
    ["Thyestes 1103", ["1103", "1103b"], "FF", "IF"],
    ["Hercules Oetaeus 438", ["438", "438a", "438b", "438c"], "IFFF", "IMMF"],
  ])("retags %s", (_, ns, before, after) => {
    const body = speeches(ns.map((n, i) => [n, before[i]]));
    normalizeSplitLineParts(body);
    expect(parts(body).join("")).toBe(after);
  });

  it("retags each line of consecutive mistagged lines separately", () => {
    const body = speeches([
      ["1102", "I"],
      ["1102b", "I"],
      ["1103", "F"],
      ["1103b", "F"],
    ]);
    normalizeSplitLineParts(body);
    expect(parts(body)).toEqual(["I", "F", "I", "F"]);
  });

  it.each([
    ["Plautus sublines 626, 626a", ["626", "626b", "626a", "626ab"], "IFIF"],
    ["a lacunose split line (Plautus 1155)", ["1155", "1155b"], "IM"],
    ["a well-formed split line", ["293", "293b", "293c"], "IMF"],
  ])("leaves %s alone", (_, ns, tagged) => {
    const body = speeches(ns.map((n, i) => [n, tagged[i]]));
    normalizeSplitLineParts(body);
    expect(parts(body).join("")).toBe(tagged);
  });

  it("leaves lines without @part alone (Seneca's lyric 19, 19b)", () => {
    const body = speeches([["19"], ["19b"], ["160", "F"], ["160b"]]);
    normalizeSplitLineParts(body);
    expect(parts(body)).toEqual(["-", "-", "F", "-"]);
  });

  it("does not group lines of another number or without @n", () => {
    const body = parse(`<body>
      <l n="5" part="F">a</l><l part="F">b</l><l n="5b" part="F">c</l>
      <l n="6" part="F">d</l>
    </body>`);
    normalizeSplitLineParts(body);
    expect(parts(body)).toEqual(["F", "F", "F", "F"]);
  });
});
