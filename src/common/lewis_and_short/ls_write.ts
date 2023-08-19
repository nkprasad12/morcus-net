import { createWriteStream, readFileSync, renameSync } from "fs";
import { XmlNode } from "@/common/xml_node";
import { assert } from "@/common/assert";
import { parseXmlStrings } from "../xml_utils";

/**
 * Rewrites the contents of an XML file at the specified path by applying
 * the given rewriter function to each line of the file's body element.
 *
 * @param input - The path to the XML file to rewrite.
 * @param rewriter - A function that takes a line and returns a rewritten
 *                   version of that string. This should include line
 *                   terminations if needed.
 *
 * @returns A Promise that resolves when the rewritten file is saved.
 */
export async function rewriteLs(
  input: string,
  rewriter: (input: string) => string
): Promise<void> {
  const xmlContents = readFileSync(input, "utf8");
  const tmpFile = `tmp.${performance.now()}`;
  const fileStream = createWriteStream(tmpFile, { flags: "a" });

  const lines = xmlContents.split("\n");
  let inBody = false;
  lines.forEach((line, i) => {
    if (line.trim().startsWith("</body>")) {
      inBody = false;
    }
    if (inBody) {
      fileStream.write(rewriter(line));
    } else {
      if (i !== 0) {
        fileStream.write("\n");
      }
      fileStream.write(line);
      if (line.trim() === "<body>") {
        inBody = true;
      }
    }
  });

  await new Promise<void>((resolve) => {
    fileStream.end(() => {
      resolve();
    });
  });
  renameSync(tmpFile, input);
  return;
}

export namespace LsRewriters {
  export function removeWhitespace(input: string): Promise<void> {
    return rewriteLs(input, (line) =>
      line.length === 0 ? "" : "\n" + line.trim()
    );
  }

  export function transformEntries(
    inputPath: string,
    transformer: (input: XmlNode) => XmlNode
  ): Promise<void> {
    return rewriteLs(inputPath, (line) => {
      if (!line.startsWith("<entryFree ")) {
        return "\n" + line;
      }
      const original = parseXmlStrings([line])[0];
      return "\n" + transformer(original).toString();
    });
  }
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

/**
 * Searches the tree with the given root for the given targets.
 *
 * @param root The root of the tree to search.
 * @param target The string to search for.
 *
 * @returns The matches for the given targets.
 */
export function searchTree(root: XmlNode, target: string): MatchResult {
  const matches: TargetMatch[] = [];
  const textNodes = findTextNodes(root);
  const chunks = textNodes.map((data) => data.text);

  const starts = [0];
  for (let i = 0; i < chunks.length; i++) {
    starts.push(starts[i] + chunks[i].length);
  }
  const allText = chunks.join("");
  const matchStarts: number[] = [];
  let startIndex = 0;
  while (true) {
    const matchStart = allText.indexOf(target, startIndex);
    if (matchStart === -1) {
      break;
    }
    matchStarts.push(matchStart);
    startIndex = matchStart + target.length;
  }
  for (const start of matchStarts) {
    let startChunk = -1;
    let startOffset = undefined;
    for (let i = 0; i < starts.length - 1; i++) {
      if (starts[i] <= start && start < starts[i + 1]) {
        startChunk = i;
        startOffset = start - starts[i];
        break;
      }
    }
    const end = start + target.length - 1;
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
    matches.push({ target: target, chunks: matchChunks });
  }

  return { allTextNodes: textNodes, matches: matches };
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
    const results = searchTree(node, target);
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
