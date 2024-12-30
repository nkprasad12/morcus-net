import {
  assert,
  assertArraysEqual,
  assertEqual,
  checkPresent,
} from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import type { LibraryPatch } from "@/common/library/library_patches";
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
import {
  type SingleTextNode,
  findTextNodes,
} from "@/common/xml/xml_text_utils";
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

/** Exported only for unit testing. Do not use. */
export interface MarkupTextOptions {
  debug?: DebugSideChannel;
  handledPatches?: Set<LibraryPatch>;
  unhandledPatches?: Set<LibraryPatch>;
}

/** Exported only for unit testing. Do not use. */
export function patchText(
  rawText: string,
  options?: MarkupTextOptions
): string {
  for (const patch of options?.handledPatches ?? []) {
    if (rawText.includes(patch.target)) {
      throw new Error(`Duplicate match for patch: ${JSON.stringify(patch)}`);
    }
  }
  // Array of [start index, end index (exclusive)]
  const candidates: [number, number, LibraryPatch][] = [];
  for (const unhandled of options?.unhandledPatches ?? []) {
    let start = 0;
    while (true) {
      start = rawText.indexOf(unhandled.target, start);
      if (start === -1) {
        break;
      }
      candidates.push([start, start + unhandled.target.length, unhandled]);
      // Increment by just 1 so that we handle partially repeating substrings.
      // For example, suppose we had a target of `that` and the text contained
      // `thathat`.
      start += 1;
    }
  }
  candidates.sort((a, b) => b[0] - a[0]);
  for (let i = 1; i < candidates.length; i++) {
    // Check the start of the next candidate is after the end of the previous.
    const next = candidates[i];
    const previous = candidates[i - 1];
    // Note we use <= because the end index is exclusive and because they are in
    // reverse order based on the start index.
    assert(
      previous[0] >= next[1],
      () => `Overlapping patches: ${next} and ${previous}`
    );
  }
  let patchedText = rawText;
  for (const candidate of candidates) {
    const start = patchedText.substring(0, candidate[0]);
    const end = patchedText.substring(candidate[1]);
    patchedText = [start, candidate[2].replacement, end].join("");
    console.debug(
      `Patching ${candidate[2].target} -> ${candidate[2].replacement}`
    );
    assert(
      checkPresent(options?.unhandledPatches).delete(candidate[2]),
      () => `Doubly used patch: ${candidate[2]}`
    );
    options?.handledPatches?.add(candidate[2]);
  }
  return patchedText;
}

function markupText(
  textNode: SingleTextNode,
  options?: MarkupTextOptions
): XmlChild[] {
  const text = patchText(textNode.text, options);
  const parentName = textNode.parent.name;

  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = processWords(collapseWhitespace(text), (word) => {
    options?.debug?.onWord(word);
    return new XmlNode("libLat", [], [word]);
  });
  return isAlt ? [new XmlNode("span", [["alt", parentName]], words)] : words;
}

function markupTextInNode(node: XmlNode, options?: MarkupTextOptions): XmlNode {
  // This is kind of a hack for Juvenal, because the <note> splits up text, and
  // we ignore whitespace so a space after the test is ignored.
  if (node.name === "note") {
    return new XmlNode("span", [["alt", "note"]]);
  }
  const contentNodes = findTextNodes(node).filter((tn) => !shouldSkip(tn));
  if (contentNodes.length === 0) {
    return new XmlNode("span", [], []);
  }
  const children = contentNodes.flatMap((n) => markupText(n, options));
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

// Maps a stringified location to [handled patches, unhandled patches]
type PatchTree = Map<string, [LibraryPatch[], LibraryPatch[]]>;

function createPatchTree(
  patches: LibraryPatch[],
  teiRoot: TeiCtsDocument
): PatchTree {
  const patchesByLocation = arrayMap<string, LibraryPatch>();
  for (const patch of patches) {
    const patchParts = patch.location.map(([key, _value]) => key);
    assertArraysEqual(teiRoot.textParts, patchParts);
    const patchLocation = patch.location.map(([_key, value]) => value);
    patchesByLocation.add(JSON.stringify(patchLocation), patch);
  }
  const patchTree: PatchTree = new Map();
  for (const [location, patches] of patchesByLocation.map.entries()) {
    patchTree.set(location, [[], patches]);
  }
  return patchTree;
}

interface ProcessForDisplayOptions {
  debug?: DebugSideChannel;
  patchTree?: PatchTree;
}

export function processForDisplay(
  root: TeiNode,
  options?: ProcessForDisplayOptions
): ProcessedWorkNode {
  const patchData = options?.patchTree?.get(JSON.stringify(root.id));
  const markupTextOptions: MarkupTextOptions = {
    debug: options?.debug,
    handledPatches: new Set(patchData?.[0] ?? []),
    unhandledPatches: new Set(patchData?.[1] ?? []),
  };
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
            markupTextOptions
          )
        )
      : child instanceof XmlNode
      ? markupTextInNode(child, markupTextOptions)
      : processForDisplay(child, options)
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

export interface DebugSideChannel {
  onWord: (word: string) => unknown;
}

export interface ProcessTeiOptions {
  sideChannel?: DebugSideChannel;
  patches?: LibraryPatch[];
}

/** Returns the processed content of a TEI XML file. */
export function processTei(
  teiRoot: TeiCtsDocument,
  options?: ProcessTeiOptions
): ProcessedWork {
  const processOptions: ProcessForDisplayOptions = {
    debug: options?.sideChannel,
    patchTree: createPatchTree(options?.patches ?? [], teiRoot),
  };
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    root: processForDisplay(teiRoot.content, processOptions),
  };
}
