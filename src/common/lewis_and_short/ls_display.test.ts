import {
  defaultDisplay,
  displayBibl,
  displayNote,
  displayUsg,
  formatSenseList,
} from "./ls_display";
import { XmlNode } from "./ls_parser";

const OL_OPEN = '<ol class="lsSenseList">';

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
      "<span>",
      '<span title="T. Maccius Plautus, writer of comedy. ob. B.C. 184" class="lsAuthor">',
      "Plaut.",
      "</span>",
      '<span title="Expanded from: Mil." class="lsWork">',
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
      "<span>",
      '<span title="Q. Horatius Flaccus, poet, obiit B.C. 8" class="lsAuthor">',
      "Hor.",
      "</span>",
      '<span title="Expanded from: C." class="lsWork">',
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
      '<span title="Expanded from: Medic. t. t.">',
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
