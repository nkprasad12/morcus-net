import {
  rawOrths,
  cleanOrths,
  regularizeOrths,
  attachAltStart,
  attachAltEnd,
  removeStackedVowelMarkers,
  displayTextForOrth,
  getOrths,
  derivedOrths,
} from "@/common/lewis_and_short/ls_orths";
import { XmlNode } from "@/common/xml/xml_node";

console.debug = jest.fn();

describe("rawOrths", () => {
  it("returns only expected orths", () => {
    const root = new XmlNode(
      "entryFree",
      [],
      [
        new XmlNode("orth", [["type", "alt"]], ["Gallia"]),
        new XmlNode("orth", [], ["Caesar"]),
        new XmlNode("sense", [], ["est"]),
        "omnis",
        new XmlNode("orth", [], ["divisa"]),
      ]
    );

    const result = rawOrths(root);

    expect(result).toStrictEqual(["Gallia", "Caesar", "divisa"]);
  });

  it("handles reg", () => {
    const root = new XmlNode(
      "entryFree",
      [],
      [
        new XmlNode("orth", [], ["Gallia"]),
        new XmlNode(
          "orth",
          [],
          [
            new XmlNode(
              "reg",
              [],
              [
                new XmlNode("sic", [], ["est"]),
                new XmlNode("corr", [], ["omnis"]),
              ]
            ),
          ]
        ),
      ]
    );

    const result = rawOrths(root);

    expect(result).toStrictEqual(["Gallia", "omnis"]);
  });
});

describe("cleanOrths", () => {
  it("removes hapax marks", () => {
    const result = cleanOrths(["† Gallia"]);
    expect(result).toStrictEqual(["Gallia"]);
  });

  it("removes odd characters", () => {
    const result = cleanOrths(["Cœsar"]);
    expect(result).toStrictEqual(["Caesar"]);
  });

  it("strips trailing punctuation", () => {
    const input = ["véni?"];
    const result = cleanOrths(input);
    expect(result).toStrictEqual(["véni"]);
  });

  it("splits strings and cleans", () => {
    const result = cleanOrths(["Cœsar, Julius"]);
    expect(result).toStrictEqual(["Caesar", "Julius"]);
  });
});

describe("regularizeOrths", () => {
  it("maps empty to empty", () => {
    const result = regularizeOrths([]);
    expect(result).toHaveLength(0);
  });

  it("leaves regulars unmodified", () => {
    const input = ["véni"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["véni"]);
  });

  it("leaves trailing dashes unmodified", () => {
    const input = ["véni-"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["véni-"]);
  });

  it("leaves initial dashes unmodified", () => {
    const input = ["-véni"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["-véni"]);
  });

  it("handles alternate start", () => {
    const input = ["interclūdo", "-claudo"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["interclūdo", "interclaudo"]);
  });

  it("handles multiple alternate start", () => {
    const input = ["blahcles", "-as", "-is"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["blahcles", "blahclas", "blahclis"]);
  });

  it("handles cases with alternate end", () => {
    const input = ["Carthago", "Karth-"];
    const result = regularizeOrths(input);
    expect(result).toStrictEqual(["Carthago", "Karthago"]);
  });
});

describe("attachAltStart", () => {
  it("handles adf-", () => {
    const result = attachAltStart(["affābĭlis"], "adf-");
    expect(result).toBe("adfābĭlis");
  });
});

// Make sure to check saturnalia works as expected
describe("attachAltEnd", () => {
  it("handles -tius", () => {
    const result = attachAltEnd(["agnātīcĭus"], "-tĭus");
    expect(result).toBe("agnātītĭus");
  });

  it("handles os, -us", () => {
    const result = attachAltEnd(["lapos"], "-us");
    expect(result).toBe("lapus");
  });

  it("handles is, -us", () => {
    const result = attachAltEnd(["anāpis"], "-us");
    expect(result).toBe("anāpus");
  });

  it("returns closest match for alt orths", () => {
    const result = attachAltEnd(["ăcŏpos", "ăcŏpus", "ăcōpon"], "-um");
    expect(result).toBe("ăcōpum");
  });
});

describe("mergeVowelMarkers", () => {
  it("removes lengths if present", () => {
    expect(removeStackedVowelMarkers("a^na")).toBe("ana");
  });

  it("is no-op if not present", () => {
    expect(removeStackedVowelMarkers("ana")).toBe("ana");
  });
});

describe("displayTextForOrths", () => {
  it("adds correct unicode symbols", () => {
    expect(displayTextForOrth("a^a_")).toBe("a\u0306a\u0304");
  });
});

describe("getOrths", () => {
  it("removes duplicates", () => {
    const orth1 = new XmlNode("orth", [], ["adpello"]);
    const orth2 = new XmlNode("orth", [], ["appello"]);
    const orth3 = new XmlNode("orth", [], ["adpello"]);
    const root = new XmlNode("entryFree", [], [orth1, orth2, orth3]);

    const result = getOrths(root);

    expect(result).toHaveLength(2);
    expect(result).toContain("appello");
    expect(result).toContain("adpello");
  });

  it("gets orths of initial etym", () => {
    const orth1 = new XmlNode("orth", [], ["adpello"]);
    const orth2 = new XmlNode("orth", [], ["appello"]);
    const root = new XmlNode(
      "entryFree",
      [],
      [orth1, new XmlNode("etym", [], [orth2])]
    );

    const result = getOrths(root);

    expect(result).toHaveLength(2);
    expect(result).toContain("appello");
    expect(result).toContain("adpello");
  });

  it("does not return orths of other children", () => {
    const orth1 = new XmlNode("orth", [], ["adpello"]);
    const orth2 = new XmlNode("orth", [], ["appello"]);
    const root = new XmlNode(
      "entryFree",
      [],
      [orth1, new XmlNode("div", [], [orth2])]
    );

    const result = getOrths(root);

    expect(result).toHaveLength(1);
    expect(result).toContain("adpello");
  });

  it("does not return orths of nested etym children", () => {
    const orth1 = new XmlNode("orth", [], ["adpello"]);
    const orth2 = new XmlNode("orth", [], ["appello"]);
    const root = new XmlNode(
      "entryFree",
      [],
      [orth1, new XmlNode("div", [], [new XmlNode("etym", [], [orth2])])]
    );

    const result = getOrths(root);

    expect(result).toHaveLength(1);
    expect(result).toContain("adpello");
  });
});

describe("derivedOrths", () => {
  it("does not return orths of base", () => {
    const orth1 = new XmlNode("orth", [], ["adpello"]);
    const orth2 = new XmlNode("orth", [], ["appello"]);
    const root = new XmlNode(
      "entryFree",
      [["id", "1"]],
      [orth1, new XmlNode("div", [["id", "1.1"]], [orth2])]
    );

    const result = derivedOrths(root);

    expect(result).toStrictEqual([["1.1", ["appello"]]]);
  });

  it("Handles orths that need regularization", () => {
    const orth1 = new XmlNode("orth", [], ["appello"]);
    const orth2 = new XmlNode("orth", [], ["adp-"]);
    const root = new XmlNode(
      "entryFree",
      [["id", "1"]],
      [new XmlNode("div", [["id", "1.1"]], [orth1, orth2])]
    );

    const result = derivedOrths(root);

    expect(result).toStrictEqual([["1.1", ["appello", "adpello"]]]);
  });
});
