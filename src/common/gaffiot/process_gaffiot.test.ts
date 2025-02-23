import {
  assertAllSenseNodesTopLevel,
  buildSenseTree,
  texToXml,
} from "@/common/gaffiot/process_gaffiot";
import { XmlNode } from "@/common/xml/xml_node";
import exp from "constants";
import { readFileSync } from "fs";

describe("texToXml", () => {
  it("should process plain text correctly", () => {
    const input = "plain text";
    const result = texToXml(input);
    expect(result).toEqual(["plain text"]);
  });

  it("should remove xml comments", () => {
    const input = "plain <! remove this -->text";
    const result = texToXml(input);
    expect(result).toEqual(["plain text"]);
  });

  it("should process text with a single tag correctly", () => {
    const input = "\\lat{content}";
    const result = texToXml(input);
    expect(result).toEqual([new XmlNode("lat", [], ["content"])]);
  });

  it("should process text with unit named tags", () => {
    const input = "\\kern-0.2emwhatever";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("kern", [["unit", "0.2em"]], []),
      "whatever",
    ]);
  });

  it("removes unwanted characters", () => {
    const input = "\\kern0.2em~whateve$r$";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("kern", [["unit", "0.2em"]], []),
      " whatever",
    ]);
  });

  it("should process nested tags correctly", () => {
    const input = "\\lat{\\aut{content}}";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("lat", [], [new XmlNode("aut", [], ["content"])]),
    ]);
  });

  it("should process nested tags with plain string siblings correctly", () => {
    const input = "\\lat{hello \\aut{content} hi}";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode(
        "lat",
        [],
        ["hello ", new XmlNode("aut", [], ["content"]), " hi"]
      ),
    ]);
  });

  it("should process text with multiple tags correctly", () => {
    const input = "\\lat{content1}\\aut{content2}";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("lat", [], ["content1"]),
      new XmlNode("aut", [], ["content2"]),
    ]);
  });

  it("should handle kern with immediate follower correctly", () => {
    const input = "\\kern-0.4em\\lat{content2}";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("kern", [["unit", "0.4em"]], []),
      new XmlNode("lat", [], ["content2"]),
    ]);
  });

  it("should process text with tags and plain text correctly", () => {
    const input = "plain \\lat{text} plain";
    const result = texToXml(input);
    expect(result).toEqual([
      "plain ",
      new XmlNode("lat", [], ["text"]),
      " plain",
    ]);
  });

  it("should handle intended bracketless tags", () => {
    const input = "plain \\F \\lat{text} plain";
    const result = texToXml(input);
    expect(result).toEqual([
      "plain ",
      new XmlNode("F", [], []),
      " ",
      new XmlNode("lat", [], ["text"]),
      " plain",
    ]);
  });

  it("should throw an error for unmatched brackets", () => {
    const input = "\\lat{content";
    expect(() => texToXml(input)).toThrow("Unmatched bracket in input string");
  });

  it("should handle nameless bracket", () => {
    const input = "\\lat{content}{other}";
    const result = texToXml(input);
    expect(result).toEqual([
      new XmlNode("lat", [], ["content"]),
      new XmlNode("nameless", [], ["other"]),
    ]);
  });
});

describe("assertAllSenseNodesTopLevel", () => {
  it("should not throw an error for non-nested sense nodes", () => {
    const input = [new XmlNode("qq", [], ["content"])];
    expect(() => assertAllSenseNodesTopLevel(input)).not.toThrow();
  });

  it("should throw an error for nested sense nodes", () => {
    const input = [
      new XmlNode("Rub", [], [new XmlNode("pp", [], ["content"])]),
    ];
    expect(() => assertAllSenseNodesTopLevel(input)).toThrow();
  });

  it("should throw an error for child sense nodes", () => {
    const input = [
      new XmlNode("div", [], [new XmlNode("pp", [], ["content"])]),
    ];
    expect(() => assertAllSenseNodesTopLevel(input)).toThrow();
  });
});

describe("buildSenseTree", () => {
  it("should build a sense tree correctly", () => {
    const input = [
      new XmlNode("Rub", [], ["I"]),
      new XmlNode("pp", [], ["1"]),
      new XmlNode("qq", [], ["a"]),
    ];
    const result = buildSenseTree(input);
    expect(result).toEqual([
      {
        label: " • ",
        content: [],
        children: [],
      },
      {
        label: "I",
        content: [],
        children: [
          {
            label: "1",
            content: [],
            children: [
              {
                label: "a",
                content: [],
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("captures expected siblings senses", () => {
    const input = [
      new XmlNode("Rub", [], ["I"]),
      "content1",
      new XmlNode("Rub", [], ["II"]),
      "content2",
    ];

    const result = buildSenseTree(input);

    expect(result).toEqual([
      {
        label: " • ",
        content: [],
        children: [],
      },
      {
        label: "I",
        content: ["content1"],
        children: [],
      },
      {
        label: "II",
        content: ["content2"],
        children: [],
      },
    ]);
  });

  it("should handle blurb correctly", () => {
    const input = ["Some introductory text", new XmlNode("Rub", [], ["I"])];
    const result = buildSenseTree(input);
    expect(result).toEqual([
      {
        label: " • ",
        content: ["Some introductory text"],
        children: [],
      },
      {
        label: "I",
        content: [],
        children: [],
      },
    ]);
  });
});
