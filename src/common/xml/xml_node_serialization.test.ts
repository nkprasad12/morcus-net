// import zlib from "zlib";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import { CANABA, HABEO } from "@/common/lewis_and_short/sample_entries";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "./xml_utils";
import fs from "fs";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
// import { Serialization, instanceOf } from "@/web/utils/rpc/parsing";

// const LEGACY: Serialization<XmlNode> = {
//   name: "XmlNode",
//   validator: instanceOf(XmlNode),
//   serialize: (t) => t.toString(),
//   deserialize: (t) => parseEntries([t])[0],
// };

const MORPH_FILE = "xml_node_serialization.test.ts.tmp.morph.txt";
const INFL_DB_FILE = "xml_node_serialization.test.ts.tmp.lat.db";

beforeAll(() => {
  process.env.LATIN_INFLECTION_DB = INFL_DB_FILE;
  fs.writeFileSync(MORPH_FILE, SAMPLE_MORPHEUS_OUTPUT);
  makeMorpheusDb(MORPH_FILE, INFL_DB_FILE);
});

afterAll(() => {
  try {
    fs.unlinkSync(MORPH_FILE);
  } catch {}
  cleanupSqlTableFiles(INFL_DB_FILE);
});

function processNode(node: XmlNode): XmlNode {
  const data = XmlNodeSerialization.DEFAULT.serialize(node);
  return XmlNodeSerialization.DEFAULT.deserialize(data);
}

describe("XmlNode serialization", () => {
  it("handles no children no attrs case", () => {
    const node = new XmlNode("div");
    expect(processNode(node)).toEqual(node);
  });

  it("handles no children with attrs case", () => {
    const node = new XmlNode("div", [
      ["id", "fooBar"],
      ["className", "lsSenseBullet"],
    ]);
    expect(processNode(node)).toEqual(node);
  });

  it("handles string children with no attrs case", () => {
    const node = new XmlNode("div", [], ["Gallia est omnis", "divisa"]);
    expect(processNode(node)).toEqual(node);
  });

  it("handles simple children with attrs case", () => {
    const node = new XmlNode(
      "div",
      [
        ["id", "fooBar"],
        ["className", "lsSenseBullet"],
      ],
      ["Gallia est omnis", "divisa"]
    );
    expect(processNode(node)).toEqual(node);
  });

  it("handles simple nested children with attrs case", () => {
    const node = new XmlNode(
      "div",
      [
        ["id", "fooBar"],
        ["className", "lsSenseBullet"],
      ],
      ["Gallia est", new XmlNode("span", [], [" omnis "]), "divisa"]
    );
    expect(processNode(node)).toEqual(node);
  });

  it("handles nested children with no strings case", () => {
    const node = new XmlNode(
      "div",
      [
        ["id", "fooBar"],
        ["className", "lsSenseBullet"],
      ],
      [
        new XmlNode("span", [], ["Gallia est"]),
        new XmlNode("span", [], [" omnis "]),
      ]
    );
    expect(processNode(node)).toEqual(node);
  });

  it("handles raw canaba case", () => {
    const node = parseXmlStrings([CANABA])[0];
    expect(processNode(node)).toEqual(node);
  });

  it("handles processed canaba case", () => {
    const rawNode = parseXmlStrings([CANABA])[0];
    const node = displayEntryFree(rawNode);
    expect(processNode(node)).toEqual(node);
  });

  it("handles processed habeo case", () => {
    const rawNode = parseXmlStrings([HABEO])[0];
    const node = displayEntryFree(rawNode);
    expect(processNode(node)).toEqual(node);
  });
});

// describe("peformance test suite", () => {
//   const rawNode = parseEntries([HABEO])[0];
//   const node = displayEntryFree(rawNode);
//   const customSerialized = XmlNodeSerialization.DEFAULT.serialize(node);
//   const xmlSerialized = LEGACY.serialize(node);

//   function measureRuntime(
//     data: string,
//     method: Serialization<XmlNode>
//   ): number {
//     const start = performance.now();
//     method.deserialize(data);
//     return performance.now() - start;
//   }

//   function gzipSize(data: string): Promise<number> {
//     const buf = Buffer.from(data, "utf-8"); // Choose encoding for the string.
//     return new Promise((resolve) => {
//       zlib.gzip(buf, (_, result) => resolve(result.byteLength));
//     });
//   }

//   const average = (array: number[]) =>
//     array.reduce((a, b) => a + b) / array.length;

//   it("deserializes faster than default parser", () => {
//     const legacy: number[] = [];
//     const custom: number[] = [];
//     for (let i = 0; i < 10; i++) {
//       legacy.push(measureRuntime(xmlSerialized, LEGACY));
//       custom.push(
//         measureRuntime(customSerialized, XmlNodeSerialization.DEFAULT)
//       );
//     }

//     expect(average(custom)).toBeLessThan(average(legacy) / 5);
//   });

//   it("produces smaller raw than default parser", () => {
//     console.log(xmlSerialized.length / 1024);
//     console.log(customSerialized.length / 1024);
//     expect(customSerialized.length).toBeLessThan(xmlSerialized.length);
//   });

//   it("produces smaller gzipped than default parser", async () => {
//     const xmlSize = await gzipSize(xmlSerialized);
//     console.log("Before: " + xmlSize / 1024);
//     const customSize = await gzipSize(customSerialized);
//     console.log("After: " + customSize / 1024);
//     expect(customSize).toBeLessThan(xmlSize);
//   });
// });
