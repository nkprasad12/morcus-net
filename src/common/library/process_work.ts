import {
  assert,
  assertArraysEqual,
  assertEqual,
  checkPresent,
  checkSatisfies,
} from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import type { LibraryPatch } from "@/common/library/library_patches";
import {
  type ProcessedWork2,
  type ProcessedWorkContentNodeType,
  type WorkPage,
} from "@/common/library/library_types";
import { areArraysEqual, safeParseInt } from "@/common/misc_utils";
import { processWords } from "@/common/text_cleaning";
import { extractInfo, findCtsEncoding } from "@/common/xml/tei_utils";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { instanceOf } from "@/web/utils/rpc/parsing";

const SKIP_NODES = new Set(["#comment", "note"]);
const QUOTE_NODES = new Set(["q", "quote"]);
const HANDLED_REND = new Set<string>(["indent"]);
// `merge` occurs only one time. It happens when we have a continued quote:
// <l>blah blah <q>blah </q></l>
// <l><q rend="merge">blah</q> blah</l>
// so the `merge` is supposed to indicate that the quote is merged with the
// previous quote.
// This is very hard to handle and only occurs once, so we just ignore it.
const KNOWN_REND = new Set([undefined, "merge"].concat(...HANDLED_REND));

// // // // // //
// PATCH STUFF //
// // // // // //

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

// Maps a stringified location to [handled patches, unhandled patches]
type PatchTree = Map<string, [LibraryPatch[], LibraryPatch[]]>;

