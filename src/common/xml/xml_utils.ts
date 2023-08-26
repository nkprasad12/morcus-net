import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assert } from "@/common/assert";
import { COMMENT_NODE, XmlChild, XmlNode } from "@/common/xml/xml_node";

const ATTRIBUTES_KEY = ":@";
const TEXT_NODE = "#text";

function crawlEntry(root: any): XmlNode {
  // Each node in the parsed XML tree is either a text node, which is
  // a leaf, or a tag node. Tag nodes have a property keyed to the
  // name of the tag, which has a value equal to an array of all the
  // nodes inside the tag node. Tag nodes may also have a property
  // which is an object containing all of its attributes. Tag nodes have
  // no other properties.
  const keys = Object.keys(root);
  if (keys.includes("#text")) {
    if (keys.length !== 1) {
      throw new Error("Found #text node with unexpected properties.");
    }
  }
  if (keys.length < 1 || keys.length > 2) {
    throw new Error("Found tag node with unexpected properties.");
  }
  if (keys.length === 2 && !keys.includes(ATTRIBUTES_KEY)) {
    throw new Error("Found tag node with unexpected properties.");
  }

  const tagName = keys.filter((key) => key !== ATTRIBUTES_KEY)[0];
  const attributes: [string, string][] = [];
  const children: XmlChild[] = [];

  if (keys.includes(ATTRIBUTES_KEY)) {
    for (const attribute in root[ATTRIBUTES_KEY]) {
      const value = root[ATTRIBUTES_KEY][attribute];
      const originalName = attribute.substring(2);
      attributes.push([originalName, `${value}`]);
    }
  }
  for (const child of root[tagName]) {
    if (isTextNode(child)) {
      children.push(`${child[TEXT_NODE]}`);
      continue;
    }
    const childResult = crawlEntry(child);
    children.push(childResult);
  }
  return new XmlNode(tagName, attributes, children);
}

function isTextNode(node: any): boolean {
  const keys = Object.keys(node);
  if (keys.includes("#text")) {
    assert(keys.length === 1, "Found #text node with unexpected properties.");
    return true;
  }
  return false;
}

export function* parseXmlStringsInline(
  entries: string[],
  validate: boolean = false
): Generator<XmlNode> {
  const options = {
    ignoreAttributes: false,
    alwaysCreateTextNode: true,
    preserveOrder: true,
    trimValues: false,
    commentPropName: COMMENT_NODE,
  };
  const parser = new XMLParser(options);
  for (const entry of entries) {
    const entryFree = parser.parse(entry)[0];
    if (validate && XMLValidator.validate(entry) !== true) {
      throw new Error(
        `XML Validation Error: ${JSON.stringify(
          XMLValidator.validate(entry)
        )}\n${entry}`
      );
    }
    yield crawlEntry(entryFree);
  }
}

export function parseXmlStrings(
  entries: string[],
  validate: boolean = false
): XmlNode[] {
  return [...parseXmlStringsInline(entries, validate)];
}
