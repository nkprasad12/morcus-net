// import zlib from "zlib";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import { CANABA, HABEO } from "@/common/lewis_and_short/sample_entries";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "./xml_utils";

console.debug = jest.fn();

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

beforeAll(() => {
  process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
});

afterAll(() => {
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

// import { Serialization, instanceOf } from "@/web/utils/rpc/parsing";

// const LEGACY: Serialization<XmlNode> = {
//   name: "XmlNode",
//   validator: instanceOf(XmlNode),
//   serialize: (t) => t.toString(),
//   deserialize: (t) => parseXmlStrings([t])[0],
// };

// interface JsonXmlNode {
//   n: string;
//   a?: [string, string][];
//   c?: (string | JsonXmlNode)[];
// }

// function simplify(t: XmlNode): JsonXmlNode {
//   const result: JsonXmlNode = { n: t.name };
//   if (t.attrs.length > 0) {
//     result.a = t.attrs;
//   }
//   if (t.children.length === 0) {
//     return result;
//   }
//   result.c = t.children.map((c) => (typeof c === "string" ? c : simplify(c)));
//   return result;
// }

// function complicate(t: JsonXmlNode): XmlNode {
//   return new XmlNode(
//     t.n,
//     t.a,
//     t.c?.map((c) => (typeof c === "string" ? c : complicate(c)))
//   );
// }

// export const JSONISH: Serialization<XmlNode> = {
//   name: "XmlNode",
//   validator: instanceOf(XmlNode),
//   serialize: (t) => JSON.stringify(simplify(t)),
//   deserialize: (t) => complicate(JSON.parse(t)),
// };

// type JsonXmlNode2 = [string, [string, string][], (string | JsonXmlNode2)[]];

// function simplify2(t: XmlNode): JsonXmlNode2 {
//   return [
//     t.name,
//     t.attrs,
//     t.children.map((c) => (typeof c === "string" ? c : simplify2(c))),
//   ];
// }

// function complicate2(t: JsonXmlNode2): XmlNode {
//   return new XmlNode(
//     t[0],
//     t[1],
//     t[2].map((c) => (typeof c === "string" ? c : complicate2(c)))
//   );
// }

// export const JSONISH2: Serialization<XmlNode> = {
//   name: "XmlNode",
//   validator: instanceOf(XmlNode),
//   serialize: (t) => JSON.stringify(simplify2(t)),
//   deserialize: (t) => complicate2(JSON.parse(t)),
// };

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
//   process.env.LATIN_INFLECTION_DB = "latin_inflect.db";
//   const customMethod = JSONISH2;
//   const rawNode = parseXmlStrings([HABEO])[0];
//   const node = displayEntryFree(rawNode);
//   const customSerialized = customMethod.serialize(node);
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
//       custom.push(measureRuntime(customSerialized, customMethod));
//     }

//     const customAverage = average(custom);
//     const legacyAverage = average(legacy);
//     console.log("XML deserialize ms: " + legacyAverage);
//     console.log("Custom deserialize ms: " + customAverage);

//     expect(customAverage).toBeLessThan(legacyAverage / 5);
//   });

//   it("produces smaller raw than default parser", () => {
//     console.log("XML raw kB: " + xmlSerialized.length / 1000);
//     console.log("Custom raw kB: " + customSerialized.length / 1000);
//     expect(customSerialized.length).toBeLessThan(xmlSerialized.length);
//   });

//   it("produces smaller gzipped than default parser", async () => {
//     const xmlSize = await gzipSize(xmlSerialized);
//     console.log("XML gzip kB: " + xmlSize / 1000);
//     const customSize = await gzipSize(customSerialized);
//     console.log("Custom gzip kB: " + customSize / 1000);
//     expect(customSize).toBeLessThan(xmlSize);
//   });
// });
