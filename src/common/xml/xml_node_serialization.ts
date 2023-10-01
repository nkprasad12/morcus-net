/**
 * @file This file contains functions for serializing and deserializing XmlNodes.
 * @module XmlNodeSerialization
 */

import { assert } from "@/common/assert";
import { XmlChild } from "@/common/xml/xml_node";
import { XmlNode } from "@/common/xml/xml_node";
import { Serialization, instanceOf } from "@/web/utils/rpc/parsing";

/**
 * Serializes an XmlNode to a string.
 * @param node - The XmlNode to serialize.
 * @returns The serialized string.
 */
function serialize(node: XmlNode): string {
  // ...
}

/**
 * Deserializes a string to an XmlNode.
 * @param data - The string to deserialize.
 * @returns The deserialized XmlNode.
 */
function deserialize(data: string): XmlNode {
  // ...
}

/**
 * A namespace containing a default Serialization object for XmlNodes.
 * @namespace XmlNodeSerialization
 */
export namespace XmlNodeSerialization {
  /**
   * The default Serialization object for XmlNodes.
   * @type {Serialization<XmlNode>}
   */
  export const DEFAULT: Serialization<XmlNode> = {
    name: "XmlNode",
    validator: instanceOf(XmlNode),
    serialize,
    deserialize,
  };
}
