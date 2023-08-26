import { assert, assertEqual } from "@/common/assert";

const INDENT = "-   ";

export const COMMENT_NODE = "#comment";

export type XmlChild = XmlNode | string;

export class XmlNode {
  constructor(
    readonly name: string,
    readonly attrs: [string, string][] = [],
    readonly children: XmlChild[] = []
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
    const children: XmlChild[] = [];
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

  export function assertIsString(node: XmlChild): string {
    if (typeof node === "string") {
      return node;
    }
    throw new Error(`Expected "string", but got ${node.formatAsString()}`);
  }

  export function assertIsNode(node: XmlChild, name?: string): XmlNode {
    if (typeof node === "string") {
      throw new Error(`Expected XmlNode, but got string.`);
    }
    if (name !== undefined) {
      assertEqual(name, node.name);
    }
    return node;
  }
}
