import {
  buildCitationSpine,
  CitationSpine,
  declaredUnitNames,
  parseCiteMatch,
  parseCiteStructure,
  sliceAtMarkers,
} from "@/common/library/cite_structure";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";

/** A `<refsDecl xml:id="CTS">` with the given nested `<citeStructure>`s. */
function citeStructure(levels: string): string {
  return `<refsDecl xml:id="CTS">
    <citeStructure match="/TEI/text/body" use="@xml:base">${levels}</citeStructure>
  </refsDecl>`;
}

function level(unit: string, match: string, children = ""): string {
  return `<citeStructure unit="${unit}" match="${match}" use="@n">${children}</citeStructure>`;
}

/** An older-style `<refsDecl n="CTS">` declaring `units`. */
function ctsRefsDecl(...units: string[]): string {
  const patterns = units
    .map(
      (unit) =>
        `<cRefPattern n="${unit}" matchPattern="(\\w+)" replacementPattern="#xpath(/tei:TEI)"/>`
    )
    .join("");
  return `<refsDecl n="CTS">${patterns}</refsDecl>`;
}

function tei(refsDecls: string, body: string): XmlNode {
  return parseRawXml(
    `<TEI>
      <teiHeader><encodingDesc>${refsDecls}</encodingDesc></teiHeader>
      <text><body>${body}</body></text>
    </TEI>`,
    { keepWhitespace: true }
  );
}

function bodyOf(root: XmlNode): XmlNode {
  return root.findDescendants("body")[0];
}

/** `[section id, text]` for every element with direct text, in order. */
function idsOfText(root: XmlNode, spine: CitationSpine): [string, string][] {
  const result: [string, string][] = [];
  const visit = (node: XmlNode, ancestors: XmlNode[]) => {
    for (const child of node.children) {
      if (typeof child === "string") {
        if (child.trim().length > 0) {
          const [id] = CitationSpine.sectionIdOf(spine, ancestors);
          result.push([id.join("."), child.trim()]);
        }
        continue;
      }
      visit(child, [...ancestors, child]);
    }
  };
  visit(bodyOf(root), [bodyOf(root)]);
  return result;
}

function spineOf(root: XmlNode) {
  return buildCitationSpine(root, bodyOf(root));
}

describe("parseCiteMatch", () => {
  it("parses child steps and predicates", () => {
    expect(parseCiteMatch("div/div[@subtype='book']")).toStrictEqual([
      [
        { name: "div", predicates: [], descendant: false },
        { name: "div", predicates: [["subtype", "book"]], descendant: false },
      ],
    ]);
  });

  it("parses descendant steps", () => {
    expect(parseCiteMatch(".//milestone[@unit='chapter']")).toStrictEqual([
      [
        {
          name: "milestone",
          predicates: [["unit", "chapter"]],
          descendant: true,
        },
      ],
    ]);
    expect(parseCiteMatch(".//lb")).toStrictEqual([
      [{ name: "lb", predicates: [], descendant: true }],
    ]);
  });

  it("parses unions", () => {
    expect(
      parseCiteMatch("div3[@type='section'] | milestone[@unit='section']")
    ).toStrictEqual([
      [{ name: "div3", predicates: [["type", "section"]], descendant: false }],
      [
        {
          name: "milestone",
          predicates: [["unit", "section"]],
          descendant: false,
        },
      ],
    ]);
  });

  it("parses attribute-existence predicates", () => {
    expect(parseCiteMatch("div[@type]")).toStrictEqual([
      [{ name: "div", predicates: [["type", undefined]], descendant: false }],
    ]);
  });

  it("tolerates upstream's missing opening quote", () => {
    expect(parseCiteMatch("div/div[@subtype=book']")[0][1]).toStrictEqual({
      name: "div",
      predicates: [["subtype", "book"]],
      descendant: false,
    });
  });

  it("parses every pattern used upstream", () => {
    const patterns = [
      "div/div[@subtype='X']",
      "div[@subtype='X']",
      "l",
      "milestone[@unit='X']",
      "div1[@type='X']",
      ".//lb",
      ".//l",
      "div2[@type='X']",
      "div/div/div[@subtype='X']",
      ".//milestone[@unit='X']",
      "div[@type='X']",
      ".//seg[@type='X']",
      ".//div[@subtype='X']",
      "pb",
      "div[@type]",
      "div/div[@subtype=X']",
      "l | div2[@type='X']",
      "div3[@type='X'] | milestone[@unit='X']",
    ];
    for (const pattern of patterns) {
      expect(() => parseCiteMatch(pattern)).not.toThrow();
    }
  });

  it("rejects unsupported syntax", () => {
    expect(() => parseCiteMatch("div[position()=1]")).toThrow();
    expect(() => parseCiteMatch("")).toThrow();
  });
});

