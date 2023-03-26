import {
  displayBibl,
  displayNote,
  displayUsg,
  formatSenseList,
} from "./ls_display";
import { XmlNode } from "./ls_parser";

const OL_OPEN = '<ol style="list-style-type:none">';

describe("displayNote", () => {
  it("is collapsed entirely", () => {
    const result = displayNote(new XmlNode("note", [], []));
    expect(result).toBe("");
  });
});

describe("displayBibl", () => {
  it("shows expected result", () => {
    const author = new XmlNode("author", [], ["Plaut."]);
    const bibl = new XmlNode("bibl", [], [author, "Mil. 4, 4, 36"]);

    const result = displayBibl(bibl);

    const parts = [
      '<div style="display: inline; border-bottom: 1px dashed blue;" title="T. Maccius Plautus, writer of comedy. ob. B.C. 184">',
      "Plaut.",
      "</div>",
      '<div style="display: inline; border-bottom: 1px dashed blue;" title="Expanded from: Mil.">',
      "Miles Gloriosus.",
      "</div>",
      " 4, 4, 36",
    ];
    expect(result).toBe(parts.join(""));
  });

  it("shows expected result for edge case", () => {
    const author = new XmlNode("author", [], ["Hor."]);
    const bibl = new XmlNode("bibl", [], [author, "C. 1, 12, 32"]);

    const result = displayBibl(bibl);

    const parts = [
      '<div style="display: inline; border-bottom: 1px dashed blue;" title="Q. Horatius Flaccus, poet, obiit B.C. 8">',
      "Hor.",
      "</div>",
      '<div style="display: inline; border-bottom: 1px dashed blue;" title="Expanded from: C.">',
      "Carmina, or Odae.",
      "</div>",
      " 1, 12, 32",
    ];
    expect(result).toBe(parts.join(""));
  });
});

describe("displayUsg", () => {
  it("shows expected result for first level text", () => {
    const usg = new XmlNode("usg", [], ["Medic. t. t."]);

    const result = displayUsg(usg);

    const parts = [
      '<div style="display: inline; border-bottom: 1px dashed blue;" title="Expanded from: Medic. t. t.">',
      "Medical [technical term]",
      "</div>",
    ];
    expect(result).toBe(parts.join(""));
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
      "<li><b>I.</b> 1I</li>",
      "<li><b>II.</b> 1II</li>",
      "</ol>",
    ];
    expect(result).toBe(parts.join(""));
  });

  it("handles higher level final sense", () => {
    const nodes = [senseNode("1", "I"), senseNode("2", "A")];

    const result = formatSenseList(nodes);

    const parts = [
      OL_OPEN,
      "<li><b>I.</b> 1I</li>",
      OL_OPEN,
      "<li><b>A.</b> 2A</li>",
      "</ol>",
      "</ol>",
    ];
    expect(result).toBe(parts.join(""));
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
      "<li><b>I.</b> 1I</li>",
      "<li><b>II.</b> 1II</li>",
      OL_OPEN,
      "<li><b>A.</b> 2A</li>",
      OL_OPEN,
      "<li><b>a.</b> 3a</li>",
      "</ol>",
      "<li><b>B.</b> 2B</li>",
      "</ol>",
      "</ol>",
    ];
    expect(result).toBe(parts.join(""));
  });
});
