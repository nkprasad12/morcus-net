import { extractOutline, getBullet } from "@/common/lewis_and_short/ls_outline";
import { XmlNode } from "@/common/xml/xml_node";

describe("getBullet", () => {
  it("returns original on unparenthesized", () => {
    expect(getBullet("I")).toBe("I");
  });

  it("returns Greek character on known parenthesized", () => {
    expect(getBullet("(d)")).toBe("δ");
  });

  it("returns original on unknown parenthesized", () => {
    expect(getBullet("(*d)")).toBe("(*d)");
  });
});

describe("extractOutline", () => {
  it("requires entryFree", () => {
    const root = new XmlNode("sense");
    expect(() => extractOutline(root)).toThrow();
  });

  it("handles entry with no senses", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [new XmlNode("orth", [], ["mainKey"]), " I am a blurb."]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [],
    });
  });

  it("handles macron + breves", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [new XmlNode("orth", [], ["ăd-ĕō^"])]
    );

    const result = extractOutline(root);

    expect(result.mainSection.text).toStrictEqual("ăd-ĕō̆");
  });

  it("removes etym from main blurb", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am ",
        new XmlNode("etym", [], ["I will be skipped"]),
        "a blurb.",
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [],
    });
  });

  it("truncates main blurb", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am ",
        new XmlNode("etym", [], ["I will be skipped"]),
        "a blurb.",
        ..." A very long blurb!".repeat(500).split(" "),
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb." + "Averylongblurb!".repeat(4) + " ...",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [],
    });
  });

  it("handles entry with a single sense", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am a blurb.",
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "I"],
            ["id", "n2"],
          ],
          ["I am a sense1 blurb"]
        ),
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [
        {
          level: 1,
          ordinal: "I.",
          sectionId: "n2",
          text: "I am a sense1 blurb",
        },
      ],
    });
  });

  it("handles entry with no 1I senses", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am a blurb.",
        new XmlNode(
          "sense",
          [
            ["level", "3"],
            ["n", "B"],
            ["id", "n2"],
          ],
          ["I am a sense1 blurb"]
        ),
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [
        {
          level: 3,
          ordinal: "B.",
          sectionId: "n2",
          text: "I am a sense1 blurb",
        },
      ],
    });
  });

  it("handles entry with duplicated 1I senses", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am a blurb.",
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "I"],
            ["id", "n2"],
          ],
          ["I am a sense1 blurb"]
        ),
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "I"],
            ["id", "n3"],
          ],
          ["I am a sense2 blurb"]
        ),
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "II"],
            ["id", "n4"],
          ],
          ["I am a sense3 blurb"]
        ),
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.; I am a sense1 blurb",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [
        {
          level: 1,
          ordinal: "I.",
          sectionId: "n3",
          text: "I am a sense2 blurb",
        },
        {
          level: 1,
          ordinal: "II.",
          sectionId: "n4",
          text: "I am a sense3 blurb",
        },
      ],
    });
  });

  it("handles entry with multiple regular senses", () => {
    const root = new XmlNode(
      "entryFree",
      [["id", "n1"]],
      [
        new XmlNode("orth", [], ["mainKey"]),
        " I am a blurb.",
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "I"],
            ["id", "n2"],
          ],
          [
            "I am a sense1 blurb I am a sense1 blurb I am a sense1 blurb I am a sense1 blurb",
          ]
        ),
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "II"],
            ["id", "n3"],
          ],
          ["I (skipped) am a sense2 blurb"]
        ),
        new XmlNode(
          "sense",
          [
            ["level", "1"],
            ["n", "III"],
            ["id", "n4"],
          ],
          ["a sense3[as will I] blurb"]
        ),
      ]
    );

    const result = extractOutline(root);

    expect(result).toStrictEqual({
      mainKey: "mainKey",
      mainSection: {
        text: "mainKey I am a blurb.",
        level: 0,
        ordinal: "",
        sectionId: "n1",
      },
      senses: [
        {
          level: 1,
          ordinal: "I.",
          sectionId: "n2",
          text: "I am a sense1 blurb I am a sense1 blurb I am a sense1 blurb I am a sense1 blurb ...",
        },
        {
          level: 1,
          ordinal: "II.",
          sectionId: "n3",
          text: "I  am a sense2 blurb",
        },
        {
          level: 1,
          ordinal: "III.",
          sectionId: "n4",
          text: "a sense3 blurb",
        },
      ],
    });
  });
});