describe("parseCiteStructure", () => {
  it("returns undefined without a citeStructure", () => {
    expect(parseCiteStructure(tei(ctsRefsDecl("section"), ""))).toBe(undefined);
  });

  it("parses nested and sibling levels", () => {
    const root = tei(
      citeStructure(
        level(
          "act",
          "div/div[@subtype='act']",
          level("line", "l") +
            level("scene", "div[@subtype='scene']", level("line", "l"))
        )
      ),
      ""
    );
    const levels = parertsOrThrow(parseCiteStructure(root));
    expect(levels).toHaveLength(1);
    expect(levels[0].unit).toBe("act");
    expect(levels[0].children.map((c) => c.unit)).toEqual(["line", "scene"]);
    expect(levels[0].children[1].children[0].unit).toBe("line");
  });

  it("reads the older declarations' unit names", () => {
    const root = tei(
      ctsRefsDecl("Section", "chapter") +
        `<refsDecl><refState unit="life"/><refState unit="chapter"/></refsDecl>`,
      ""
    );
    expect(declaredUnitNames(root)).toEqual([
      "section",
      "chapter",
      "life",
      "chapter",
    ]);
  });
});

function parertsOrThrow<T>(x: T | undefined): T {
  if (x === undefined) {
    throw new Error("undefined");
  }
  return x;
}

