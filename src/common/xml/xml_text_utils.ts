import { arrayMap } from "@/common/data_structures/collect_map";
import type { XmlNode } from "@/common/xml/xml_node";

/** A node of text within an XML tree. */
export interface SingleTextNode {
  /** The content of the text node. */
  readonly text: string;
  /** The parent node containing this text. */
  parent: XmlNode;
  /** The index of the text in the parent node's children. */
  textIndex: number;
  /** All ancestors of the parent node. Closer ancestors should be later in the list. */
  ancestors: XmlNode[];
}

/** A node of text within an XML tree with metadata for other nodes. */
export interface TextNodeData extends SingleTextNode {
  /** A registry of text nodes by parent node. */
  readonly registry: Map<XmlNode, SingleTextNode[]>;
}

/**
 * Returns all nodes containing text in the tree rooted by the input node.
 *
 * @param root The root node of the tree to search from.
 *
 * @returns Data for all text nodes, in DFS sequence.
 */
export function findTextNodes(root: XmlNode): TextNodeData[] {
  const allNodes = findTextNodesInternal(root, []);
  const registry = arrayMap<XmlNode, SingleTextNode>();
  for (const node of allNodes) {
    registry.add(node.parent, node);
  }
  return allNodes.map((node) =>
    Object.assign(node, { registry: registry.map })
  );
}

function findTextNodesInternal(
  root: XmlNode,
  ancestors: XmlNode[] = []
): SingleTextNode[] {
  let results: SingleTextNode[] = [];
  root.children.forEach((child, i) => {
    if (typeof child === "string") {
      results.push({
        text: child,
        parent: root,
        textIndex: i,
        ancestors: ancestors.map((x) => x),
      });
    } else {
      results = results.concat(
        findTextNodesInternal(child, ancestors.concat([root]))
      );
    }
  });
  return results;
}

export type DescendantNode = [XmlNode, XmlNode[]];
