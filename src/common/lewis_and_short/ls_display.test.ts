import { displayBibl, displayNote } from "./ls_display";
import { XmlNode } from "./ls_parser";

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
});