describe("buildCitationSpine with a citeStructure", () => {
  it("cites book > chapter divs", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div/div[@subtype='book']",
          level("chapter", "div[@subtype='chapter']")
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1"><head>Liber I</head>
          <div type="textpart" subtype="chapter" n="1">a</div>
          <div type="textpart" subtype="chapter" n="2">b</div>
        </div>
        <div type="textpart" subtype="book" n="2">
          <div type="textpart" subtype="chapter" n="1">c</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.source).toBe("citeStructure");
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1", "Liber I"],
      ["1.1", "a"],
      ["1.2", "b"],
      ["2.1", "c"],
    ]);
  });

  it("finds lines inside line groups (relaxed child steps)", () => {
    const root = tei(
      citeStructure(
        level("poem", "div/div[@subtype='poem']", level("line", "l"))
      ),
      `<div type="edition"><div type="textpart" subtype="poem" n="3">
        <lg><l n="1">x</l><l n="2">y</l></lg>
      </div></div>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["3.1", "x"],
      ["3.2", "y"],
    ]);
  });

  it("lets an <l> without @n inherit its parent's id (Rule E)", () => {
    const root = tei(
      citeStructure(
        level("book", "div/div[@subtype='book']", level("line", "l"))
      ),
      `<div type="edition"><div type="textpart" subtype="book" n="1">
        <l n="1">x</l><l><gap/>y</l><l n="2">z</l>
      </div></div>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["1.1", "x"],
      ["1", "y"],
      ["1.2", "z"],
    ]);
  });

  it("ignores undeclared <l> in prose", () => {
    const root = tei(
      citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition"><div type="textpart" subtype="section" n="4">
        prose <l n="10">verse</l>
      </div></div>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["4", "prose"],
      ["4", "verse"],
    ]);
  });

  it("evaluates sibling branches, failing on ragged depth (Terence)", () => {
    const root = tei(
      citeStructure(
        level(
          "act",
          "div/div[@subtype='act']",
          level("line", "l") +
            level("scene", "div[@subtype='scene']", level("line", "l"))
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="act" n="prologue"><l n="1">p</l></div>
        <div type="textpart" subtype="act" n="1">
          <div type="textpart" subtype="scene" n="1"><l n="2">q</l></div>
          <div type="textpart" subtype="scene" n="2"><l n="3">r</l></div>
        </div>
      </div>`
    );
    // act.line beside act.scene.line: the output model has one depth.
    expect(() => spineOf(root)).toThrow(
      /Missing citation level: act.line \(scheme act.scene.line\)/
    );
  });

  it("skips an intermediate division whose children are numbered uniquely (Rule A, Livy)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div/div/div[@subtype='book']",
          level("chapter", "div[@subtype='chapter']")
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="part" n="1">
          <div type="textpart" subtype="index"><p>contents</p></div>
          <div type="textpart" subtype="book" n="1">
            <div type="textpart" subtype="chapter" n="1">a</div>
          </div>
        </div>
        <div type="textpart" subtype="part" n="2">
          <div type="textpart" subtype="book" n="2">
            <div type="textpart" subtype="chapter" n="1">b</div>
          </div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(idsOfText(root, spine)).toEqual([
      ["", "contents"],
      ["1.1", "a"],
      ["2.1", "b"],
    ]);
  });

  it("keeps an intermediate division when ids would collide (Rule A, Philippics)", () => {
    const root = tei(
      citeStructure(level("section", "div/div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="speech" n="1">
          <div type="textpart" subtype="section" n="1">a</div>
          <div type="textpart" subtype="section" n="2">b</div>
        </div>
        <div type="textpart" subtype="speech" n="2">
          <div type="textpart" subtype="section" n="1">c</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["speech", "section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1", "a"],
      ["1.2", "b"],
      ["2.1", "c"],
    ]);
  });

  it("keeps a numbered division that a // path does not step through", () => {
    const root = tei(
      citeStructure(level("fragment", ".//div[@subtype='fragment']")),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1"><head>reliquiae</head>
          <div type="textpart" subtype="fragment" n="1">a</div>
          <div type="textpart" subtype="fragment" n="2">b</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "fragment"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1", "reliquiae"],
      ["1.1", "a"],
      ["1.2", "b"],
    ]);
  });

  it("adds undeclared seg levels the headers declare (Rule B, Nepos)", () => {
    const root = tei(
      ctsRefsDecl("section", "chapter") +
        citeStructure(level("chapter", "div/div[@subtype='chapter']")),
      `<div type="edition">
        <div type="textpart" subtype="chapter" n="1">
          <p><seg type="section" n="1">a</seg> <seg type="section" n="2">b</seg></p>
          <seg type="dateline">not a section</seg>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["chapter", "section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1", "a"],
      ["1.2", "b"],
      ["1", "not a section"],
    ]);
  });

  it("adds an undeclared line level the headers declare (Rule B, Psychomachia)", () => {
    const root = tei(
      ctsRefsDecl("section", "line") +
        citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="section" n="pr"><p>prose preface</p></div>
        <div type="textpart" subtype="section" n="1">
          <lg><l n="1">x</l><l n="2">y</l></lg>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["section", "line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["pr", "prose preface"],
      ["1.1", "x"],
      ["1.2", "y"],
    ]);
  });

  it("adds the line level under a sibling-declared line branch (Genethliacon)", () => {
    const root = tei(
      ctsRefsDecl("section", "line") +
        citeStructure(
          level("section", "div/div[@subtype='section']") + level("line", "l")
        ),
      `<div type="edition">
        <div type="textpart" subtype="section" n="1"><l n="1">x</l><l n="2">y</l></div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["section", "line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1", "x"],
      ["1.2", "y"],
    ]);
  });

  it("does not cite lines quoted in prose as the work's lines (Ausonius, Ep. 25)", () => {
    const root = tei(
      ctsRefsDecl("letter", "line") +
        citeStructure(level("letter", "div/div[@subtype='letter']")),
      `<div type="edition">
        <div type="textpart" subtype="letter" n="25">
          <p>preface <quote><l n="1">quoted a</l><l n="2">quoted b</l></quote></p>
          <l n="1">own a</l><l n="2">own b</l>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["letter", "line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["25", "preface"],
      ["25", "quoted a"],
      ["25", "quoted b"],
      ["25.1", "own a"],
      ["25.2", "own b"],
    ]);
  });

  it("lets a few unnumbered lines inherit under an implicit line level", () => {
    const lines = Array.from(
      { length: 10 },
      (_, i) => `<l n="${i + 1}">v${i + 1}</l>`
    );
    const root = tei(
      ctsRefsDecl("letter", "line") +
        citeStructure(level("letter", "div/div[@subtype='letter']")),
      `<div type="edition">
        <div type="textpart" subtype="letter" n="7">${lines.join(
          ""
        )}<l>loose</l></div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["letter", "line"]);
    expect(idsOfText(root, spine).slice(-2)).toEqual([
      ["7.10", "v10"],
      ["7", "loose"],
    ]);
  });

  it("adds no line level where numbered lines are a small minority", () => {
    const root = tei(
      ctsRefsDecl("section", "line") +
        citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="section" n="1">
          <l n="1">a</l><l>b</l><l>c</l>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["section"]);
    expect(spine.warnings.join("\n")).toMatch(/implicit line level/);
  });

  it("does not cite a struck-out copy of a transposed line twice (Silius 11.453)", () => {
    const root = tei(
      citeStructure(
        level("book", "div/div[@subtype='book']", level("line", "l"))
      ),
      `<div type="edition"><div type="textpart" subtype="book" n="11">
        <l n="290">a</l><l n="453"><add>moved</add></l><l n="291">b</l>
        <l n="452">c</l><lg><l n="453"><del>moved</del></l></lg>
        <l n="455"><del>bracketed but cited</del></l>
      </div></div>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["11.290", "a"],
      ["11.453", "moved"],
      ["11.291", "b"],
      ["11.452", "c"],
      ["11", "moved"],
      ["11.455", "bracketed but cited"],
    ]);
  });

  it("drops an undeclared grouping over uniquely numbered children (Rule C, Catullus)", () => {
    const root = tei(
      ctsRefsDecl("line", "poem") +
        citeStructure(
          level(
            "book",
            "div/div[@subtype='book']",
            level("poem", "div[@subtype='poem']", level("line", "l"))
          )
        ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="lyrics">
          <div type="textpart" subtype="poem" n="1"><l n="1">a</l></div>
        </div>
        <div type="textpart" subtype="book" n="long_poems">
          <div type="textpart" subtype="book">
            <div type="textpart" subtype="poem" n="65"><l n="1">b</l></div>
          </div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["poem", "line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1", "a"],
      ["65.1", "b"],
    ]);
  });

  it("keeps a declared grouping even with unique children (Juvenal)", () => {
    const root = tei(
      `<refsDecl><refState unit="book"/><refState unit="poem"/><refState unit="line"/></refsDecl>` +
        citeStructure(
          level(
            "book",
            "div/div[@subtype='book']",
            level("poem", "div[@subtype='poem']", level("line", "l"))
          )
        ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1">
          <div type="textpart" subtype="poem" n="1"><l n="1">a</l></div>
        </div>
        <div type="textpart" subtype="book" n="2">
          <div type="textpart" subtype="poem" n="2"><l n="1">b</l></div>
        </div>
      </div>`
    );
    expect(spineOf(root).textParts).toEqual(["book", "poem", "line"]);
  });

  it("uses div1 / div2 containers (Tacitus' Dialogus)", () => {
    const root = tei(
      citeStructure(
        level(
          "chapter",
          "div1[@type='chapter']",
          level("section", "div2[@type='section']")
        )
      ),
      `<div1 type="chapter" n="1"><div2 type="section" n="1">a</div2></div1>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([["1.1", "a"]]);
  });

  it("matches div[@type] but never the edition wrapper (Persius)", () => {
    const root = tei(
      citeStructure(level("poem", "div[@type]", level("line", "l"))),
      `<div type="edition" n="urn:cts:latinLit:x.y.z">
        <div type="prologue" n="prol"><l n="1">a</l></div>
        <div type="satire" n="1"><l n="1">b</l></div>
      </div>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["prol.1", "a"],
      ["1.1", "b"],
    ]);
  });

  it("evaluates unions of containers (Symmachus' poems)", () => {
    const root = tei(
      citeStructure(
        level(
          "poem",
          "div1[@type='poem']",
          level("line", "l | div2[@type='section']")
        )
      ),
      `<div1 type="poem" n="1"><l n="1">a</l><div2 type="section" n="2">b</div2></div1>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["1.1", "a"],
      ["1.2", "b"],
    ]);
  });

  it("fails on a citation value containing a dot", () => {
    const root = tei(
      citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition"><div type="textpart" subtype="section" n="1.2">a</div></div>`
    );
    expect(() => spineOf(root)).toThrow(/contains "."/);
  });

  it("fails on an empty citation value", () => {
    const root = tei(
      citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition"><div type="textpart" subtype="section" n="">a</div></div>`
    );
    expect(() => spineOf(root)).toThrow(/Empty citation value/);
  });
});

