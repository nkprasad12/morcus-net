import { XmlNode } from "@/common/lewis_and_short/xml_node";
import {
  attachAltEnd,
  attachAltStart,
  cleanOrths,
  rawOrths,
  regularizeOrths,
} from "./ls_orths";

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

    expect(result).toStrictEqual(["Caesar", "divisa"]);
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
});
