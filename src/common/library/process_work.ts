import { assert, assertEqual } from "@/common/assert";
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
import { findTextNodes, type SingleTextNode } from "@/common/xml/xml_utils";
import { instanceOf, isString } from "@/web/utils/rpc/parsing";

const SKIP_NODES = new Set(["#comment", "note"]);
// q is a quote and we should make sure that this is marked!!!
const DEFAULT_TEXT_NODES = ["p", "l", "foreign"];
const KNOWN_ALT_NODES = ["add", "sic", "del", "gap", "q", "quote"];
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

function shouldSkip(textNode: SingleTextNode): boolean {
  if (SKIP_NODES.has(textNode.parent.name)) {
    return true;
  }
  for (const ancestor of textNode.ancestors) {
    if (SKIP_NODES.has(ancestor.name)) {
      return true;
    }
  }
  return false;
}

function markupText(textNode: SingleTextNode, debug?: DebugHelper): XmlChild[] {
  const text = textNode.text;
  const parentName = textNode.parent.name;

  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = processWords(collapseWhitespace(text), (word) => {
    debug?.onWord(word);
    return new XmlNode("libLat", [], [word]);
  });
  return isAlt ? [new XmlNode("span", [["alt", parentName]], words)] : words;
}

function markupTextInNode(node: XmlNode, debug?: DebugHelper): XmlNode {
  // This is kind of a hack for Juvenal, because the <note> splits up text, and
  // we ignore whitespace so a space after the test is ignored.
  if (node.name === "note") {
    return new XmlNode("span", [["alt", "note"]]);
  }
  const contentNodes = findTextNodes(node).filter((tn) => !shouldSkip(tn));
  if (contentNodes.length === 0) {
    return new XmlNode("span", [], []);
  }
  const children = contentNodes.flatMap((n) => markupText(n, debug));
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

export function processForDisplay(
  root: TeiNode,
  debug?: DebugHelper
): ProcessedWorkNode {
  const allChildren = attachStringChildren(root);
  const firstChild = allChildren[0];
  const isFirstHead =
    firstChild !== undefined &&
    firstChild instanceof XmlNode &&
    firstChild.name === "head";
  const children = allChildren.slice(isFirstHead ? 1 : 0).map((child, i) =>
    isString(child)
      ? new XmlNode(
          "span",
          [],
          markupText(
            {
              text: child,
              parent: root.selfNode,
              ancestors: [],
              textIndex: i,
            },
            debug
          )
        )
      : child instanceof XmlNode
      ? markupTextInNode(child, debug)
      : processForDisplay(child, debug)
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

type DebugHelper = DebugSideChannel;
export interface DebugSideChannel {
  onWord: (word: string) => unknown;
}

/** Returns the processed content of a TEI XML file. */
export function processTei(
  teiRoot: TeiCtsDocument,
  sideChannel?: DebugSideChannel
): ProcessedWork {
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    root: processForDisplay(teiRoot.content, sideChannel),
  };
}