describe("buildCitationSpine point levels", () => {
  it("slices a container at milestones inside paragraphs (Tacitus' Annales)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div1[@type='book']",
          level("chapter", ".//milestone[@unit='chapter']")
        )
      ),
      `<div1 type="book" n="1"><head>LIBER I</head>
        <milestone n="1" unit="chapter"/><p rend="indent">Urbem <note>n1</note>Romam
        <milestone n="2" unit="chapter"/>Postquam</p>
        <p>Igitur</p>
        <milestone n="para" unit="para"/>
        <p>Tiberius<milestone n="3" unit="chapter"/>Nero</p>
      </div1>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1", "LIBER I"],
      ["1.1", "Urbem"],
      ["1.1", "n1"],
      ["1.1", "Romam"],
      ["1.2", "Postquam"],
      ["1.2", "Igitur"],
      ["1.2", "Tiberius"],
      ["1.3", "Nero"],
    ]);
    // The split paragraph keeps its tag on both sides; only the first keeps
    // the indent.
    const book = bodyOf(root).findChildren("div1")[0];
    const chapters = book.findChildren("div");
    expect(chapters.map((c) => c.getAttr("n"))).toEqual(["1", "2", "3"]);
    expect(chapters[0].findChildren("p")[0].getAttr("rend")).toBe("indent");
    expect(chapters[1].findChildren("p")[0].getAttr("rend")).toBe(undefined);
    // The chapter milestones are consumed; others are kept.
    expect(
      root.findDescendants("milestone").map((m) => m.getAttr("n"))
    ).toEqual(["para"]);
  });

  it("slices verse at <lb n> (Appendix Vergiliana)", () => {
    const root = tei(
      citeStructure(level("line", ".//lb")),
      `<head>Dirae</head>
      <p>
<lb n="1"/>Battare, cycneas
<lb n="2"/>diuisas iterum
</p>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["", "Dirae"],
      ["1", "Battare, cycneas"],
      ["2", "diuisas iterum"],
    ]);
    expect(root.findDescendants("lb")).toHaveLength(0);
  });

  it("nests point levels under containers (Symmachus' letters)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div1[@type='book']",
          level(
            "letter",
            "div2[@type='letter']",
            level(
              "section",
              "div3[@type='section'] | milestone[@unit='section']"
            )
          )
        )
      ),
      `<div1 type="book" n="1">
        <div2 type="letter" n="1"><head>Ad patrem</head>
          <milestone unit="section" n="1"/><p>a</p><milestone unit="section" n="2"/><p>b</p>
        </div2>
        <div2 type="letter" n="2"><div3 type="section" n="1">c</div3></div2>
      </div1>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "letter", "section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1", "Ad patrem"],
      ["1.1.1", "a"],
      ["1.1.2", "b"],
      ["1.2.1", "c"],
    ]);
  });

  it("nests containers under point levels (Seneca's tragedies)", () => {
    const root = tei(
      citeStructure(
        level("card", "milestone[@unit='card']", level("line", ".//l"))
      ),
      `<milestone unit="card" n="1"/><l n="1">a</l><l n="2">b</l>
       <milestone unit="card" n="3"/><sp><l n="3">c</l></sp>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["1.1", "a"],
      ["1.2", "b"],
      ["3.3", "c"],
    ]);
  });

  it("uses xml:id when a marker has no @n, and skips markers with neither", () => {
    const root = tei(
      citeStructure(level("page", "pb")),
      `<pb xml:id="p1"/>a<pb/>b<pb n="2"/>c`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["p1", "a"],
      ["p1", "b"],
      ["2", "c"],
    ]);
  });

  it("leaves the tree alone when slicing is off", () => {
    const root = tei(
      citeStructure(level("line", ".//lb")),
      `<p><lb n="1"/>a<lb n="2"/>b</p>`
    );
    const spine = buildCitationSpine(root, bodyOf(root), {
      slicePoints: false,
    });
    expect(root.findDescendants("lb")).toHaveLength(2);
    expect(spine.containers.size).toBe(0);
  });
});

