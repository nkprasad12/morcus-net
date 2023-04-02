import {
  defaultDisplay,
  displayAuthor,
  displayBibl,
  displayNote,
  displayUsg,
  formatSenseList,
  getBullet,
} from "./ls_display";
import { parseEntries, XmlNode } from "./xml_node";

const OL_OPEN = '<ol class="lsSenseList">';
const CANABA = `<entryFree key="canaba" type="main" id="n6427"><orth lang="la" extent="full">cānăba</orth> (or <orth lang="la" extent="full">cannăba</orth>), <itype>ae</itype>, <gen>f.</gen> <etym>kindr. with <foreign lang="greek">κάναβος</foreign> and <foreign lang="greek">κάννα</foreign>; acc. to others, with <foreign lang="greek">καλύβη</foreign></etym>, <sense level="1" n="I" id="n6427.0"><hi rend="ital">a hovel</hi>, <hi rend="ital">hut</hi>, <bibl n="August. Serm. 61"><author>Aug.</author> Serm. 61</bibl>, de Temp.; <bibl><author>Inscr. Orell.</author> 39</bibl>; <bibl>4077</bibl>.</sense></entryFree>`;
const BENEFIO = `<entryFree key="benefio" type="main" id="n5182"><orth lang="la" extent="full">bĕnĕfīo</orth>, v. benefacio.</entryFree>`;

describe("getBullet", () => {
  it("returns original on unparenthesized", () => {
    expect(getBullet("I")).toBe("I");
  });

  it("returns Greek character on known parenthesized", () => {
    expect(getBullet("(d)")).toBe("δ");
  });

  it("returns original on unknown parenthesized", () => {
    expect(getBullet("(*d)")).toBe("(*d)");
  });
});

describe("displayNote", () => {
  it("is collapsed entirely", () => {
    const result = displayNote(new XmlNode("note", [], []));
    expect(result.name).toBe("span");
    expect(result.children).toHaveLength(0);
  });
});

