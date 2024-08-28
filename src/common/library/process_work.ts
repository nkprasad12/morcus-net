import { assert, assertEqual } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";
import {
  ProcessedWork,
  ProcessedWorkNode,
} from "@/common/library/library_types";
import { processWords } from "@/common/text_cleaning";
import {
  ROOT_NODE_NAME,
  TeiCtsDocument,
  TeiNode,
} from "@/common/xml/tei_utils";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { findTextNodes } from "@/common/xml/xml_utils";
import { instanceOf, isString } from "@/web/utils/rpc/parsing";

const DEFAULT_TEXT_NODES = ["p", "l"];
const KNOWN_ALT_NODES = ["add", "sic", "del", "gap"];
const WHITESPACE = new Set([" ", "\n", "\t"]);

function collapseWhitespace(input: string): string {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (!WHITESPACE.has(c) || c === "\t") {
      result += c;
      continue;
    }
    const last = result[result.length - 1];
    if (!WHITESPACE.has(last)) {
      result += " ";
    }
  }
  return result;
}

function markupText(text: string, parentName: string): XmlChild[] {
  if (parentName === "#comment") {
    return [];
  }
  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = processWords(collapseWhitespace(text), (word) => {
    // Even if we can't resolve it in the Morpheus table, LS may have it.
    const target = LatinWords.resolveLatinWord(word, (w) => [
      LatinWords.isWord(w),
      undefined,
    ]) || [word.toLowerCase(), true];
    return new XmlNode(
      "libLat",
      target[0] === word ? [] : [["target", target[0]]],
      [word]
    );
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

function attachStringChildren(root: TeiNode): (XmlChild | TeiNode)[] {
  if (root.selfNode.name === ROOT_NODE_NAME) {
    return root.children;
  }
  const directChildren = root.selfNode.children;
  let i = 0; // Index for directChildren
  const teiChildren = root.children;
  let j = 0; // Index for teiChildren
  assertEqual(
    directChildren.filter(instanceOf(XmlNode)).length,
    teiChildren.length,
    "Found non-direct node children of the root"
  );
  const result: (XmlChild | TeiNode)[] = [];
  while (i < directChildren.length || j < teiChildren.length) {
    const dChild = directChildren[i];
    if (isString(dChild)) {
      result.push(dChild);
      i++;
      continue;
    }
    const tChild = teiChildren[j];
    if (tChild instanceof XmlNode) {
      assert(dChild === tChild);
      result.push(dChild);
      i++;
      j++;
      continue;
    }
    assert(dChild === tChild.selfNode);
    result.push(tChild);
    i++;
    j++;
  }
  return result;
}

function processForDisplay(root: TeiNode): ProcessedWorkNode {
  const allChildren = attachStringChildren(root);
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

  const result: ProcessedWorkNode = { id: root.id, children };
  if (isFirstHead) {
    result.header = XmlNode.getSoleText(firstChild);
  }
  const rend = root.selfNode.getAttr("rend");
  if (rend === "indent") {
    // A hack for Amores. This should be removed and handled correctly
    // when we do the refactor to handle milestone, line groups, etc...
    result.rendNote = "indent";
  }
  return result;
}

/** Returns the processed content of a TEI XML file. */
export function processTei(teiRoot: TeiCtsDocument): ProcessedWork {
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    root: processForDisplay(teiRoot.content),
  };
}
