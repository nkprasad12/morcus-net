import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assert } from "@/common/assert";
import { COMMENT_NODE, XmlChild, XmlNode } from "@/common/xml/xml_node";

const ATTRIBUTES_KEY = ":@";
const TEXT_NODE = "#text";

const BASE_XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  alwaysCreateTextNode: true,
  preserveOrder: true,
  commentPropName: COMMENT_NODE,
};

const PARSE_TRIM_WHITESPACE = {
  ...BASE_XML_PARSER_OPTIONS,
  trimValues: true,
};

const PARSE_KEEP_WHITESPACE = {
  ...BASE_XML_PARSER_OPTIONS,
  trimValues: false,
};

function crawlXml(root: any): XmlNode {
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
    const childResult = crawlXml(child);
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

// function findXmlElement(input: any, name: string): any {
//   const candidates: any[] = [input];
//   if (Array.isArray(input)) {
//     candidates.push(...input);
//   }
//   for (const candidate of candidates) {
//     if (candidate[name] !== undefined) {
//       return candidate;
//     }
//   }
//   throw new Error(`No ${name} found.\n${input}`);
// }

function validateXml(input: any): void {
  const result = XMLValidator.validate(input, {});
  if (result !== true) {
    throw new Error(
      `XML Validation Error: ${JSON.stringify(result)}\n${input}`
    );
  }
}

/**
 * Parses the raw contents of a single XML document.
 *
 * @param rawXml A raw buffer or string containing the XML contents.
 * @param options Parsing options.
 * - `keepWhitespace`: ensures that whitespace around tags will be ignored.
 * - `rootName`: is the content root name to search for, if the root contains
 *    multiple elements.
 * - `validate`: Whether to validate the XML before returning.
 *
 * @returns An XML node representation of the input data.
 */
export function parseRawXml(
  rawXml: string | Buffer,
  options?: { keepWhitespace?: true; validate?: true }
): XmlNode {
  const parser = new XMLParser(
    options?.keepWhitespace === true
      ? PARSE_KEEP_WHITESPACE
      : PARSE_TRIM_WHITESPACE
  );
  if (options?.validate === true) {
    validateXml(rawXml);
  }
  const nodes: XmlNode[] = parser
    .parse(rawXml)
    .map(crawlXml)
    .filter((n: XmlNode) => n.name[0] !== "?");
  assert(nodes.length === 1, "Expected exactly 1 root node.");
  return nodes[0];
}

/**
 * Parses XML formatted strings. Whitespace between XML is ignored.
 *
 * @param serializedXml - A list of strings. Each string should be one XML document.
 * @param validate - Whether to validate each document.
 *
 * @yields A sequence of parsed XML nodes, one for each input.
 */
export function* parseXmlStringsInline(
  serializedXml: string[],
  validate: boolean = false
): Generator<XmlNode> {
  const parser = new XMLParser(PARSE_KEEP_WHITESPACE);
  for (const entry of serializedXml) {
    const entryFree = parser.parse(entry)[0];
    if (validate) {
      validateXml(entryFree);
    }
    yield crawlXml(entryFree);
  }
}

/**
 * Parses XML formatted strings. Whitespace between XML is ignored.
 *
 * @param serializedXml - A list of strings. Each string should be one XML document.
 * @param validate - Whether to validate each document.
 *
 * @yields A sequence of parsed XML nodes, one for each input.
 */
export function parseXmlStrings(
  serializedXml: string[],
  validate: boolean = false
): XmlNode[] {
  return [...parseXmlStringsInline(serializedXml, validate)];
}

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
 * @param ancestors Ancestors of the root node in the overall tree, if any.
 *                  Closer ancestors should be later in the list.
 *
 * @returns Data for all text nodes, in DFS sequence.
 */
export function findTextNodes(root: XmlNode): TextNodeData[] {
  const allNodes = findTextNodesInternal(root, []);
  const registry = new Map<XmlNode, SingleTextNode[]>();
  for (const node of allNodes) {
    if (!registry.has(node.parent)) {
      registry.set(node.parent, []);
    }
    registry.get(node.parent)!.push(node);
  }
  return allNodes.map((node) => Object.assign(node, { registry: registry }));
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
/**
 * Finds all descendants of the given root node.
 *
 * @param root the root node on which to begin traversal.
 *
 * @returns An array of all descendants of the given root node,
 *          including itself. Each descendant is paired with a list
 *          of all ancestor nodes, in order of traversal.
 */
export function findXmlNodes(root: XmlNode): DescendantNode[] {
  const results: DescendantNode[] = [];
  const queue: DescendantNode[] = [[root, []]];
  while (queue.length > 0) {
    const top = queue.pop()!;
    results.push(top);
    for (const child of top[0].children) {
      if (typeof child === "string") {
        continue;
      }
      queue.push([child, [...top[1], top[0]]]);
    }
  }
  return results;
}

/** Removes the given text node from the tree. */
export function removeTextNode(data: TextNodeData) {
  function updateSiblings(parent: XmlNode, removedIndex: number) {
    const siblings = data.registry.get(parent);
    if (siblings === undefined) {
      return;
    }
    const updated = siblings.filter((data) => data.textIndex !== removedIndex);
    for (const sibling of updated) {
      if (sibling.textIndex > removedIndex) {
        sibling.textIndex = sibling.textIndex - 1;
      }
    }
    data.registry.set(parent, updated);
  }

  function removeChild(parent: XmlNode, childIndex: number) {
    parent.children.splice(childIndex, 1);
    updateSiblings(parent, childIndex);
  }

  removeChild(data.parent, data.textIndex);
  const ancestors = [data.parent].concat(data.ancestors.slice().reverse());
  for (let i = 0; i < ancestors.length - 1; i++) {
    const ancestor = ancestors[i];
    if (ancestor.children.length > 0) {
      break;
    }
    const nextParent = ancestors[i + 1];
    const removeIndex = nextParent.children.indexOf(ancestor);
    assert(removeIndex > -1);
    removeChild(nextParent, removeIndex);
  }
}

/**
 * Represents a text node in an XML tree that is a part of a match of
 * a string search of the entire tree, potentially spanning multiple nodes.
 */
export interface MatchedChunk {
  /** The text node matched. */
  data: TextNodeData;
  /** The portion of the target string that was matched. */
  match: string;
  /** The start index (inclusive) of the match within the text node. */
  startIdx: number;
  /** The end index (exclusive) of the match within the text node. */
  endIdx: number;
}

/** A single match for one target. */
export interface TargetMatch {
  /** The target string that was matched. */
  target: string;
  /** The chunks making up the match, in order. */
  chunks: MatchedChunk[];
}

/** The result of a cross node XML text search. */
export interface MatchResult {
  allTextNodes: TextNodeData[];
  matches: TargetMatch[];
}

/** Represents the results of a search in a raw string. */
export interface RawSearchMatch {
  index: number;
  text: string;
}

export function searchTree(
  root: XmlNode,
  matchFinder: (rawText: string) => RawSearchMatch[]
): MatchResult {
  const matches: TargetMatch[] = [];
  const textNodes = findTextNodes(root);
  const chunks = textNodes.map((data) => data.text);

  const starts = [0];
  for (let i = 0; i < chunks.length; i++) {
    starts.push(starts[i] + chunks[i].length);
  }
  const allText = chunks.join("");
  const rawMatches = matchFinder(allText);
  for (const rawMatch of rawMatches) {
    let startChunk = -1;
    let startOffset = undefined;
    const startIndex = rawMatch.index;
    for (let i = 0; i < starts.length - 1; i++) {
      if (starts[i] <= startIndex && startIndex < starts[i + 1]) {
        startChunk = i;
        startOffset = startIndex - starts[i];
        break;
      }
    }
    const end = startIndex + rawMatch.text.length - 1;
    let endChunk = -1;
    let endOffset = undefined;
    for (let i = 0; i < starts.length - 1; i++) {
      if (starts[i] <= end && end < starts[i + 1]) {
        endChunk = i;
        endOffset = end - starts[i] + 1;
        break;
      }
    }

    assert(startChunk > -1, "Expected to find a start chunk");
    assert(endChunk > -1, "Expected to find an end chunk");
    assert(
      endChunk >= startChunk,
      "Expected end chunk to be after the start chunk"
    );
    assert(startOffset !== undefined, "Expected to find a start offset");
    assert(endOffset !== undefined, "Expected to find an end offset");

    const matchNodes = textNodes.slice(startChunk, endChunk + 1);
    const matchChunks: MatchedChunk[] = [];
    const n = matchNodes.length;
    for (let i = 0; i < n; i++) {
      const nodeText = matchNodes[i].text;
      const j = i === 0 ? startOffset! : 0;
      const k = i === n - 1 ? endOffset! : nodeText.length;
      matchChunks.push({
        data: matchNodes[i],
        match: nodeText.substring(j, k),
        startIdx: j,
        endIdx: k,
      });
    }
    matches.push({ target: rawMatch.text, chunks: matchChunks });
  }

  return { allTextNodes: textNodes, matches: matches };
}

/**
 * Searches the tree with the given root for the given target.
 *
 * @param root The root of the tree to search.
 * @param target The string to search for.
 *
 * @returns The matches for the given target.
 */
export function searchTreeSimple(root: XmlNode, target: string): MatchResult {
  return searchTree(root, (rawString: string) => {
    const matches: RawSearchMatch[] = [];
    let startIndex = 0;
    while (true) {
      const matchStart = rawString.indexOf(target, startIndex);
      if (matchStart === -1) {
        break;
      }
      matches.push({ index: matchStart, text: target });
      startIndex = matchStart + target.length;
    }
    return matches;
  });
}

/**
 * Searches the tree with the given root for the given targets and
 * replaces them according to the given logic.
 *
 * @param root The root of the tree to search.
 * @param targets The strings to search for.
 * @param modifier The callback to be invoked on each match.
 *
 * @returns The root of the modified XML tree.
 */
export function modifyInTree(
  root: XmlNode,
  targets: string[],
  modifier: (match: TargetMatch, rootCopy: XmlNode) => void
): XmlNode {
  const node = root.deepcopy();
  for (const target of targets) {
    const results = searchTreeSimple(node, target);
    for (const match of results.matches.reverse()) {
      modifier(match, node);
    }
  }
  return node;
}

export namespace XmlOperations {
  /**
   * Combines the given chunks into the destination chunk, or the
   * first chunk if no destination is specified.
   */
  export function combine(chunks: MatchedChunk[], destination?: MatchedChunk) {
    if (chunks.length <= 1) {
      return;
    }
    const target = destination || chunks[0];
    const targetIdx = chunks.indexOf(target);
    assert(
      targetIdx > -1,
      "The destination chunk should be one of the chunks to be combined."
    );
    chunks.slice(1).forEach((chunk) => assert(chunk.startIdx === 0));
    chunks
      .slice(0, -1)
      .forEach((chunk) => assert(chunk.endIdx === chunk.data.text.length));

    const allChunks = chunks.map((chunk) => chunk.match).join("");
    chunks.forEach(removeMatchFromChunk);
    const leftover = target.data.parent.children[target.data.textIndex];
    target.data.parent.children[target.data.textIndex] =
      targetIdx === 0 ? leftover + allChunks : allChunks + leftover;

    for (const chunk of chunks) {
      const updatedValue = XmlNode.assertIsString(
        chunk.data.parent.children[chunk.data.textIndex]
      );
      if (updatedValue.length === 0) {
        removeTextNode(chunk.data);
      }
    }
  }

  export function removeMatchFromChunk(chunk: MatchedChunk) {
    const textLength = chunk.data.text.length;
    assert(
      chunk.startIdx === 0 || chunk.endIdx === textLength,
      "Cannot remove from middle of chunk."
    );

    const start = chunk.startIdx === 0 ? chunk.endIdx : 0;
    const end = chunk.startIdx === 0 ? textLength : chunk.startIdx;
    chunk.data.parent.children[chunk.data.textIndex] =
      chunk.data.text.substring(start, end);
  }
}
