import { assert, assertEqual } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";
import {
  ProcessedWork,
  ProcessedWorkNode,
} from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { TEXT_BREAK_CHARACTERS } from "@/common/text_cleaning";
import {
  ROOT_NODE_NAME,
  TeiCtsDocument,
  TeiNode,
} from "@/common/xml/tei_utils";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { findTextNodes } from "@/common/xml/xml_utils";
import { isString } from "@/web/utils/rpc/parsing";

const DEFAULT_TEXT_NODES = ["p", "l"];
// Eventually, milestone can also be used as a structure node.
const KNOWN_ALT_NODES = ["add", "sic", "del", "gap", "head", "milestone"];
// const KNOWN_INFO_NODES = [];
const KNOWN_STRUCTURE_NODES = ["lg"];

function markupText(text: string, parentName: string): XmlChild[] {
  if (parentName === "#comment") {
    return [];
  }
  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = text.split(TEXT_BREAK_CHARACTERS).map((word) => {
    const target = LatinWords.allWords().has(word)
      ? word
      : LatinWords.allWords().has(word.toLowerCase())
      ? word.toLowerCase()
      : undefined;

    if (target === undefined) {
      return word;
    }
    return new XmlNode("libLat", target === word ? [] : [["target", target]], [
      word,
    ]);
  });
  return isAlt ? [new XmlNode("span", [["alt", parentName]], words)] : words;
}

function markupTextInNode(node: XmlNode): XmlNode {
  const children = findTextNodes(node).flatMap((textNode) =>
    markupText(textNode.text, textNode.parent.name)
  );
  if (children.length === 0) {
    return new XmlNode("span", [["alt", "gap"]]);
  }
  return new XmlNode("span", [], children);
}

function placeholderFor(index: number): XmlNode {
  return new XmlNode("placeholder", [["id", `${index}`]]);
}

function computeStructure(root: TeiNode): XmlNode {
  if (root.selfNode.name === ROOT_NODE_NAME) {
    new XmlNode(
      ROOT_NODE_NAME,
      [],
      root.children.map((_c, i) => placeholderFor(i))
    );
  }
  const queue = [...root.selfNode.children];

  // We will stop traversal on these nodes, because these will
  // be processed later independently.
  const teiChildSet = new Set(root.children.map((c) => c.selfNode));

  const directChildren = root.selfNode.children;
  let i = 0; // Index for directChildren
  let k: number[] = []; // Nested index for the current descendant of directChildren;
  const teiChildren = root.children.filt;
  let j = 0; // Index for teiChildren
}

function processForDisplay(root: TeiNode): ProcessedWorkNode {
  const allChildren = crawlTei(root);
  const firstChild = allChildren[0];
  const isFirstHead =
    firstChild !== undefined &&
    firstChild instanceof XmlNode &&
    firstChild.name === "head";
  const children = allChildren
    .slice(isFirstHead ? 1 : 0)
    .map((child) =>
      isString(child)
        ? new XmlNode("span", [], markupText(child, root.selfNode.name))
        : child instanceof XmlNode
        ? markupTextInNode(child)
        : processForDisplay(child)
    );
  return {
    id: root.id,
    header: isFirstHead ? XmlNode.getSoleText(firstChild) : undefined,
    children,
  };
}

function validateStucture(node: ProcessedWorkNode) {
  const placeholders = node.structure.findDescendants("placeholder");
  for (let i = 0; i < placeholders.length; i++) {
    const id = safeParseInt(placeholders[i].getAttr("id"));
    assertEqual(id, i);
  }
  for (const child of node.children) {
    validateStucture(child);
  }
}

/** Returns the processed content of a TEI XML file. */
export function processTei(teiRoot: TeiCtsDocument): ProcessedWork {
  const root = processForDisplay(teiRoot.content);
  validateStucture(root);
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    root,
  };
}
