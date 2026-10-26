import fs, { readFileSync } from "fs";
import os from "os";
import path from "path";
import {
  CtsPathData,
  extractInfo,
  findCtsEncoding,
  parseCtsMetadata,
  parseXPath,
  readCtsMetadata,
} from "@/common/xml/tei_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import type { DescendantNode } from "@/common/xml/xml_text_utils";

const DBG =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

function dbgRoot(): XmlNode {
  return parseRawXml(readFileSync(DBG));
}

describe("CtsPathData test", () => {
  const D = new XmlNode("D", [["z", "2"]]);
  const C = new XmlNode("C", [], [D]);
  const B = new XmlNode("B", [["y", "1"]], [C]);
  const A = new XmlNode("A", [], [B]);
  const descendantNode: DescendantNode = [D, [A, B, C]];
  it("returns expected on regular path", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "y", index: 0 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 1 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual(["1", "2"]);
  });

  it("returns expected on descendant selector without chunks", () => {
    const path: CtsPathData[] = [
      { name: "A" },
      { name: "D", relation: "descendant" },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual([]);
  });

  it("returns expected on descendant selector with chunks", () => {
    const path: CtsPathData[] = [
      { name: "B", relation: "descendant", idInfo: { key: "y", index: 0 } },
      { name: "D", relation: "descendant", idInfo: { key: "z", index: 1 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual(["1", "2"]);
  });

  it("returns expected on out of order path", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "y", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toStrictEqual(["2", "1"]);
  });

  it("returns expected on path without ids", () => {
    const path = [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }];
    const result = CtsPathData.test(descendantNode, path);
    expect(result).toStrictEqual([]);
  });

  it("returns undefined on mismatched path length", () => {
    const path = [{ name: "A" }, { name: "B" }, { name: "C" }];
    const result = CtsPathData.test(descendantNode, path);
    expect(result).toBe(undefined);
  });

  it("returns undefined on path with incorrect name", () => {
    const path = [
      { name: "a" },
      { name: "B", idInfo: { key: "y", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "z", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toBe(undefined);
  });

  it("returns undefined on path with incorrect key", () => {
    const path = [
      { name: "A" },
      { name: "B", idInfo: { key: "z", index: 1 } },
      { name: "C" },
      { name: "D", idInfo: { key: "y", index: 0 } },
    ];

    const result = CtsPathData.test(descendantNode, path);

    expect(result).toBe(undefined);
  });
});

describe("parseXPath", () => {
  it("handles descendant paths", () => {
    const expected: CtsPathData[] = [
      { name: "div" },
      { name: "div", idInfo: { key: "n", index: 1 } },
      { name: "l", idInfo: { key: "n", index: 2 }, relation: "descendant" },
    ];

    const path = parseXPath(
      "#xpath(/tei:div/tei:div[@n='$1']//tei:l[@n='$2'])"
    );

    expect(path).toEqual(expected);
  });
});

describe("findCtsEncoding", () => {
  it("returns expected raw headers on DBG", () => {
    expect(findCtsEncoding(dbgRoot())).toStrictEqual([
      {
        name: "Section",
        idSize: 3,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
          { name: "div", idInfo: { key: "n", index: 2 } },
          { name: "div", idInfo: { key: "n", index: 3 } },
        ],
      },
      {
        name: "Chapter",
        idSize: 2,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
          { name: "div", idInfo: { key: "n", index: 2 } },
        ],
      },
      {
        name: "Book",
        idSize: 1,
        nodePath: [
          { name: "TEI" },
          { name: "text" },
          { name: "body" },
          { name: "div" },
          { name: "div", idInfo: { key: "n", index: 1 } },
        ],
      },
    ]);
  });
});

describe("extractInfo licence", () => {
  function header(availability: string): XmlNode {
    return parseRawXml(`<TEI><teiHeader><fileDesc>
      <titleStmt><title>Saturae</title><author>Juvenal</author></titleStmt>
      <publicationStmt>
        <authority>Perseus Project</authority>
        ${availability}
      </publicationStmt>
    </fileDesc></teiHeader></TEI>`);
  }

  it("reads the licence statement", () => {
    const root = header(`<availability>
      <licence target="https://creativecommons.org/licenses/by-sa/4.0/">Available under a Creative
        Commons Attribution-ShareAlike 4.0 International License</licence>
    </availability>`);

    expect(extractInfo(root).licence).toBe(
      "Available under a Creative Commons Attribution-ShareAlike 4.0 International License"
    );
  });

  it("ignores a placeholder licence without a target", () => {
    const root = header(
      `<availability status="free"><licence>Test</licence></availability>`
    );

    expect(extractInfo(root).licence).toBeUndefined();
  });

  it("is undefined without a licence", () => {
    expect(extractInfo(header("")).licence).toBeUndefined();
  });
});

describe("extractInfo title and author", () => {
  it("trims surrounding whitespace", () => {
    const root = parseRawXml(
      `<TEI><teiHeader><fileDesc><titleStmt><title> Argonautica </title><author>Valerius Flaccus </author></titleStmt></fileDesc></teiHeader></TEI>`,
      { keepWhitespace: true }
    );

    const info = extractInfo(root);

    expect(info.title).toBe("Argonautica");
    expect(info.author).toBe("Valerius Flaccus");
  });
});

describe("extractInfo __cts__.xml fallback", () => {
  function headerWith(titleStmt: string): XmlNode {
    return parseRawXml(
      `<TEI><teiHeader><fileDesc><titleStmt>${titleStmt}<editor>David Magie</editor></titleStmt></fileDesc></teiHeader></TEI>`,
      { keepWhitespace: true }
    );
  }

  it("takes a missing author from the fallback (Historia Augusta)", () => {
    const info = extractInfo(
      headerWith(`<title xml:lang="lat">De vita Hadriani</title>`),
      { author: "Scriptores Historiae Augustae", title: "De Vita Hadriani" }
    );
    expect(info.author).toBe("Scriptores Historiae Augustae");
    // The header's own title still wins.
    expect(info.title).toBe("De vita Hadriani");
  });

  it("takes a missing title from the fallback", () => {
    const info = extractInfo(headerWith(`<author>Vergil</author>`), {
      title: "Dirae",
    });
    expect(info.title).toBe("Dirae");
    expect(info.author).toBe("Vergil");
  });

  it("fails clearly with neither header nor fallback", () => {
    expect(() => extractInfo(headerWith(`<title>Dirae</title>`))).toThrow(
      /No <author> in titleStmt, and none in __cts__.xml/
    );
    expect(() =>
      extractInfo(headerWith(`<title>Dirae</title>`), { author: " " })
    ).toThrow(/No <author>/);
  });
});

const TEXTGROUP_CTS = `<ti:textgroup xmlns:ti="http://chs.harvard.edu/xmlns/cts" urn="urn:cts:latinLit:phi2331">
  <ti:groupname xml:lang="lat">Scriptores Historiae Augustae</ti:groupname>
</ti:textgroup>`;
const WORK_CTS = `<ti:work xmlns:ti="http://chs.harvard.edu/xmlns/cts" urn="urn:cts:latinLit:phi2331.phi001">
  <ti:title xml:lang="lat">De Vita
    Hadriani</ti:title>
  <ti:edition urn="urn:cts:latinLit:phi2331.phi001.perseus-lat2">
    <ti:label xml:lang="lat">De Vita Hadriani</ti:label>
  </ti:edition>
</ti:work>`;

describe("parseCtsMetadata", () => {
  it("reads the group name and work title", () => {
    expect(
      parseCtsMetadata(parseRawXml(TEXTGROUP_CTS), parseRawXml(WORK_CTS))
    ).toStrictEqual({
      author: "Scriptores Historiae Augustae",
      title: "De Vita Hadriani",
    });
  });

  it("accepts unprefixed elements and missing files", () => {
    expect(
      parseCtsMetadata(
        parseRawXml(`<textgroup><groupname>Vergil</groupname></textgroup>`),
        undefined
      )
    ).toStrictEqual({ author: "Vergil", title: undefined });
  });
});

describe("readCtsMetadata", () => {
  it("reads the __cts__.xml files next to a work", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cts-"));
    try {
      const workDir = path.join(root, "data", "phi2331", "phi001");
      fs.mkdirSync(workDir, { recursive: true });
      fs.writeFileSync(
        path.join(root, "data", "phi2331", "__cts__.xml"),
        `<?xml version="1.0" encoding="UTF-8"?>\n${TEXTGROUP_CTS}`
      );
      fs.writeFileSync(path.join(workDir, "__cts__.xml"), WORK_CTS);
      expect(
        readCtsMetadata(path.join(workDir, "phi2331.phi001.perseus-lat2.xml"))
      ).toStrictEqual({
        author: "Scriptores Historiae Augustae",
        title: "De Vita Hadriani",
      });
      expect(
        readCtsMetadata(path.join(root, "elsewhere", "x", "y.xml"))
      ).toStrictEqual({ author: undefined, title: undefined });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
