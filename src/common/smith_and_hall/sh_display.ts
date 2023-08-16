import { ShEntry } from "@/common/smith_and_hall/sh_process";
import { XmlChild, XmlNode } from "@/common/xml_node";

export function displayShEntry(entry: ShEntry, id: number): XmlNode {
  const senseText = entry.senses.map(
    (sense, j) =>
      new XmlNode(
        "div",
        [["id", `sh${id}.${j}`]],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsSenseBullet"],
              ["senseid", `sh${id}.${j}`],
            ],
            [` ${sense.level}. `]
          ),
          new XmlNode("span", [], [sense.text]),
        ]
      )
  );
  const mainBlurbButton: XmlChild[] = [
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", `sh${id}`],
      ],
      [" ‣ "]
    ),
    " ",
  ];
  const blurbText = new XmlNode(
    "div",
    [["id", `sh${id}`]],
    mainBlurbButton.concat([entry.blurb])
  );

  return new XmlNode("div", [], [blurbText, ...senseText]);
}
