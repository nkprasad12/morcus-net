import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assert, assertEqual } from "@/common/assert";

const ENTRY_OPEN = "<entryFree ";
const ENTRY_CLOSE = "</entryFree>";

const ATTRIBUTES_KEY = ":@";
const TEXT_NODE = "#text";
const INDENT = "-   ";

export const COMMENT_NODE = "#comment";

export class XmlNode {
  constructor(
    readonly name: string,
    readonly attrs: [string, string][] = [],
    readonly children: (XmlNode | string)[] = []
  ) {}

  formatAsString(indent: boolean = true, level: number = 0): string {
    const padding = indent ? INDENT.repeat(level) : "";
    let attrributes = "";
    for (const attr of this.attrs) {
      attrributes += ` ${attr[0]}="${attr[1]}"`;
    }
    let tagOpen = `${padding}<${this.name}${attrributes}`;
    if (this.children.length === 0 && ["cb"].includes(this.name)) {
      return `${tagOpen}/>`;
    }
    if (this.name === COMMENT_NODE) {
      tagOpen = `${padding}<!--`;
    } else {
      tagOpen += ">";
    }
    const lines = [tagOpen];
    for (const child of this.children) {
      if (typeof child === "string") {
        lines.push(`${padding}${indent ? INDENT : ""}${child}`);
        continue;
      }
      lines.push(child.formatAsString(indent, level + 1));
    }
    if (this.name === COMMENT_NODE) {
      lines.push(`${padding}-->`);
    } else {
      lines.push(`${padding}</${this.name}>`);
    }
    return lines.join(indent ? "\n" : "");
  }

  findChildren(name: string): XmlNode[] {
    const result: XmlNode[] = [];
    for (const child of this.children) {
      if (typeof child === "string") {
        continue;
      }
      if (child.name === name) {
        result.push(child);
      }
    }
    return result;
  }

  /** Returns all descendants with the given `name`. */
  findDescendants(name: string): XmlNode[] {
    const result: XmlNode[] = [];
    for (const child of this.children) {
      if (typeof child === "string") {
        continue;
      }
      if (child.name === name) {
        result.push(child);
      }
      child.findDescendants(name).forEach((element) => {
        result.push(element);
      });
    }
    return result;
  }

  toString(): string {
    return this.formatAsString(false);
  }

  getAttr(attrName: string): string | undefined {
    for (const [key, value] of this.attrs) {
      if (attrName === key) {
        return value;
      }
    }
    return undefined;
  }

  deepcopy(): XmlNode {
    const children: (XmlNode | string)[] = [];
    for (const child of this.children) {
      if (typeof child === "string") {
        children.push(child);
      } else {
        children.push(child.deepcopy());
      }
    }
    const attrs: [string, string][] = this.attrs.map(([k, v]) => [k, v]);
    return new XmlNode(this.name, attrs, children);
  }
}

export namespace XmlNode {
  export function getSoleText(node: XmlNode): string {
    assert(node.children.length === 1);
    return assertIsString(node.children[0]);
  }

  export function assertIsString(node: string | XmlNode): string {
    if (typeof node === "string") {
      return node;
    }
    throw new Error(`Expected "string", but got ${node.formatAsString()}`);
  }

  export function assertIsNode(node: string | XmlNode, name?: string): XmlNode {
    if (typeof node === "string") {
      throw new Error(`Expected XmlNode, but got string.`);
    }
    if (name !== undefined) {
      assertEqual(name, node.name);
    }
    return node;
  }
}

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
  const children: (XmlNode | string)[] = [];

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

export function* parseEntriesInline(
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

export function parseEntries(
  entries: string[],
  validate: boolean = false
): XmlNode[] {
  return [...parseEntriesInline(entries, validate)];
}

export function extractEntries(xmlContents: string): string[] {
  const lines = xmlContents.split("\n");
  const entries = [];
  let partial = "";

  for (const line of lines) {
    const openIndex = line.indexOf(ENTRY_OPEN);
    const closeIndex = line.indexOf(ENTRY_CLOSE);

    const hasOpen = openIndex !== -1;
    const hasClose = closeIndex !== -1;
    const hasPartial = partial.length > 0;

    if (hasOpen && !hasClose) {
      console.debug("Got open without close");
      console.debug(line.substring(0, 50));
    }
    if (hasOpen) {
      const beforeOpen = line.substring(0, openIndex);
      if (beforeOpen.trim().length !== 0) {
        throw new Error("Got non-whitespace before open.");
      }
    }
    if (hasClose) {
      const afterClose = line.substring(closeIndex + ENTRY_CLOSE.length);
      if (afterClose.trim().length !== 0) {
        throw new Error("Got non-whitespace after close.");
      }
    }
    if (hasOpen && hasPartial) {
      throw new Error("Got unclosed entry.");
    }
    if (!hasOpen && hasClose && !hasPartial) {
      throw new Error("Got unopened entry.");
    }
    if (!hasOpen && !hasClose && !hasPartial) {
      // We're in a non-entry block.
      continue;
    }

    if (hasOpen || hasPartial) {
      partial += line + "\n";
    }
    if (hasClose) {
      entries.push(partial.trim());
      partial = "";
    }
  }

  if (partial.length > 0) {
    throw new Error("Got unclosed entry.");
  }
  return entries;
}
