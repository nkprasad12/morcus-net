import {
  assert,
  assertArraysEqual,
  assertEqual,
  assertType,
  checkPresent,
  checkSatisfies,
} from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  FORCE_CTS_WORKS,
  LatinWorks,
} from "@/common/library/library_constants";
import type { LibraryPatch } from "@/common/library/library_patches";
import {
  type DocumentInfo,
  type NavTreeNode,
  type ProcessedWork2,
  type ProcessedWorkContentNodeType,
  type WorkPage,
} from "@/common/library/library_types";
import { areArraysEqual, safeParseInt } from "@/common/misc_utils";
import { processWords } from "@/common/text_cleaning";
import { extractInfo, findCtsEncoding } from "@/common/xml/tei_utils";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { instanceOf, isString } from "@/web/utils/rpc/parsing";

const IGNORE_SUBTYPES = new Map<string, Set<string>>([
  [LatinWorks.CATULLUS, new Set(["Lyrics", "longpoems", "Elegies"])],
]);
const NO_SUBTYPES = new Set([LatinWorks.TACITUS_DIALOGUS]);

// For regular nodes
const CHOICE_GOOD_CHILD = new Set<string | undefined>(["reg", "corr", "abbr"]);
const SKIP_NODES = new Set(["#comment", "pb"]);
const QUOTE_NODES = new Set(["q", "quote"]);
const HANDLED_REND = new Set<string>([
  "indent",
  "ital",
  "italic",
  "italics",
  "blockquote",
  "uppercase",
  "smallcaps",
  "overline",
  // These are used in gaps. We can just ignore them.
  "* * * *",
  "...",
]);
// `merge` occurs infrequently, when we have a continued quote:
// <l>blah blah <q>blah </q></l>
// <l><q rend="merge">blah</q> blah</l>
// so the `merge` is supposed to indicate that the quote is merged with the
// previous quote.
// This is very hard to handle, so we just ignore it.
const KNOWN_REND = new Set(
  [
    undefined,
    "merge",
    "align(indent)",
    "merge;double",
    "double",
    "double; merge",
    "single",
    "align(blockquote)",
  ].concat(...HANDLED_REND)
);

const TABLE_ITEM_CHILDREN = new Set<string>(["date"]);
// For `note` nodes. These should be separate since they're
// rendered in a tooltip.
const NOTE_NODES = new Set([
  "note",
  "hi",
  "emph",
  "foreign",
  "q",
  "quote",
  "title",
  "gap",
  "placeName",
  "date",
  "bibl",
  "cit",
  "pb",
  "lb",
  "l",
  "add",
  "persName",
  "surname",
  "milestone",
  "app",
  "lem",
  "rdg",
  "del",
  "w",
]);
const HANDLED_NOTE_REND = new Set<string | undefined>([
  "italic",
  "italics",
  "sup",
  "superscript",
  "overline",
]);
const KNOWN_NOTE_REND = new Set<string | undefined>([
  undefined,
  ...HANDLED_NOTE_REND,
]);
const KNOWN_NOTE_ATTRS = new Set<string | undefined>([
  "xml:lang",
  "anchored",
  "place",
  "resp",
  "sid",
  "uid",
  "parent",
  "n", // This is just ignored, for now.
  "target",
]);

type QuoteOpen = "‘" | "“" | "'" | '"';
type QuoteClose = "’" | "”" | "'" | '"';
type QuotePair = [QuoteClose, QuoteOpen];
const QUOTE_PAIRS: QuotePair[] = [
  ["’", "‘"],
  ["”", "“"],
  ["'", "'"],
  ['"', '"'],
];
const QUOTE_OPENS: Set<unknown> = new Set<QuoteOpen>(
  QUOTE_PAIRS.map((x) => x[1])
);
const QUOTE_CLOSES: Set<unknown> = new Set<QuoteClose>(
  QUOTE_PAIRS.map((x) => x[0])
);
const QUOTE_OPEN_FOR_CLOSE = new Map<QuoteClose, QuoteOpen>(QUOTE_PAIRS);

function isQuoteOpen(x: unknown): x is QuoteOpen {
  return QUOTE_OPENS.has(x);
}

function isQuoteClose(x: unknown): x is QuoteClose {
  return QUOTE_CLOSES.has(x);
}

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
  workId?: string;
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

