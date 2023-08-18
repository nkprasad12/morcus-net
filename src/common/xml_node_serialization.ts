import { assert } from "@/common/assert";
import { XmlChild } from "@/common/xml_node";
import { XmlNode } from "@/common/xml_node";
import { Serialization, instanceOf } from "@/web/utils/rpc/parsing";

function serialize(node: XmlNode): string {
  const attrStrs = node.attrs.map((a) => `${a[0]}<${a[1]}`);
  assert(node.attrs.length < 10);
  const attrsBit = `${node.attrs.length}`;
  const summary = attrsBit + node.name;
  const header = [summary].concat(attrStrs).join("<");
  if (node.children.length === 0) {
    return header;
  }
  const children = node.children.map((c) => {
    const rawVal = typeof c === "string" ? c : serialize(c);
    const stringBit = typeof c === "string" ? "0" : "";
    return `${stringBit}${rawVal.length}<${rawVal}`;
  });
  return [header, children.join("")].join("<");
}

function deserialize(data: string): XmlNode {
  const numAttrs = +data[0];
  let i = 1;
  let j = data.indexOf("<", i);
  if (numAttrs === 0 && j === -1) {
    return new XmlNode(data.substring(i));
  }

  const name = data.substring(i, j);
  const attrs: [string, string][] = [];
  for (let k = 0; k < numAttrs; k++) {
    i = j + 1;
    j = data.indexOf("<", i);
    const key = data.substring(i, j);
    i = j + 1;
    j = data.indexOf("<", i);
    if (j === -1) {
      assert(attrs.length + 1 === numAttrs);
      attrs.push([key, data.substring(i)]);
      return new XmlNode(name, attrs);
    }
    attrs.push([key, data.substring(i, j)]);
  }

  const children: XmlChild[] = [];
  while (true) {
    i = j + 1;
    j = data.indexOf("<", i);
    if (j === -1) {
      break;
    }
    const isString = data[i] === "0";
    const childLength = +data.substring(i, j);
    i = j + 1;
    const rawChild = data.substring(i, i + childLength);
    children.push(isString ? rawChild : deserialize(rawChild));
    j = i + childLength - 1;
  }

  return new XmlNode(name, attrs, children);
}

export namespace XmlNodeSerialization {
  export const DEFAULT: Serialization<XmlNode> = {
    name: "XmlNode",
    validator: instanceOf(XmlNode),
    serialize,
    deserialize,
  };
}
