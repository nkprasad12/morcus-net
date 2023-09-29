import {
  DisplayContext,
  defaultDisplay,
  displayAuthor,
  displayBibl,
  displayCase,
  displayCb,
  displayEntryFree,
  displayFigure,
  displayForeign,
  displayMood,
  displayNote,
  displayNumber,
  displayPb,
  displayQ,
  displayUsg,
  formatSenseList,
} from "@/common/lewis_and_short/ls_display";
import {
  CANABA,
  BENEFIO,
  BIMATRIS,
} from "@/common/lewis_and_short/sample_entries";
import { XmlNode } from "@/common/xml/xml_node";
import { parseXmlStrings } from "../xml/xml_utils";

console.debug = jest.fn();

describe("displayNote", () => {
  it("is collapsed entirely", () => {
    const result = displayNote(new XmlNode("note", [], []), {});
    expect(result.name).toBe("span");
    expect(result.children).toHaveLength(0);
  });
});

describe("displayBibl", () => {
  it("shows expected result", () => {
    const author = new XmlNode("author", [], ["Plaut."]);
    const bibl = new XmlNode("bibl", [], [author, "Mil. 4, 4, 36"]);

    const result = displayBibl(bibl, {});

    const parts = [
      '<span class="lsBibl">',
      '<span title="T. Maccius Plautus, writer of comedy. ob. B.C. 184" class="lsHover lsAuthor">',
      "Plaut.",
      "</span>",
      '<span title="Originally: Mil." class="lsHover">',
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

    const result = displayBibl(bibl, {});

    const parts = [
      '<span class="lsBibl">',
      '<span title="Q. Horatius Flaccus, poet, obiit B.C. 8" class="lsHover lsAuthor">',
      "Hor.",
      "</span>",
      '<span title="Originally: C." class="lsHover">',
      "Carmina, or Odae.",
      "</span>",
      " 1, 12, 32",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("shows expected result for ambiguous author case", () => {
    const author = new XmlNode("author", [], ["Plin."]);
    const bibl = new XmlNode("bibl", [], [author, "Ep. 1, 12, 32"]);

    const result = displayBibl(bibl, {});

    const parts = [
      '<span class="lsBibl">',
      '<span title="C. Plinius Caecilius Secundus (minor), ob. A.D. 113" class="lsHover lsAuthor">',
      "Plin.",
      "</span>",
      '<span title="Originally: Ep." class="lsHover">',
      "Epistulae.",
      "</span>",
      " 1, 12, 32",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("handles case insensitivity when needed", () => {
    const author = new XmlNode("author", [], ["Cic."]);
    const bibl = new XmlNode("bibl", [], [author, "Ad brut. 3, 7, 26"]);

    const result = displayBibl(bibl, {});

    const parts = [
      '<span class="lsBibl">',
      '<span title="M. Tullius Cicero, orator and philosopher, obiit B.C. 43" class="lsHover lsAuthor">',
      "Cic.",
      "</span>",
      '<span title="Originally: Ad brut." class="lsHover">',
      "ad Brutum Epistulae.",
      "</span>",
      " 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("handles Cicero de Or.", () => {
    const author = new XmlNode("author", [], ["Cic."]);
    const bibl = new XmlNode("bibl", [], [author, "de Or. 3, 7, 26"]);

    const result = displayBibl(bibl, {});

    const parts = [
      '<span class="lsBibl">',
      '<span title="M. Tullius Cicero, orator and philosopher, obiit B.C. 43" class="lsHover lsAuthor">',
      "Cic.",
      "</span>",
      '<span title="Originally: de Or." class="lsHover">',
      "De Oratore.",
      "</span>",
      " 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("expands unambiguous id. authors", () => {
    const author = new XmlNode("author", [], ["id."]);
    const bibl = new XmlNode("bibl", [], [author, "de Or. 3, 7, 26"]);

    const result = displayBibl(bibl, { lastAuthor: "Cic." });

    const parts = [
      '<span class="lsBibl">',
      "<span>",
      "id.",
      "</span>",
      '<span title="Originally: de Or." class="lsHover">',
      "De Oratore.",
      "</span>",
      " 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("skips expansion on unambiguous id. authors with bad last author", () => {
    const author = new XmlNode("author", [], ["id."]);
    const bibl = new XmlNode("bibl", [], [author, "de Or. 3, 7, 26"]);

    const result = displayBibl(bibl, { lastAuthor: "Caes." });

    const parts = [
      '<span class="lsBibl">',
      "<span>",
      "id.",
      "</span>",
      "de Or. 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("expands ambiguous id. authors", () => {
    const author = new XmlNode("author", [], ["id."]);
    const bibl = new XmlNode("bibl", [], [author, "Germ. 3, 7, 26"]);

    const result = displayBibl(bibl, { lastAuthor: "Tac." });

    const parts = [
      '<span class="lsBibl">',
      "<span>",
      "id.",
      "</span>",
      '<span title="Originally: Germ." class="lsHover">',
      "Germania.",
      "</span>",
      " 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });

  it("skips expansion on ambiguous id. authors with bad last author", () => {
    const author = new XmlNode("author", [], ["id."]);
    const bibl = new XmlNode("bibl", [], [author, "Germ. 3, 7, 26"]);

    const result = displayBibl(bibl, { lastAuthor: "Caes." });

    const parts = [
      '<span class="lsBibl">',
      "<span>",
      "id.",
      "</span>",
      "Germ.",
      " 3, 7, 26",
      "</span>",
    ];
    expect(result.toString()).toBe(parts.join(""));
  });
});

describe("displayUsg", () => {
  it("shows expected result for first level text", () => {
    const usg = new XmlNode("usg", [], ["Medic. t. t."]);

    const result = displayUsg(usg, {});

    const parts = [
      "<span>",
      '<span title="Originally: Medic. t. t." class="lsHover">',
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
        ["id", level + n],
      ],
      [`${level}${n}`]
    );
  }

  it("shows expected result for top level", () => {
    const nodes = [senseNode("1", "I"), senseNode("1", "II")];

    const result = formatSenseList(nodes, {});

    expect(result.children).toHaveLength(2);
    expect(XmlNode.assertIsNode(result.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(result.children[0]).getAttr("id")).toBe("1I");
    expect(XmlNode.assertIsNode(result.children[1]).name).toBe("li");
    expect(XmlNode.assertIsNode(result.children[1]).getAttr("id")).toBe("1II");
  });

  it("handles higher level final sense", () => {
    const nodes = [senseNode("1", "I"), senseNode("2", "A")];

    const result = formatSenseList(nodes, {});

    expect(result.children).toHaveLength(2);
    expect(XmlNode.assertIsNode(result.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(result.children[0]).getAttr("id")).toBe("1I");
    const sublist = XmlNode.assertIsNode(result.children[1]);
    expect(sublist.name).toBe("ol");
    expect(sublist.children).toHaveLength(1);
    expect(XmlNode.assertIsNode(sublist.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(sublist.children[0]).getAttr("id")).toBe("2A");
  });

  it("handles sense level nesting", () => {
    const nodes = [
      senseNode("1", "I"),
      senseNode("1", "II"),
      senseNode("2", "A"),
      senseNode("3", "a"),
      senseNode("2", "B"),
    ];

    const result = formatSenseList(nodes, {});

    expect(result.children).toHaveLength(3);
    expect(XmlNode.assertIsNode(result.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(result.children[0]).getAttr("id")).toBe("1I");
    expect(XmlNode.assertIsNode(result.children[1]).name).toBe("li");
    expect(XmlNode.assertIsNode(result.children[1]).getAttr("id")).toBe("1II");
    const sublist = XmlNode.assertIsNode(result.children[2]);
    expect(sublist.name).toBe("ol");
    expect(sublist.children).toHaveLength(3);
    expect(XmlNode.assertIsNode(sublist.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(sublist.children[0]).getAttr("id")).toBe("2A");
    const subsublist = XmlNode.assertIsNode(sublist.children[1]);
    expect(subsublist.name).toBe("ol");
    expect(subsublist.children).toHaveLength(1);
    expect(XmlNode.assertIsNode(subsublist.children[0]).name).toBe("li");
    expect(XmlNode.assertIsNode(subsublist.children[0]).getAttr("id")).toBe(
      "3a"
    );
    expect(XmlNode.assertIsNode(sublist.children[2]).name).toBe("li");
    expect(XmlNode.assertIsNode(sublist.children[2]).getAttr("id")).toBe("2B");
  });
});

describe("defaultDisplay", () => {
  it("has same nesting as original", () => {
    const input = new XmlNode(
      "entryFree",
      [],
      ["foo", new XmlNode("tr", [], ["bar"])]
    );

    const output = defaultDisplay(input, {});

    expect(output.name).toBe("span");
    expect(output.children).toHaveLength(2);
    expect(output.children[0]).toBe("foo");
    const child = XmlNode.assertIsNode(output.children[1]);
    expect(child.name).toBe("span");
    expect(child.children).toHaveLength(1);
    expect(child.children[0]).toBe("bar");
  });
});

describe("defaultDisplay", () => {
  it("shows expected entry with senses", () => {
    const input = parseXmlStrings([CANABA])[0];
    const expected = [
      '<span><span class="lsOrth">cānăba</span> (or <span class="lsOrth">cannăba</span>), ',
      "<span>ae</span>, ",
      '<span title="Originally: f." class="lsHover">feminine</span> ',
      "<span>[kindr. with <span>κάναβος</span> and <span>κάννα</span>; acc. to others, with <span>καλύβη</span>]</span>, ",
      '<span><span class="lsEmph"><span>a hovel</span></span>, <span class="lsEmph"><span>hut</span></span>, ',
      '<span class="lsBibl"><span title="Aurelius Augustinus, Christian writer, obiit, A.D. 430" class="lsHover lsAuthor">Aug.</span> ',
      '<span title="Originally: Serm." class="lsHover">Sermones.</span> 61</span>, de Temp.; ',
      '<span class="lsBibl"><span title="Originally: Inscr. Orell." class="lsHover">Inscriptiones. Orelli.</span> 39</span>; <span>4077</span>.</span></span>',
    ];

    const output = defaultDisplay(input, {});
    expect(output.toString()).toBe(expected.join(""));
  });

  it("shows expected entry without senses", () => {
    const input = parseXmlStrings([BENEFIO])[0];
    const expected = [
      `<span><span class="lsOrth">bĕnĕfīo</span>, v. benefacio.</span>`,
    ];

    const output = defaultDisplay(input, {});
    expect(output.toString()).toBe(expected.join(""));
  });
});

describe("displayEntryFree", () => {
  function getBlurbNodes(root: XmlNode) {
    return XmlNode.assertIsNode(root.children[0]).children.slice(2);
  }

  it("handles Anthol. Lat. edge case", () => {
    const input = parseXmlStrings([BIMATRIS])[0];

    const output = displayEntryFree(input).toString();

    // Lat. should *not* be expanded to Latin!
    expect(output).toContain("Anthol. Lat.");
    expect(output).not.toContain("Latin.");
  });

  it("propagates id to output", () => {
    const input = parseXmlStrings([BIMATRIS])[0];
    const output = displayEntryFree(input);
    expect(output.getAttr("id")).toBe("n5352");
  });

  it("collapses regs", () => {
    const rawEntry = `<entryFree id="n1"><reg><sic>a</sic><corr>b</corr></reg></entryFree>`;
    const entry = parseXmlStrings([rawEntry])[0];

    const output = displayEntryFree(entry);

    expect(getBlurbNodes(output)).toStrictEqual(["b"]);
  });

  it("removes comments", () => {
    const rawEntry = `<entryFree id="n1">hello <!-- I am a comment --></entryFree>`;
    const entry = parseXmlStrings([rawEntry])[0];

    const output = displayEntryFree(entry);

    expect(getBlurbNodes(output)).toStrictEqual(["hello "]);
  });

  it("handles Lit. / Lat. edge cases", () => {
    const rawEntry = `<entryFree id="n1">Poet. Lat.</entryFree>`;
    const entry = parseXmlStrings([rawEntry])[0];

    const output = displayEntryFree(entry).toString();

    // It should not have been expanded to Latin
    expect(output).not.toContain("Originally: Lat.");
    expect(output).toContain("Poetarum Latinorum");
  });

  it("propagates id to senses", () => {
    const rawEntry =
      '<entryFree id="n1"><sense level="1" n="I" id="n33556.0">Content</sense></entryFree>';
    const entry = parseXmlStrings([rawEntry])[0];

    const output = displayEntryFree(entry);

    const listItems = output.findDescendants("li");
    expect(listItems).toHaveLength(1);
    expect(listItems[0].getAttr("id")).toBe("n33556.0");
  });
});

describe("displayAuthor", () => {
  it("handles scholar edge case", () => {
    const input = new XmlNode("author", [], ["Schneid."]);
    const output = displayAuthor(input, {});

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Schneid.");
  });

  it("handles curtius edge case", () => {
    const input = new XmlNode("author", [], ["Georg Curtius"]);
    const output = displayAuthor(input, {});

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Georg Curtius");
  });

  it("handles Pseudo edge case", () => {
    const input = new XmlNode("author", [], ["Pseudo"]);
    const output = displayAuthor(input, {});

    expect(output.children).toHaveLength(1);
    expect(output.children[0]).toBe("Pseudo");
  });

  it("handles author edge case", () => {
    const input = new XmlNode("author", [], ["Inscr. Don."]);
    const output = displayAuthor(input, {});

    expect(output.toString()).toBe(
      '<span title="Originally: Inscr. Don." class="lsHover">Inscriptiones. Donii.</span>'
    );
  });

  it("handles ambiguous author", () => {
    const input = new XmlNode("author", [], ["Plin."]);
    const bibl = new XmlNode("bibl", [], [input, "Ep. 2, 17, 25"]);

    const output = displayAuthor(input, {}, bibl);

    expect(output.toString()).toBe(
      '<span title="C. Plinius Caecilius Secundus (minor), ob. A.D. 113" class="lsHover lsAuthor">Plin.</span>'
    );
  });

  it("handles Pliny the Elder edge case", () => {
    const input = new XmlNode("author", [], ["Plin."]);
    const bibl = new XmlNode("bibl", [], [input, " 17, 2, 2, § 10"]);

    const output = displayAuthor(input, {}, bibl);

    expect(output.toString()).toBe(
      '<span title="(Likely) Pliny the Elder; (Rarely) Pliny the Younger" class="lsHover lsAuthor">Plin.</span>'
    );
  });

  it("handles Justinus edge case", () => {
    const input = new XmlNode("author", [], ["Just."]);
    const bibl = new XmlNode("bibl", [], [input, "2, 6, 15"]);

    const output = displayAuthor(input, {}, bibl);

    const expected = [
      '<span title="(Likely) Justinus, historian, about fl.(?) A.D. 150;',
      ' (Rarely) Justinianus, emperor, ob. A.D. 565"',
      ' class="lsHover lsAuthor">Just.</span>',
    ];
    expect(output.toString()).toBe(expected.join(""));
  });

  it("handles no citation after author edge case", () => {
    const input = new XmlNode("author", [], ["Just."]);
    const bibl = new XmlNode("bibl", [], [input]);

    const output = displayAuthor(input, {}, bibl);

    const expected = [
      '<span title="Justinus, historian, about fl.(?) A.D. 150',
      ' OR Justinianus, emperor, ob. A.D. 565"',
      ' class="lsHover lsAuthor">Just.</span>',
    ];
    expect(output.toString()).toBe(expected.join(""));
  });

  it("handles unknown citation after author edge case", () => {
    const input = new XmlNode("author", [], ["Just."]);
    const bibl = new XmlNode("bibl", [], [input, "Blah. 7 6"]);

    const output = displayAuthor(input, {}, bibl);

    const expected = [
      '<span title="Justinus, historian, about fl.(?) A.D. 150',
      ' OR Justinianus, emperor, ob. A.D. 565"',
      ' class="lsHover lsAuthor">Just.</span>',
    ];
    expect(output.toString()).toBe(expected.join(""));
  });

  it("handles regular author", () => {
    const input = new XmlNode("author", [], ["Censor."]);
    const output = displayAuthor(input, {});

    expect(output.toString()).toBe(
      '<span title="Censorinus, grammarian, flor. A.D. 238" class="lsHover lsAuthor">Censor.</span>'
    );
  });

  it("updates context on regular author", () => {
    const input = new XmlNode("author", [], ["Censor."]);
    const context: DisplayContext = {};

    displayAuthor(input, context);

    expect(context.lastAuthor).toBe("Censor.");
  });

  it("does not update context on id. author", () => {
    const input = new XmlNode("author", [], ["id."]);
    const context: DisplayContext = { lastAuthor: "Caes." };

    displayAuthor(input, context);

    expect(context.lastAuthor).toBe("Caes.");
  });
});

describe("empty displays", () => {
  test("display figure returns empty span", () => {
    const input = new XmlNode("figure", [], ["id."]);
    const output = displayFigure(input, {});
    expect(output.toString()).toBe("<span></span>");
  });

  test("display cb returns empty span", () => {
    const input = new XmlNode("cb", [], ["id."]);
    const output = displayCb(input, {});
    expect(output.toString()).toBe("<span></span>");
  });

  test("display pb returns empty span", () => {
    const input = new XmlNode("pb", [], ["id."]);
    const output = displayPb(input, {});
    expect(output.toString()).toBe("<span></span>");
  });
});

describe("displayQ", () => {
  it("displays contents with class", () => {
    const input = new XmlNode("q", [], ["contents"]);
    const output = displayQ(input, {});
    expect(output.toString()).toBe('<span class="lsQ">contents</span>');
  });
});

describe("displayNumber", () => {
  it("displays number with expansions", () => {
    const input = new XmlNode("number", [], ["sing."]);
    const output = displayNumber(input, {});
    expect(output.toString()).toBe(
      '<span title="Originally: sing." class="lsHover">singular</span>'
    );
  });
});

describe("displayMood", () => {
  it("displays mood with expansions", () => {
    const input = new XmlNode("mood", [], ["Part."]);
    const output = displayMood(input, {});
    expect(output.toString()).toBe(
      '<span title="Originally: Part." class="lsHover">Participle</span>'
    );
  });
});

describe("displayCase", () => {
  it("displays case with expansions", () => {
    const input = new XmlNode("case", [], ["abl."]);
    const output = displayCase(input, {});
    expect(output.toString()).toBe(
      '<span title="Originally: abl." class="lsHover">ablative</span>'
    );
  });
});

describe("displayForeign", () => {
  it("displays hebrew text rtl", () => {
    const input = new XmlNode("foreign", [["lang", "he"]], ["blah"]);
    const output = displayForeign(input, {});
    expect(output.toString()).toBe('<span dir="rtl">blah</span>');
  });
});