type PTC = [node: XmlNode | string, [quoteOpens: QuoteOpen, context: string][]];

function analyzeQuotesInNode(input: PTC): PTC {
  const node = input[0];
  let opens = Array.from(input[1]);
  if (typeof node !== "string") {
    const children: XmlChild[] = [];
    for (const child of node.children) {
      const result = analyzeQuotesInNode([child, opens]);
      opens = result[1];
      children.push(result[0]);
    }
    return [new XmlNode(node.name, node.attrs, children), opens];
  }
  for (let i = 0; i < node.length; i++) {
    const c = node[i];
    const lastOpen: QuoteOpen | undefined = opens.slice(-1)[0]?.[0];
    if (isQuoteClose(c)) {
      if (lastOpen === checkPresent(QUOTE_OPEN_FOR_CLOSE.get(c))) {
        opens.pop();
        continue;
      }
      const isAmbiguous = c === "'" || c === '"';
      assert(isAmbiguous, `Got close without open. [${node}] [${opens}]`);
    }
    if (isQuoteOpen(c)) {
      opens.push([c, node]);
    }
  }
  return [node, opens];
}

// This isn't used now. We need to figure out a strategy to handle unclosed quotes.
// - For Saturae, the scan shows double quotes everywhere, so maybe we can just change it.
// - For others, maybe we can try to fix the closes?
// - Maybe we should try to smartly choose what a `<quote>` represents?
export function analyzeQuotes(rows: ProcessedWork2["rows"]) {
  let opens: PTC[1] = [];
  for (const [_, rowRoot] of rows) {
    const [_, unhandled] = analyzeQuotesInNode([rowRoot, opens]);
    opens = unhandled;
  }
  if (opens.length > 0) {
    console.debug("Opens without closes: ");
    console.debug(opens);
  }
  return opens;
}

export function getSectionId(
  ancestors: XmlNode[],
  textParts: string[],
  workId?: string
): [string[], boolean] {
  let i = 0;
  const sectionId: string[] = [];
  let parentHadSection = false;
  const noSubtypes = NO_SUBTYPES.has(workId ?? "");
  for (const ancestor of ancestors) {
    const n = ancestor.getAttr("n");
    if (ancestor.name === "seg") {
      assertEqual(textParts[i].toLowerCase(), ancestor.getAttr("type"));
      sectionId.push(checkPresent(n));
      i++;
      parentHadSection = true;
      continue;
    }
    const typeAttr = ancestor.getAttr("type");
    const subtype = ancestor.getAttr("subtype");
    const isTextPart = typeAttr === "textpart";
    if (noSubtypes) {
      assertEqual(ancestor.getAttr("subtype"), undefined);
      if (typeAttr === undefined) {
        parentHadSection = false;
        continue;
      }
    }
    // `l` is sometimes used even if the CTS says `line`, and it is often not marked.
    // It is also sometimes used to show poetry in prose when it's not a CTS
    // section.
    if (
      !noSubtypes &&
      !isTextPart &&
      (ancestor.name !== "l" || i >= textParts.length)
    ) {
      parentHadSection = false;
      continue;
    }
    if (IGNORE_SUBTYPES.get(workId ?? "")?.has(subtype ?? "")) {
      parentHadSection = false;
      continue;
    }
    assertEqual(
      textParts[i].toLowerCase(),
      ancestor.name === "l"
        ? "line"
        : (noSubtypes ? typeAttr : subtype)?.toLowerCase()
    );
    if (n === undefined && ancestor.name === "l") {
      assertEqual(workId, "phi0550.phi001.perseus-lat1");
      assertEqual(ancestor.children.length, 1);
      assertEqual(XmlNode.assertIsNode(ancestor.children[0]).name, "gap");
      parentHadSection = false;
      continue;
    }
    sectionId.push(checkPresent(n));
    i++;
    parentHadSection = true;
  }
  return [sectionId, parentHadSection];
}

interface PreprocessedTree {
  root: XmlNode;
  uids: XmlNode[];
  includedSections: Set<string>[];
  notes: XmlNode[];
}

interface DeepcopiedAndExtracted {
  root: XmlNode;
  notesWithXmlId: XmlNode[];
}