describe("displayBibl", () => {
  it("shows expected result", () => {
    const author = new XmlNode("author", [], ["Plaut."]);
    const bibl = new XmlNode("bibl", [], [author, "Mil. 4, 4, 36"]);

    const result = displayBibl(bibl);

    const parts = [
      '<span class="lsBibl">',
      '<span title="T. Maccius Plautus, writer of comedy. ob. B.C. 184" class="lsHover lsAuthor">',
      "Plaut.",
      "</span>",
      '<span title="Expanded from: Mil." class="lsHover">',
      "Miles Gloriosus.",
      "</span>",
      " 4, 4, 36",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("shows expected result for edge case", () => {
    const author = new XmlNode("author", [], ["Hor."]);
    const bibl = new XmlNode("bibl", [], [author, "C. 1, 12, 32"]);

    const result = displayBibl(bibl);

    const parts = [
      '<span class="lsBibl">',
      '<span title="Q. Horatius Flaccus, poet, obiit B.C. 8" class="lsHover lsAuthor">',
      "Hor.",
      "</span>",
      '<span title="Expanded from: C." class="lsHover">',
      "Carmina, or Odae.",
      "</span>",
      " 1, 12, 32",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });
});

describe("displayUsg", () => {
  it("shows expected result for first level text", () => {
    const usg = new XmlNode("usg", [], ["Medic. t. t."]);

    const result = displayUsg(usg);

    const parts = [
      "<span>",
      '<span title="Expanded from: Medic. t. t." class="lsHover">',
      "Medical [technical term]",
      "</span>",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });
});

describe("displaySenseList", () => {
  function senseNode(level: string, n: string): XmlNode {
    return new XmlNode(
      "sense",
      [
        ["level", level],
        ["n", n],
      ],
      [`${level}${n}`]
    );
  }

  it("shows expected result for top level", () => {
    const nodes = [senseNode("1", "I"), senseNode("1", "II")];

    const result = formatSenseList(nodes);

    const parts = [
      OL_OPEN,
      "<li><b>I. </b><span>1I</span></li>",
      "<li><b>II. </b><span>1II</span></li>",
      "</ol>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("handles higher level final sense", () => {
    const nodes = [senseNode("1", "I"), senseNode("2", "A")];

    const result = formatSenseList(nodes);

    const parts = [
      OL_OPEN,
      "<li><b>I. </b><span>1I</span></li>",
      OL_OPEN,
      "<li><b>A. </b><span>2A</span></li>",
      "</ol>",
      "</ol>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("handles sense level nesting", () => {
    const nodes = [
      senseNode("1", "I"),
      senseNode("1", "II"),
      senseNode("2", "A"),
      senseNode("3", "a"),
      senseNode("2", "B"),
    ];

    const result = formatSenseList(nodes);

    const parts = [
      OL_OPEN,
      "<li><b>I. </b><span>1I</span></li>",
      "<li><b>II. </b><span>1II</span></li>",
      OL_OPEN,
      "<li><b>A. </b><span>2A</span></li>",
      OL_OPEN,
      "<li><b>a. </b><span>3a</span></li>",
      "</ol>",
      "<li><b>B. </b><span>2B</span></li>",
      "</ol>",
      "</ol>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });
});

describe("defaultDisplay", () => {
  it("has same nesting as original", () => {
    const input = new XmlNode(
      "entryFree",
      [],
      ["foo", new XmlNode("tr", [], ["bar"])]
    );

    const output = defaultDisplay(input);

    expect(output.name).toBe("span");
    expect(output.children).toHaveLength(2);
    expect(output.children[0]).toBe("foo");
    const child = XmlNode.assertIsNode(output.children[1]);
    expect(child.name).toBe("span");
    expect(child.children).toHaveLength(1);
    expect(child.children[0]).toBe("bar");
  });
});

describe("displayEntryFree", () => {
  it("shows expected entry with senses", () => {
    const input = parseEntries([CANABA])[0];
    const expected = [
      '<span><span class="lsOrth">cānăba</span> (or <span class="lsOrth">cannăba</span>), ',
      "<span>ae</span>, ",
      '<span title="Expanded from: f." class="lsHover">feminine</span> ',
      "<span>[kindr. with <span>κάναβος</span> and <span>κάννα</span>; acc. to others, with <span>καλύβη</span>]</span>, ",
      '<span><span class="lsEmph"><span>a hovel</span></span>, <span class="lsEmph"><span>hut</span></span>, ',
      '<span class="lsBibl"><span title="Aurelius Augustinus, Christian writer, obiit, A.D. 430" class="lsHover lsAuthor">Aug.</span> ',
      '<span title="Expanded from: Serm." class="lsHover">Sermones.</span> 61</span>, de Temp.; ',
      '<span class="lsBibl"><span title="Expanded from: Inscr. Orell." class="lsHover">Inscriptiones. Orelli.</span> 39</span>; <span>4077</span>.</span></span>',
    ];

    const output = defaultDisplay(input);
    expect(output.toString()).toBe(expected.join(""));
  });

  it("shows expected entry without senses", () => {
    const input = parseEntries([BENEFIO])[0];
    const expected = [
      `<span><span class="lsOrth">bĕnĕfīo</span>, v. benefacio.</span>`,
    ];

    const output = defaultDisplay(input);
    expect(output.toString()).toBe(expected.join(""));
  });
});

describe("displayAuthor", () => {
  it("handles scholar edge case", () => {
    const input = new XmlNode("author", [], ["Schneid."]);
    const output = displayAuthor(input);

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Schneid.");
  });

  it("handles curtius edge case", () => {
    const input = new XmlNode("author", [], ["Georg Curtius"]);
    const output = displayAuthor(input);

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Georg Curtius");
  });

  it("handles Pseudo edge case", () => {
    const input = new XmlNode("author", [], ["Pseudo"]);
    const output = displayAuthor(input);

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Pseudo");
  });

  it("handles author edge case", () => {
    const input = new XmlNode("author", [], ["Inscr. Don."]);
    const output = displayAuthor(input);

    expect(output.toString()).toBe(
      '<span title="Expanded from: Inscr. Don." class="lsHover">Inscriptiones. Donii.</span>'
    );
  });

  it("handles regular author", () => {
    const input = new XmlNode("author", [], ["Censor."]);
    const output = displayAuthor(input);

    expect(output.toString()).toBe(
      '<span title="Censorinus, grammarian, flor. A.D. 238" class="lsHover lsAuthor">Censor.</span>'
    );
  });
});
