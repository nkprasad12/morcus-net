import {
  hoistSenecaCardMilestones,
  nextSegmentNumber,
  normalizeCiceroChapterMilestones,
  normalizeNestedActs,
  normalizePlinySectionMilestones,
  normalizeSectionMilestones,
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

describe("normalizeSectionMilestones", () => {
  it("prepends milestone n=1 to p when division starts at n=2 preceded by text", () => {
    const body = parse(`<body>
      <div1 type="chapter" n="pr">
        <head>Praefatio</head>
        <p>Est interdum praestare... <milestone unit="section" n="2"/>Et virum bonum... <milestone unit="section" n="3"/>Mercatorem...</p>
      </div1>
    </body>`);
    normalizeSectionMilestones(body);
    const p = body.findDescendants("p")[0];
    expect(p.children[0]).toBeInstanceOf(XmlNode);
    const firstChild = p.children[0] as XmlNode;
    expect(firstChild.name).toBe("milestone");
    expect(firstChild.getAttr("unit")).toBe("section");
    expect(firstChild.getAttr("n")).toBe("1");
    const milestones = body
      .findDescendants("milestone")
      .map((m) => m.getAttr("n"));
    expect(milestones).toEqual(["1", "2", "3"]);
  });

  it("leaves divisions alone when milestone n=1 is already present or n=2 is not preceded by text", () => {
    const withOne = parse(`<body>
      <div1 type="chapter" n="1">
        <p><milestone unit="section" n="1"/>Text <milestone unit="section" n="2"/>More text</p>
      </div1>
    </body>`);
    normalizeSectionMilestones(withOne);
    expect(
      withOne.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["1", "2"]);

    const noTextBefore = parse(`<body>
      <div1 type="chapter" n="2">
        <p><milestone unit="section" n="2"/>Text <milestone unit="section" n="3"/>More text</p>
      </div1>
    </body>`);
    normalizeSectionMilestones(noTextBefore);
    expect(
      noTextBefore.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["2", "3"]);
  });

  it("renumbers duplicate consecutive integer milestones in sequence (Aurelianus 20)", () => {
    const body = parse(`<body>
      <div type="textpart" subtype="chapter" n="20">
        <p>
          <milestone unit="section" n="1"/>A
          <milestone unit="section" n="2"/>B
          <milestone unit="section" n="3"/>C
          <milestone unit="section" n="4"/>D
          <milestone unit="section" n="5"/>E
          <milestone unit="section" n="6"/>F
          <milestone unit="section" n="7"/>G
          <milestone unit="section" n="7"/>H
        </p>
      </div>
    </body>`);
    normalizeSectionMilestones(body);
    expect(
      body.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });
});

describe("normalizePlinySectionMilestones", () => {
  it("cleans @n, moves trailing milestones across chapters, prepends mid-section milestone, and disambiguates duplicates", () => {
    const root = parse(`<body>
      <div type="textpart" subtype="book" n="1">
        <div type="textpart" subtype="chapter" n="1">
          <p><milestone unit="section" n="1?"/>Text 1 <milestone unit="section" n="2 "/><note>Apparatus</note></p>
        </div>
        <div type="textpart" subtype="chapter" n="2">
          <p>Continued text <milestone unit="section" n="3"/>Text 3 <milestone unit="section" n="3"/>More text</p>
        </div>
      </div>
    </body>`);
    normalizePlinySectionMilestones(root);

    const ch1 = root
      .findDescendants("div")
      .find(
        (d) => d.getAttr("subtype") === "chapter" && d.getAttr("n") === "1"
      )!;
    const ch2 = root
      .findDescendants("div")
      .find(
        (d) => d.getAttr("subtype") === "chapter" && d.getAttr("n") === "2"
      )!;

    // Trailing milestone 2 was moved from chapter 1 into chapter 2
    expect(
      ch1.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["1"]);

    // Chapter 2 received milestone 2 at the front, cleaned question mark, and deduplicated 3 as 3b
    expect(
      ch2.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["2", "3", "3b"]);
  });
});

describe("normalizeCiceroChapterMilestones", () => {
  it("slices a single-book section work at chapter milestones", () => {
    const root = parse(`<body>
      <div type="edition">
        <milestone unit="chapter" n="1"/>
        <div type="textpart" subtype="section" n="1"><p>Text 1</p></div>
        <div type="textpart" subtype="section" n="2"><p>Text 2</p></div>
        <milestone unit="chapter" n="2"/>
        <div type="textpart" subtype="section" n="3"><p>Text 3</p></div>
      </div>
    </body>`);
    normalizeCiceroChapterMilestones(root);

    const chapters = root
      .findDescendants("div")
      .filter((d) => d.getAttr("subtype") === "chapter");
    expect(chapters).toHaveLength(2);
    expect(chapters[0].getAttr("n")).toBe("1");
    expect(chapters[1].getAttr("n")).toBe("2");
    expect(
      chapters[0]
        .findDescendants("div")
        .filter((d) => d.getAttr("subtype") === "section")
        .map((s) => s.getAttr("n"))
    ).toEqual(["1", "2"]);
    expect(
      chapters[1]
        .findDescendants("div")
        .filter((d) => d.getAttr("subtype") === "section")
        .map((s) => s.getAttr("n"))
    ).toEqual(["3"]);
  });

  it("handles sigla and unnumbered fragment wrappers", () => {
    const root = parse(`<body>
      <div type="edition">
        <div type="textpart" subtype="section" n="sigla"><p>Sigla text</p></div>
        <milestone unit="chapter" n="1"/>
        <div type="textpart" subtype="section" n="1"><p>Text 1</p></div>
        <div type="textpart" subtype="fragments">
          <div type="textpart" subtype="section" n="fr1"><p>Fragment 1</p></div>
        </div>
      </div>
    </body>`);
    normalizeCiceroChapterMilestones(root);

    const chapters = root
      .findDescendants("div")
      .filter((d) => d.getAttr("subtype") === "chapter");
    expect(chapters.map((c) => c.getAttr("n"))).toEqual([
      "sigla",
      "1",
      "fragments",
    ]);
  });

  it("leaves multi-book works alone", () => {
    const root = parse(`<body>
      <div type="edition">
        <div type="textpart" subtype="book" n="1">
          <milestone unit="chapter" n="1"/>
          <div type="textpart" subtype="section" n="1"><p>Text</p></div>
        </div>
      </div>
    </body>`);
    normalizeCiceroChapterMilestones(root);

    expect(
      root.findDescendants("div").filter((d) => d.getAttr("subtype") === "chapter")
    ).toHaveLength(0);
  });
});

describe("hoistSenecaCardMilestones", () => {
  it("splits <sp> around a child card milestone so the milestone sits between speeches", () => {
    const root = parse(`<div>
      <sp who="#theseus">
        <speaker>Thes.</speaker>
        <l n="1114b" part="F">O nimium potens,</l>
        <milestone n="1115" unit="card"/>
        <pb n="p.195"/>
        <l n="1115">quanto parentes sanguinis vinclo tenes.</l>
      </sp>
    </div>`);
    hoistSenecaCardMilestones(root);

    const nonWhitespaceChildren = root.children.filter(
      (c): c is XmlNode => typeof c !== "string"
    );
    expect(nonWhitespaceChildren).toHaveLength(3);
    const [sp1, milestone, sp2] = nonWhitespaceChildren;
    expect(sp1.name).toBe("sp");
    expect(sp1.children.filter((c) => typeof c !== "string").map((c) => (c as XmlNode).name)).toEqual([
      "speaker",
      "l",
    ]);
    expect(
      (
        sp1.children.filter((c) => typeof c !== "string")[1] as XmlNode
      ).getAttr("n")
    ).toBe("1114b");

    expect(milestone.name).toBe("milestone");
    expect(milestone.getAttr("n")).toBe("1115");

    expect(sp2.name).toBe("sp");
    expect(sp2.children.filter((c) => typeof c !== "string").map((c) => (c as XmlNode).name)).toEqual(["pb", "l"]);
    expect(
      (
        sp2.children.filter((c) => typeof c !== "string")[1] as XmlNode
      ).getAttr("n")
    ).toBe("1115");
  });
});