describe("sliceAtMarkers", () => {
  it("preserves all text and notes, splitting nested elements", () => {
    const root = parseRawXml(
      `<div><head>H</head><p>a<note>n</note><hi><m/>b</hi>c<m/>d</p>e</div>`
    );
    const markers = new Set(root.findDescendants("m"));
    const wrappers = sliceAtMarkers(
      root,
      markers,
      (_, content) => new XmlNode("w", [], content)
    );
    expect(wrappers).toHaveLength(2);
    expect(root.toString()).toBe(
      "<div><head>H</head><p>a<note>n</note></p>" +
        "<w><p><hi>b</hi>c</p></w>" +
        "<w><p>d</p>e</w></div>"
    );
  });

  it("does not leave empty copies of split elements", () => {
    const root = parseRawXml(`<div><p>a<m/></p><p>b</p></div>`);
    sliceAtMarkers(
      root,
      new Set(root.findDescendants("m")),
      (_, content) => new XmlNode("w", [], content)
    );
    expect(root.toString()).toBe("<div><p>a</p><w><p>b</p></w></div>");
  });
});

describe("buildCitationSpine without a citeStructure (Rule D)", () => {
  it("derives levels from numbered divisions, named by subtype", () => {
    const root = tei(
      `<refsDecl><refState unit="book"/><refState unit="chapter"/><refState unit="section"/></refsDecl>`,
      `<div type="edition">
        <div type="textpart" subtype="book" n="1">
          <div type="textpart" subtype="chapter" n="2">a</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.source).toBe("tree");
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(idsOfText(root, spine)).toEqual([["1.2", "a"]]);
  });

  it("uses <l n> only where line is declared, and declared seg types", () => {
    const verse = tei(
      ctsRefsDecl("line", "poem"),
      `<div type="textpart" subtype="poem" n="1"><l n="1">a</l></div>`
    );
    expect(spineOf(verse).textParts).toEqual(["poem", "line"]);
    const prose = tei(
      ctsRefsDecl("section"),
      `<div type="textpart" subtype="section" n="1"><l n="1">a</l><seg type="section" n="2">b</seg><seg type="x" n="3">c</seg></div>`
    );
    expect(idsOfText(prose, spineOf(prose))).toEqual([
      ["1", "a"],
      ["1.2", "b"],
      ["1", "c"],
    ]);
  });

  it("uses div1 / div2 and typed divs, but not editions", () => {
    const root = tei(
      "",
      `<div type="edition" n="urn:x"><div1 type="book" n="1"><div type="chapter" n="2">a</div></div1></div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(idsOfText(root, spine)).toEqual([["1.2", "a"]]);
  });
});

describe("buildCitationSpine fits the declaration to the tree", () => {
  it("cites a numbered division with a mistyped subtype by position", () => {
    const root = tei(
      citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="preface" n="pr">a</div>
        <div type="textpart" subtype="section" n="1">b</div>
        <div type="textpart" subtype="secton" n="2">c</div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["pr", "a"],
      ["1", "b"],
      ["2", "c"],
    ]);
    expect(spine.warnings.join("\n")).toContain('subtype="secton" n="2"');
  });

  it("cites variant division names by position (Sidonius' letters as poems)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div1[@type='book']",
          level(
            "letter",
            "div2[@type='letter']",
            level("section", "milestone[@unit='section']")
          )
        )
      ),
      `<div1 type="book" n="1">
        <div2 type="poem" n="1"><milestone unit="section" n="1"/>a</div2>
      </div1>
      <div1 type="book" n="8">
        <div2 type="letter" n="1"><milestone unit="section" n="1"/>b</div2>
      </div1>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "letter", "section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1.1.1", "a"],
      ["8.1.1", "b"],
    ]);
  });

  it("does not cite a numbered wrapper by position", () => {
    // Livy's parts hold books, so they are not books themselves.
    const root = tei(
      citeStructure(level("book", "div/div/div[@subtype='book']")),
      `<div type="edition">
        <div type="textpart" subtype="part" n="1">
          <div type="textpart" subtype="book" n="1">a</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(idsOfText(root, spine)).toEqual([["1", "a"]]);
    expect(spine.textParts).toEqual(["book"]);
  });

  it("treats a union container holding the other alternative as a wrapper", () => {
    // Sidonius' Carmina: `l | div2[@type='section']`, with a section of lines.
    const root = tei(
      citeStructure(
        level(
          "poem",
          "div1[@type='poem']",
          level("line", "l | div2[@type='section']")
        )
      ),
      `<div1 type="poem" n="22"><l n="1">a</l>
        <div2 type="section" n="4"><l n="2">b</l><l n="3">c</l></div2>
      </div1>`
    );
    expect(idsOfText(root, spineOf(root))).toEqual([
      ["22.1", "a"],
      ["22.2", "b"],
      ["22.3", "c"],
    ]);
  });

  it("gives a kept division without sections its own id (Jerome's letter 44)", () => {
    const root = tei(
      citeStructure(level("section", "div/div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="letter" n="14">
          <div type="textpart" subtype="section" n="1">a</div>
        </div>
        <div type="textpart" subtype="letter" n="44"><head>Ad Marcellam</head>b</div>
        <div type="textpart" subtype="letter" n="45">
          <div type="textpart" subtype="section" n="1">c</div>
        </div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["letter", "section"]);
    expect(idsOfText(root, spine)).toEqual([
      ["14.1", "a"],
      ["44", "Ad Marcellam"],
      ["44", "b"],
      ["45.1", "c"],
    ]);
    expect(spine.leafIds).toEqual(new Set(["14.1", "44", "45.1"]));
  });

  it("fails on a division that matches a level but has no @n", () => {
    // Nepos' Cato: chapter 3 has no number.
    const root = tei(
      citeStructure(level("chapter", "div/div[@subtype='chapter']")),
      `<div type="edition">
        <div type="textpart" subtype="chapter" n="2">a</div>
        <div type="textpart" subtype="chapter">b</div>
      </div>`
    );
    expect(() => spineOf(root)).toThrow(
      /matching citeStructure chapter.*has no @n/
    );
  });

  it("fails on a numbered division no level accounts for", () => {
    const root = tei(
      citeStructure(level("section", "div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="section" n="22">
          <div type="textpart" subtype="subsection" n="pr">a</div>
        </div>
      </div>`
    );
    expect(() => spineOf(root)).toThrow(
      /Numbered division <div type="textpart" subtype="subsection" n="pr"> is not a citation level/
    );
  });

  it("fails on sections deeper than the rest (Claudian's Carmina minora)", () => {
    const root = tei(
      citeStructure(
        level("poem", "div/div[@subtype='poem']", level("line", "l"))
      ),
      `<div type="edition">
        <div type="textpart" subtype="poem" n="1"><l n="1">a</l><l n="2">b</l></div>
        <div type="textpart" subtype="poem" n="6"><l n="1">c</l></div>
        <div type="textpart" subtype="poem" n="7">
          <div type="textpart" subtype="section" n="1"><l n="1">d</l></div>
          <div type="textpart" subtype="section" n="2"><l n="1">e</l></div>
        </div>
      </div>`
    );
    expect(() => spineOf(root)).toThrow(
      /Ragged citation depth: poem.section.line \(scheme poem.line\)/
    );
  });

  it("fails where a declared level is missing (Claudian's In Rufinum)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div/div[@subtype='book']",
          level("poem", "div[@subtype='poem']", level("line", "l"))
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1"><l n="1">a</l></div>
        <div type="textpart" subtype="book" n="3">
          <div type="textpart" subtype="poem" n="pr"><l n="1">b</l><l n="2">c</l></div>
        </div>
      </div>`
    );
    expect(() => spineOf(root)).toThrow(
      /Missing citation level: book.line \(scheme book.poem.line\)/
    );
  });

  it("fails on mixed unit paths of one depth", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div/div[@subtype='book']",
          level("poem", "div[@subtype='poem']", level("line", "l"))
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1">
          <div type="textpart" subtype="poem" n="1"><l n="1">a</l></div>
        </div>
        <div type="textpart" subtype="poem" n="5">
          <div type="textpart" subtype="section" n="1"><l n="1">b</l><l n="2">c</l></div>
          <div type="textpart" subtype="section" n="2"><l n="1">d</l></div>
        </div>
      </div>`
    );
    expect(() => spineOf(root)).toThrow(/Mixed citation units/);
  });

  it("allows shallower leaves of another unit (Livy's summaries)", () => {
    const root = tei(
      citeStructure(
        level(
          "book",
          "div/div[@subtype='book']",
          level("chapter", "div[@subtype='chapter']")
        )
      ),
      `<div type="edition">
        <div type="textpart" subtype="book" n="1">
          <div type="textpart" subtype="chapter" n="1">a</div>
          <div type="textpart" subtype="chapter" n="2">b</div>
        </div>
        <div type="textpart" subtype="book" n="46"><p>summary</p></div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["book", "chapter"]);
    expect(spine.leafIds).toEqual(new Set(["1.1", "1.2", "46"]));
  });

  it("names the scheme after the most common leaf path, ignoring case", () => {
    const root = tei(
      citeStructure(level("section", "div/div/div[@subtype='section']")),
      `<div type="edition">
        <div type="textpart" subtype="speech" n="1">
          <div type="textpart" subtype="section" n="1">a</div>
        </div>
        <div type="textpart" subtype="Speech" n="2">
          <div type="textpart" subtype="section" n="1">b</div>
          <div type="textpart" subtype="section" n="2">c</div>
        </div>
      </div>`
    );
    expect(spineOf(root).textParts).toEqual(["speech", "section"]);
  });
});