// Creates a deep copy of the root, while also extracting out nodes for later assembly.
function deepcopyAndExtract(root: XmlNode): DeepcopiedAndExtracted {
  const children: XmlChild[] = [];
  const notesWithXmlId: XmlNode[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      children.push(child);
      continue;
    }
    if (child.name === "note" && child.getAttr("xml:id") !== undefined) {
      notesWithXmlId.push(child.deepcopy());
      continue;
    }
    const childResult = deepcopyAndExtract(child);
    children.push(childResult.root);
    notesWithXmlId.push(...childResult.notesWithXmlId);
  }
  return {
    root: new XmlNode(root.name, [...root.attrs], children),
    notesWithXmlId,
  };
}

function preprocessTree(
  originalRoot: XmlNode,
  textParts: string[],
  options: ProcessForDisplayOptions
): PreprocessedTree {
  const textPartsLower = textParts.map((part) => part.toLowerCase());
  const notes: XmlNode[] = [];
  const { root, notesWithXmlId } = deepcopyAndExtract(originalRoot);
  const notesWithXmlIdMap = new Map(
    notesWithXmlId.map((n) => [checkPresent(n.getAttr("xml:id")), n])
  );
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

    const [section, isLeader] = getSectionId(
      ancestors,
      textPartsLower,
      options.workId
    );
    section.forEach((p) => assert(!p.includes(".")));
    top.attrs.push(["sid", section.join(".")]);
    if (isLeader) {
      top.attrs.push(["leader", "1"]);
    }
    if (top.name === "note") {
      top.attrs.forEach((attr) =>
        assert(KNOWN_NOTE_ATTRS.has(attr[0]), attr[0])
      );
      const noteId = notes.length.toString();
      const target = top.getAttr("target");
      if (target === undefined) {
        // If there's no target, treat it as a regular note. This means we expect that it has
        // content as its children. In this case, we keep the original node to mark the location,
        // and store the content separately.
        notes.push(top.deepcopy());
        top.attrs.push(["noteId", noteId]);
        // This is a way to remove all children from the node.
        // `note` is included in the tree to mark the position,
        // but the actual content is stored separately.
        top.children.length = 0;
      } else {
        // If there is a target, treat it as the alternate formate for notes where we have:
        // <note target="someId" /> representing the location of a node, and we have (later)
        // <note xml:id="someId"> ... </note> representing the content.
        assertEqual(top.children.length, 0);
        const content = checkPresent(notesWithXmlIdMap.get(target), target);
        // Note: we explicitly do not delete the note from the map because sometimes the
        // same content is referenced multiple times.
        notes.push(content.deepcopy());
        top.attrs.push(["noteId", noteId]);
      }
      continue;
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
      // Ignore milestones for now, but we may need to use it later.
      if (child.name === "milestone") {
        assertEqual(child.children.length, 0);
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
  return { root, uids, includedSections, notes };
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

function* findAncestors(
  node: XmlNode,
  tree: PreprocessedTree
): Generator<XmlNode> {
  let current: XmlNode = node;
  while (true) {
    yield current;
    const parent = safeParseInt(current.getAttr("parent"));
    if (parent === undefined) {
      assertEqual(current, tree.root);
      break;
    }
    current = tree.uids[parent];
  }
}

/**
 * Finds the nearest ancestor `lg`. and returns its section ID and UID.
 *
 * @param node - The XML node to start the search from.
 * @param tree - The preprocessed tree containing the node and its ancestors.
 * @returns A tuple with the section ID of the `lg` and its UID, or undefined.
 */
function findLg(
  node: XmlNode,
  tree: PreprocessedTree
): [string, string] | undefined {
  for (const ancestor of findAncestors(node, tree)) {
    if (ancestor.name === "lg") {
      return [
        checkPresent(ancestor.getAttr("sid")),
        checkPresent(ancestor.getAttr("uid")),
      ];
    }
  }
  return undefined;
}

function splitSid(sid: string): string[] {
  return sid.length === 0 ? [] : sid.split(".");
}

function convertToRows(
  current: XmlNode,
  data: PreprocessedTree
): [string[], XmlNode][] {
  const uid = checkPresent(safeParseInt(current.getAttr("uid")));
  const sections = checkPresent(data.includedSections[uid]);
  const sid = splitSid(checkPresent(current.getAttr("sid")));
  // If the current node only has one section beneath it, add it as a row.
  if (sections.size === 1) {
    // Check to see if the section is contained within an `lg` node and attach
    // the data of the `lg` node for later processing.
    const nearestLg = findLg(current, data);
    if (nearestLg !== undefined) {
      current.attrs.push(["lg-sid", nearestLg[0]]);
      current.attrs.push(["lg", nearestLg[1]]);
    }
    return [[sid, current]];
  }
  const results: [string[], XmlNode][] = [];
  for (const child of current.children) {
    if (typeof child === "string") {
      // Ignore just whitespace.
      if (child.trim() === "") {
        continue;
      }
      // Wrap the string child in a node.
      results.push([sid, new XmlNode("span", [], [child])]);
      continue;
    }
    results.push(...convertToRows(child, data));
  }
  return results;
}

function transformNoteNode(node: XmlNode): XmlNode {
  assert(NOTE_NODES.has(node.name), node.name);
  if (node.name === "lb") {
    return new XmlNode("br", [], []);
  }
  if (node.name === "gap") {
    return new XmlNode("span", [], [" [gap] "]);
  }
  const attrs: XmlNode["attrs"] = [];
  if (["l"].includes(node.name)) {
    attrs.push(["block", "1"]);
  }
  const rend = node.getAttr("rend");
  assert(KNOWN_NOTE_REND.has(rend), rend);
  if (HANDLED_NOTE_REND.has(rend)) {
    const finalRend = rend === "italics" ? "italic" : rend;
    attrs.push(["rend", checkPresent(finalRend)]);
  }
  if (QUOTE_NODES.has(node.name)) {
    attrs.push(["rend", "italic"]);
  }
  const baseChildren = node.children.map((c) =>
    typeof c === "string" ? c : transformNoteNode(c)
  );
  let isAppCritLem = false;
  if (node.name === "lem") {
    isAppCritLem = true;
  }
  if (node.name === "w") {
    assertEqual(node.getAttr("type"), "lemma");
    isAppCritLem = true;
  }

  const children =
    node.name === "add"
      ? ["<", ...baseChildren, ">"]
      : isAppCritLem
      ? [...baseChildren, " ]"]
      : node.name === "del"
      ? ["[", ...baseChildren, "]"]
      : baseChildren;
  return new XmlNode("span", attrs, children);
}

function transformContentNode(
  node: XmlNode,
  children: XmlChild<ProcessedWorkContentNodeType>[],
  parent?: XmlNode
): XmlNode<ProcessedWorkContentNodeType> {
  const attrs: XmlNode["attrs"] = [];
  const rend = node.getAttr("rend");
  assert(KNOWN_REND.has(rend), rend);
  if (rend !== undefined && HANDLED_REND.has(rend)) {
    if (node.name === "emph") {
      assertEqual(rend, "italic");
    }
    const finalRend = rend === "ital" || rend === "italics" ? "italic" : rend;
    attrs.push(["rend", finalRend], ["rendParent", node.name]);
  }
  if (node.name === "title") {
    attrs.push(["sectionHead", "1"]);
  }
  if (node.name === "ab") {
    attrs.push(["block", "1"]);
  }
  if (node.name === "l") {
    attrs.push(["l", "1"]);
  }
  if (node.name === "choice") {
    assertEqual(
      // Ignore children that are just whitespace. Some of the documents have
      // <choice> <corr>corrected</corr> <sic>incorrect</sic> </choice>
      // where the spaces are uneeded.
      children.filter((c) => typeof c !== "string" || c.trim().length > 0)
        .length,
      2
    );
    const corrected = XmlNode.assertIsNode(
      checkPresent(
        children.find(
          (c) =>
            typeof c !== "string" &&
            CHOICE_GOOD_CHILD.has(c.getAttr("origName"))
        )
      )
    );
    return corrected;
  }
  if (node.name === "corr") {
    assertType(children[0], isString);
    assertEqual(parent?.name, "choice");
    attrs.push(["origName", node.name]);
  }
  if (node.name === "abbr") {
    assertEqual(parent?.name, "choice");
    attrs.push(["origName", node.name]);
  }
  if (node.name === "orig") {
    attrs.push(["origName", node.name]);
  }
  if (node.name === "note") {
    const noteId = checkPresent(node.getAttr("noteId"));
    return new XmlNode("note", [["noteId", noteId]]);
  }
  if (node.name === "reg") {
    assert(children.length === 1);
    const child = assertType(children[0], isString);
    if (parent?.name === "choice") {
      attrs.push(["origName", node.name]);
      return new XmlNode("span", attrs, children);
    }
    assert(/^[a-zA-Zé]/.test(child), child);
    const capitalized = child[0].toUpperCase() + child.slice(1);
    return new XmlNode("span", attrs, [capitalized]);
  }
  if (QUOTE_NODES.has(node.name)) {
    return new XmlNode(
      "span",
      attrs,
      // We don't need to add quotes even if the node is a `quote` since
      // the blockquote will emphasize enough.
      rend === "blockquote" ? children : ["“", ...children, "”"]
    );
  }
  switch (node.name) {
    case "lb":
      return new XmlNode("br", [], []);
    case "head":
      return new XmlNode("head", attrs, children);
    case "gap":
      assert(children.length === 0);
      return new XmlNode("gap", attrs, children);
    case "label":
      assert(children.length === 1);
      return new XmlNode("b", attrs, children);
    case "l":
    case "hi":
    case "add":
    case "sic":
    case "said":
    case "emph":
    // We may some day want to handle these, but for
    // now just render the text.
    // eslint-disable-next-line no-fallthrough
    case "placeName":
    case "date":
    case "surname":
    case "persName":
    case "num":
    case "orig":
    case "seg":
    case "foreign":
    // Each node will be placed in its own row, so we don't
    // need to worry about making `div` and `p` into their own
    // sections. In the future we should probably think about
    // verifying that we don't have `div` or `p` internal to a
    // section where it actually matters, but for now this is fine.
    // eslint-disable-next-line no-fallthrough
    case "div":
    case "div2":
    case "div1":
    case "ab":
    case "lg":
    case "body":
    case "p":
    case "title":
    // TODO: Eventually we should probably link with these, but for now
    // we don't really need to do anything.
    // eslint-disable-next-line no-fallthrough
    case "bibl":
    case "cit":
    case "corr":
    case "abbr":
    // We are ignoring `expan` and `ex` for now, instead choosing to use
    // the abbreviated form `abbr` that is in the original text.
    // eslint-disable-next-line no-fallthrough
    case "expan":
    case "ex":
      return new XmlNode("span", attrs, children);
    case "del":
      return new XmlNode("span", attrs, ["[", ...children, "]"]);
  }
  throw new Error(`Unknown node: ${node.name}`);
}

function processListItem(root: XmlNode): XmlNode<ProcessedWorkContentNodeType> {
  const children: XmlChild<ProcessedWorkContentNodeType>[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      children.push(child);
      continue;
    }
    // These should all be something that requires no more processing than a simple span.
    assert(TABLE_ITEM_CHILDREN.has(child.name), child.name);
    children.push(processListItem(child));
  }
  return new XmlNode("span", [], children);
}

function processListNode(root: XmlNode): XmlNode<ProcessedWorkContentNodeType> {
  assertEqual(root.name, "list");
  assertEqual(root.getAttr("type"), "simple");
  const rows: [
    XmlNode<"b"> | undefined,
    XmlNode<ProcessedWorkContentNodeType> | undefined
  ][] = [];
  let lastLabel: XmlNode<"b"> | undefined = undefined;
  for (const child of root.children) {
    if (typeof child === "string") {
      assert(child.trim() === "");
      continue;
    }
    if (child.name === "headLabel") {
      assert(rows.length === 0);
      assertEqual(lastLabel, undefined);
      rows.push([
        new XmlNode("b", [], [XmlNode.getSoleText(child)]),
        undefined,
      ]);
      continue;
    }
    if (child.name === "label") {
      assertEqual(lastLabel, undefined);
      lastLabel = new XmlNode("b", [], [XmlNode.getSoleText(child)]);
      continue;
    }
    if (child.name === "item") {
      const item = processListItem(child);
      rows.push([lastLabel, item]);
      lastLabel = undefined;
      continue;
    }
    throw new Error(`Unknown table node: ${child.name}`);
  }
  return new XmlNode(
    "ul",
    [],
    rows.map(
      ([label, item]) =>
        new XmlNode(
          "li",
          [],
          [label, item].filter((n) => n !== undefined)
        )
    )
  );
}

function processRowContent(
  root: XmlNode,
  parent?: XmlNode
): XmlNode<ProcessedWorkContentNodeType> {
  if (root.name === "list") {
    return processListNode(root);
  }
  return transformContentNode(
    root,
    root.children.map((child) =>
      typeof child === "string" ? child : processRowContent(child, root)
    ),
    parent
  );
}

/** Exported for unit testing. */
export function processWorkBody(
  originalRoot: XmlNode,
  textParts: string[],
  options: ProcessForDisplayOptions
): Pick<ProcessedWork2, "rows" | "notes"> {
  const data = preprocessTree(originalRoot, textParts, options);
  const rawRows = convertToRows(data.root, data);
  const rows: ProcessedWork2["rows"] = [];
  let currentLg: undefined | [string, string[]] = undefined;
  const addSpaceRowIfNeeded = () =>
    currentLg !== undefined &&
    rows.push([currentLg[1], new XmlNode("space", [["lg", currentLg[0]]])]);

  for (const [id, rowRoot] of rawRows) {
    const rowLg = rowRoot.getAttr("lg");
    // Add a spacer row when the `lg` changes.
    if (rowLg !== currentLg?.[0]) {
      addSpaceRowIfNeeded();
      currentLg =
        rowLg === undefined
          ? undefined
          : [rowLg, splitSid(checkPresent(rowRoot.getAttr("lg-sid")))];
    }
    rows.push([id, processRowContent(rowRoot)]);
  }
  addSpaceRowIfNeeded();
  return { rows, notes: data.notes.map(transformNoteNode) };
}

function getTextparts(root: XmlNode, workId: string) {
  const refsDecls = root.findDescendants("refsDecl");
  const nonCts = refsDecls.filter((node) => node.getAttr("n") !== "CTS");
  if (FORCE_CTS_WORKS.has(workId) || nonCts.length === 0) {
    return findCtsEncoding(root)
      .sort((a, b) => a.idSize - b.idSize)
      .map((p) => p.name);
  }
  assertEqual(nonCts.length, 1, nonCts.map((n) => n.toString()).join("\n"));
  const textParts = nonCts[0].children
    .filter(instanceOf(XmlNode))
    .map((child) => {
      assert(["refState", "state"].includes(child.name));
      return checkPresent(child.getAttr("unit"));
    });
  return textParts;
}

/** Exported for unit testing. */
export function divideWork(
  rows: ProcessedWork2["rows"],
  textParts: string[]
): WorkPage[] {
  const n = textParts.length;
  const idLength = n === 1 ? n : n - 1;
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
    const id = rows[i][0];
    const pageId = id.slice(0, idLength);
    // If we're in the same page, just keep going. We only track the end index.
    if (currentId !== undefined && areArraysEqual(currentId, pageId)) {
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

export function buildNavTree(pages: WorkPage[]): NavTreeNode {
  const root: NavTreeNode = { id: [], children: [] };
  for (const { id } of pages) {
    let node = root;
    for (let i = 0; i < id.length; i++) {
      const idSubset = id.slice(0, i + 1);
      let child = node.children.find((c) => areArraysEqual(c.id, idSubset));
      if (child === undefined) {
        child = { id: idSubset, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root;
}

/** Returns the processed content of a TEI XML file. */
export function processTei2(
  xmlRoot: XmlNode,
  metadata: { workId: string; translationId?: string },
  options?: ProcessTeiOptions
): ProcessedWork2 {
  const textParts = getTextparts(xmlRoot, metadata.workId);
  const processOptions: ProcessForDisplayOptions = {
    debug: options?.sideChannel,
    patchTree: createPatchTree(options?.patches ?? [], textParts),
    workId: metadata.workId,
  };
  const body = checkSatisfies(
    xmlRoot.findDescendants("body"),
    (arr) => arr.length === 1
  );
  const { rows, notes } = processWorkBody(body[0], textParts, processOptions);
  const pages = divideWork(rows, textParts);
  const navTree = buildNavTree(pages);
  const info: DocumentInfo = {
    ...extractInfo(xmlRoot),
    workId: metadata.workId,
    translationId: metadata.translationId,
    attribution: "perseus",
  };
  return { info, textParts, rows, pages, navTree, notes };
}
