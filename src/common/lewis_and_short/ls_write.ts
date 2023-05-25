import { createWriteStream, readFileSync, renameSync } from "fs";
import { parseEntries, XmlNode } from "./xml_node";
import { assert } from "@/common/assert";

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
      const original = parseEntries([line])[0];
      return "\n" + transformer(original).toString();
    });
  }
}

/** A node of text within an XML tree. */
export interface TextNodeData {
  /** The content of the text node. */
  text: string;
  /** The parent node containing this text. */
  parent: XmlNode;
  /** The index of the text in the parent node's children. */
  textIndex: number;
  /** All ancestors of the parent node. Closer ancestors should be later in the list. */
  ancestors: XmlNode[];
}

/**
 * Returns all nodes containing text in the tree rooted by the input node.
 *
 * @param root The root node of the tree to search from.
 * @param ancestors Ancestors of the root node in the overall tree, if any.
 *                  Closer ancestors should be later in the list.
 *
 * @returns Data for all text nodes, in sequence.
 */
export function iterateFromNode(
  root: XmlNode,
  ancestors: XmlNode[] = []
): TextNodeData[] {
  let results: TextNodeData[] = [];
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
        iterateFromNode(child, ancestors.concat([root]))
      );
    }
  });
  return results;
}

/** Removes the given text node from the tree. */
export function removeTextNode(data: TextNodeData) {
  data.parent.children.splice(data.textIndex, 1);
  const ancestors = [data.parent].concat(data.ancestors.reverse());
  for (let i = 0; i < ancestors.length - 1; i++) {
    const ancestor = ancestors[i];
    if (ancestor.children.length > 0) {
      break;
    }
    const nextParent = ancestors[i + 1];
    const removeIndex = nextParent.children.indexOf(ancestor);
    assert(removeIndex > -1);
    nextParent.children.splice(removeIndex, 1);
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
  const textNodes = iterateFromNode(root, []);
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