describe("Rule C only drops genuine groupings", () => {
  const poems = (book: string, ...ns: string[]) =>
    `<div type="textpart" subtype="book" n="${book}">${ns
      .map(
        (n) =>
          `<div type="textpart" subtype="poem" n="${n}"><l n="1">x</l></div>`
      )
      .join("")}</div>`;
  const bookPoemLine = citeStructure(
    level(
      "book",
      "div/div[@subtype='book']",
      level("poem", "div[@subtype='poem']", level("line", "l"))
    )
  );

  it("keeps a single book", () => {
    const root = tei(
      ctsRefsDecl("line", "poem") + bookPoemLine,
      `<div type="edition">${poems("2", "1", "2")}</div>`
    );
    expect(spineOf(root).textParts).toEqual(["book", "poem", "line"]);
  });

  it("keeps poems over lines numbered straight through", () => {
    const root = tei(
      ctsRefsDecl("line") +
        citeStructure(
          level("poem", "div/div[@subtype='poem']", level("line", "l"))
        ),
      `<div type="edition">
        <div type="textpart" subtype="poem" n="1"><head>I</head><l n="1">a</l></div>
        <div type="textpart" subtype="poem" n="2"><head>II</head><l n="2">b</l></div>
      </div>`
    );
    const spine = spineOf(root);
    expect(spine.textParts).toEqual(["poem", "line"]);
    expect(idsOfText(root, spine)).toEqual([
      ["1", "I"],
      ["1.1", "a"],
      ["2", "II"],
      ["2.2", "b"],
    ]);
  });

  it("keeps scenes within acts", () => {
    const root = tei(
      ctsRefsDecl("line") +
        citeStructure(
          level(
            "act",
            "div/div[@subtype='act']",
            level("scene", "div[@subtype='scene']", level("line", "l"))
          )
        ),
      `<div type="edition">
        <div type="textpart" subtype="act" n="1">
          <div type="textpart" subtype="scene" n="1"><l n="1">a</l></div>
          <div type="textpart" subtype="scene" n="2"><l n="2">b</l></div>
        </div>
        <div type="textpart" subtype="act" n="2">
          <div type="textpart" subtype="scene" n="1"><l n="3">c</l></div>
        </div>
      </div>`
    );
    expect(spineOf(root).textParts).toEqual(["act", "scene", "line"]);
  });
});