function createPatchTree(
  patches: LibraryPatch[],
  textParts: string[]
): PatchTree {
  const patchesByLocation = arrayMap<string, LibraryPatch>();
  for (const patch of patches) {
    const patchParts = patch.location.map(([key, _value]) => key);
    assertArraysEqual(textParts, patchParts);
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

export interface DebugSideChannel {
  onWord: (word: string) => unknown;
}

export interface ProcessTeiOptions {
  sideChannel?: DebugSideChannel;
  patches?: LibraryPatch[];
}

// // // // // //
// PATCH STUFF //
// // // // // //

function getSectionId(
  ancestors: XmlNode[],
  textParts: string[]
): [string[], boolean] {
  let i = 0;
  const sectionId: string[] = [];
  let parentHadSection = false;
  for (const ancestor of ancestors) {
    if (ancestor.getAttr("type") !== "textpart" && ancestor.name !== "l") {
      parentHadSection = false;
      continue;
    }
    assertEqual(
      textParts[i].toLowerCase(),
      ancestor.name === "l"
        ? "line"
        : ancestor.getAttr("subtype")?.toLowerCase(),
      ancestors.slice(-1)[0].toString()
    );
    sectionId.push(checkPresent(ancestor.getAttr("n")));
    i++;
    parentHadSection = true;
  }
  return [sectionId, parentHadSection];
}

interface PreprocessedTree {
  root: XmlNode;
  uids: XmlNode[];
  includedSections: Set<string>[];
}

// WE NEED WHITESPACE BETWEEN ELEMENTS.
// CONSIDER SATURAE 1.1.102

function preprocessTree(
  originalRoot: XmlNode,
  textParts: string[],
  options: ProcessForDisplayOptions
): PreprocessedTree {
  const textPartsLower = textParts.map((part) => part.toLowerCase());
  const root = originalRoot.deepcopy();
  // Initialize all of the patch data structures before, since we might run into sections
  // in a non-continuous fashion. For example, we could have:
  // <div section="3.6">
  //   Header1
  //   <div section="3.6.1" /> ... </div>
  //   Header2
  //   <div section="3.6.2"> ... </div>
  // </div>
  // where Header1 and Header2 are both part of 3.6, but punctuated by
  // text from 3.6.1 in the middle.
  const textMarkupOptionsBySection = new Map<string, MarkupTextOptions>();
  for (const [section, patchData] of options?.patchTree?.entries() ?? []) {
    textMarkupOptionsBySection.set(section, {
      handledPatches: new Set(patchData?.[0] ?? []),
      unhandledPatches: new Set(patchData?.[1] ?? []),
    });
  }
  assertEqual(root.getAttr("parent"), undefined);
  const uids: XmlNode[] = [];
  const stack: XmlNode[][] = [[root]];

  while (stack.length > 0) {
    const ancestors = stack.pop()!;
    const top = ancestors.slice(-1)[0];
    // Make sure none of the attrs we're adding are removing real data.
    assertEqual(top.getAttr("uid"), undefined);
    assertEqual(top.getAttr("sid"), undefined);
    assertEqual(top.getAttr("leader"), undefined);
    // Mark the id of this node. Note that we want to be able to look up the
    // node in the `uids` array by its id, so that e.g. `uids[7]` is the node
    // which has uid=7.
    const uid = uids.length;
    uids.push(top);
    top.attrs.push(["uid", uid.toString()]);

    const [section, isLeader] = getSectionId(ancestors, textPartsLower);
    section.forEach((p) => assert(!p.includes(".")));
    top.attrs.push(["sid", section.join(".")]);
    if (isLeader) {
      top.attrs.push(["leader", "1"]);
    }
    const children: XmlChild[] = [];
    const sectionKey = JSON.stringify(section);
    const markupOptions = textMarkupOptionsBySection.get(sectionKey);
    while (top.children.length > 0) {
      const child = top.children.pop()!;
      if (typeof child === "string") {
        const patched = patchText(child, markupOptions);
        children.push(patched);
        if (options?.debug?.onWord) {
          processWords(patched, (w) => options?.debug?.onWord(w));
        }
        continue;
      }
      if (SKIP_NODES.has(child.name)) {
        continue;
      }
      assertEqual(child.getAttr("parent"), undefined);
      child.attrs.push(["parent", uid.toString()]);
      stack.push(ancestors.concat(child));
      children.push(child);
    }
    top.children.push(...children.reverse());
  }
  const includedSections = uids.map((_) => new Set<string>());
  computeIncludedSections(root, includedSections);
  return { root, uids, includedSections };
}

/**
 * Computes which sections are included in the tree rooted by the input node.
 *
 * For example, if the current node is `1.1` and has a descendant that is `1.1.1`, then
 * the included sections would be [1.1, 1.1.1]
 */
function computeIncludedSections(root: XmlNode, memo: Set<string>[]) {
  const uid = checkPresent(safeParseInt(root.getAttr("uid")));
  assert(0 <= uid && uid < memo.length);
  if (memo[uid].size === 0) {
    const childNodes = root.children.filter(instanceOf(XmlNode));
    memo[uid].add(checkPresent(root.getAttr("sid")));
    childNodes
      .flatMap((child) => Array.from(computeIncludedSections(child, memo)))
      .forEach((sid) => memo[uid].add(sid));
  }
  return memo[uid];
}

function convertToRows(
  current: XmlNode,
  data: PreprocessedTree
): [string, XmlNode][] {
  const uid = checkPresent(safeParseInt(current.getAttr("uid")));
  const sections = checkPresent(data.includedSections[uid]);
  const sid = checkPresent(current.getAttr("sid"));
  if (sections.size === 1) {
    return [[sid, current]];
  }
  const results: [string, XmlNode][] = [];
  for (const child of current.children) {
    if (typeof child === "string") {
      // Wrap the string child in a node.
      results.push([sid, new XmlNode("span", [], [child])]);
      continue;
    }
    results.push(...convertToRows(child, data));
  }
  return results;
}

/**
 * Validates whitespace and collapses clusters.
 *
 * @param input the string to process.
 * @param parentName the name of the node containing this text.
 * @param previousEndedInCluster whether the previous analyzed text ended
 *        in a whitespace cluster.
 *
 * @returns `[processed string, whether the string ends in a cluster]`
 */
function handleTextWhitespace(
  input: string,
  parentName: string,
  previousEndedInCluster: boolean
): [string, boolean] {
  const canHaveNewlines = parentName === "p";
  let inWhitespace = previousEndedInCluster;
  let processed = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    assert(c !== "\t" && c !== "\r" && (c !== "\n" || canHaveNewlines));
    const isWhitespace = c === " " || c === "\n";
    if (!isWhitespace) {
      processed += c;
    } else if (!inWhitespace && isWhitespace) {
      processed += " ";
    }
    inWhitespace = isWhitespace;
  }
  return [processed, inWhitespace];
}

function transformContentNode(
  node: XmlNode
): [ProcessedWorkContentNodeType, XmlNode["attrs"]] {
  const attrs: XmlNode["attrs"] = [];
  const rend = node.getAttr("rend");
  assert(KNOWN_REND.has(rend), rend);
  if (rend !== undefined && HANDLED_REND.has(rend)) {
    attrs.push(["rend", rend]);
  }
  if (node.name === "gap") {
    assert(node.children.length === 0);
    return ["gap", attrs];
  }
  if (QUOTE_NODES.has(node.name)) {
    return ["q", attrs];
  }
  switch (node.name) {
    case "head":
      return ["head", attrs];
    case "l":
    case "add":
    case "sic":
    case "foreign":
    // Each node will be placed in its own row, so we don't
    // need to worry about making `div` and `p` into their own
    // sections. In the future we should probably think about
    // verifying that we don't have `div` or `p` internal to a
    // section where it actually matters, but for now this is fine.
    // eslint-disable-next-line no-fallthrough
    case "div":
    case "p":
      return ["span", attrs];
    case "del":
      return ["s", attrs];
  }
  throw new Error(`Unknown node: ${node.name}`);
}

function processRowContent(
  root: XmlNode,
  previouslyInWhitespace: boolean = false
): [XmlNode<ProcessedWorkContentNodeType>, boolean] {
  let inWhitespace = previouslyInWhitespace;
  const children: XmlChild<ProcessedWorkContentNodeType>[] = [];
  for (const child of root.children) {
    const isString = typeof child === "string";
    const childResult = isString
      ? handleTextWhitespace(child, root.name, inWhitespace)
      : processRowContent(child, inWhitespace);
    inWhitespace = childResult[1];
    children.push(childResult[0]);
  }
  const [name, attrs] = transformContentNode(root);
  return [
    new XmlNode<ProcessedWorkContentNodeType>(name, attrs, children),
    inWhitespace,
  ];
}

/** Exported for unit testing. */
export function processWorkBody(
  originalRoot: XmlNode,
  textParts: string[],
  options: ProcessForDisplayOptions
): ProcessedWork2["rows"] {
  const data = preprocessTree(originalRoot, textParts, options);
  return convertToRows(data.root, data).map(([id, content]) => [
    id,
    processRowContent(content)[0],
  ]);
}

function getTextparts(root: XmlNode) {
  const refsDecls = root.findDescendants("refsDecl");
  const nonCts = refsDecls.filter((node) => node.getAttr("n") !== "CTS");
  if (nonCts.length === 0) {
    return findCtsEncoding(root)
      .sort((a, b) => a.idSize - b.idSize)
      .map((p) => p.name);
  }
  assertEqual(nonCts.length, 1, nonCts.map((n) => n.toString()).join("\n"));
  return nonCts[0].children.map((child) => {
    const node = XmlNode.assertIsNode(child);
    assertEqual(node.name, "refState");
    return checkPresent(node.getAttr("unit"));
  });
}

function divideWork(
  rows: ProcessedWork2["rows"],
  textParts: string[]
): WorkPage[] {
  const idLength = textParts.length - 1;
  const pages: WorkPage[] = [];
  const addedPages = new Set<string>();
  let currentId: undefined | string[] = undefined;
  let currentStart: undefined | number = undefined;

  function addPageIfNeeded(end: number) {
    if (currentId !== undefined) {
      assert(!addedPages.has(currentId.join(".")));
      addedPages.add(currentId.join("."));
      pages.push({ id: currentId, rows: [checkPresent(currentStart), end] });
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const id = rows[i][0].split(".");
    const pageId = id.slice(0, idLength);
    const isNewPage =
      currentId === undefined || !areArraysEqual(currentId, pageId);
    // If we're in the same page, just keep going. We only track the end index.
    if (!isNewPage) {
      continue;
    }

    addPageIfNeeded(i);
    // If the current id matches the expected length, start a new page.
    // Otherwise, reset the current ID and start.
    if (pageId.length === idLength) {
      currentId = pageId;
      currentStart = i;
    } else {
      currentId = undefined;
      currentStart = undefined;
    }
  }
  addPageIfNeeded(rows.length);
  return pages;
}

/** Returns the processed content of a TEI XML file. */
export function processTei2(
  xmlRoot: XmlNode,
  options?: ProcessTeiOptions
): ProcessedWork2 {
  const textParts = getTextparts(xmlRoot);
  const processOptions: ProcessForDisplayOptions = {
    debug: options?.sideChannel,
    patchTree: createPatchTree(options?.patches ?? [], textParts),
  };
  const body = checkSatisfies(
    xmlRoot.findDescendants("body"),
    (arr) => arr.length === 1
  );
  const rows = processWorkBody(body[0], textParts, processOptions);
  return {
    info: extractInfo(xmlRoot),
    textParts,
    rows,
    pages: divideWork(rows, textParts),
  };
}
