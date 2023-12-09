import { assert } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";
import {
  ProcessedWork,
  ProcessedWorkNode,
} from "@/common/library/library_types";
import { TEXT_BREAK_CHARACTERS } from "@/common/text_cleaning";
import { TeiCtsDocument, TeiNode } from "@/common/xml/tei_utils";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { findTextNodes } from "@/common/xml/xml_utils";

const DEFAULT_TEXT_NODES = ["p"];
const KNOWN_ALT_NODES = ["add", "sic"];

function markupText(text: string, parentName: string): XmlChild[] {
  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = text.split(TEXT_BREAK_CHARACTERS).map((word) => {
    if (!LatinWords.allWords().has(word)) {
      return word;
    }
    return new XmlNode("libLat", [], [word]);
  });
  return isAlt ? [new XmlNode("span", [["alt", parentName]], words)] : words;
}

function markupTextInNode(node: XmlNode): XmlNode {
  const children = findTextNodes(node).flatMap((textNode) =>
    markupText(textNode.text, textNode.parent.name)
  );
  return new XmlNode("span", [], children);
}

function processForDisplay(root: TeiNode): ProcessedWorkNode {
  const firstChild = root.children[0];
  const isFirstHead =
    firstChild !== undefined &&
    firstChild instanceof XmlNode &&
    firstChild.name === "head";
  const children = root.children
    .slice(isFirstHead ? 1 : 0)
    .map((child) =>
      child instanceof XmlNode
        ? markupTextInNode(child)
        : processForDisplay(child)
    );
  return {
    id: root.id,
    header: isFirstHead ? XmlNode.getSoleText(firstChild) : undefined,
    children,
  };
}

/** Returns the processed content of a TEI XML file. */
export function processTei(teiRoot: TeiCtsDocument): ProcessedWork {
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    root: processForDisplay(teiRoot.content),
  };
}
