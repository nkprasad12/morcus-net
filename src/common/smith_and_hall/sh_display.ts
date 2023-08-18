import { ShEntry, ShSense } from "@/common/smith_and_hall/sh_entry";
import { XmlChild, XmlNode } from "@/common/xml_node";

function formatSenseList(senses: ShSense[], entryId: number): XmlNode {
  if (senses.length === 0) {
    return new XmlNode("div");
  }
  const stack: XmlNode[] = [];

  for (let i = 0; i < senses.length; i++) {
    const sense = senses[i];
    const level = sense.level;
    const id = `sh${entryId}.${i}`;

    while (stack.length < level) {
      const attrs: [string, string][] =
        level === 1 ? [["class", "lsTopSense"]] : [];
      const newList = new XmlNode("ol", attrs, []);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(newList);
      }
      stack.push(newList);
    }
    while (stack.length > level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(
      new XmlNode(
        "li",
        [["id", id]],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsSenseBullet"],
              ["senseid", id],
            ],
            [` ${sense.bullet} `]
          ),
          sense.text,
        ]
      )
    );
  }
  return stack[0];
}

export function displayShEntry(entry: ShEntry, id: number): XmlNode {
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

  return new XmlNode("div", [], [blurbText, formatSenseList(entry.senses, id)]);
}
