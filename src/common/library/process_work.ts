import { betaCodeToGreek } from "beta-code-js";

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
  buildCitationSpine,
  CitationSpine,
  textWeight,
} from "@/common/library/cite_structure";
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
import { extractInfo, type CtsMetadata } from "@/common/xml/tei_utils";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { instanceOf, isString } from "@/web/utils/rpc/parsing";
import {
  allRendTokensIn,
  canonicalRend,
  isFullyHandledRend,
  isHandledRend,
  isKnownRend,
  QUOTE_RENDS,
  rendTokens,
} from "@/common/library/perseus_rends";

// For regular nodes
const CHOICE_GOOD_CHILD = new Set<string | undefined>(["reg", "corr", "abbr"]);
/**
 * Values of `<l part>`, which marks a verse line split between speakers or
 * set as half-lines: Initial, Medial, Final, No (complete) and Y (incomplete,
 * position unknown; Aeneid half-lines). See the TEI guidelines for `@part`.
 */
const L_PARTS = new Set<string>(["I", "M", "F", "N", "Y"]);
/** `<l part>` values that continue a line, and so are indented. */
const CONTINUED_L_PARTS = new Set<string>(["M", "F"]);
const SKIP_NODES = new Set(["#comment", "pb"]);
const QUOTE_NODES = new Set(["q", "quote"]);

const TABLE_ITEM_CHILDREN = new Set<string>(["date"]);

/** Elements handled by the `switch` in `transformContentNode`. */
export const SWITCH_CONTENT_NODES = new Set<string>([
  "lb",
  "head",
  "docAuthor",
  "gap",
  "label",
  "w",
  "l",
  "hi",
  "add",
  "sic",
  "said",
  "emph",
  "placeName",
  "date",
  "surname",
  "persName",
  "name",
  "forename",
  "addName",
  "genName",
  "num",
  "orig",
  "seg",
  "foreign",
  "div",
  "div3",
  "div2",
  "div1",
  "ab",
  "lg",
  "body",
  "p",
  "title",
  "bibl",
  "cit",
  "corr",
  "abbr",
  "expan",
  "ex",
  "del",
  "supplied",
]);

/**
 * All content (non-note) element names accepted by the V1 TEI pipeline across
 * `preprocessTree`, `processRowContent`, `processListNode`, and
 * `transformContentNode`.
 */
export const CONTENT_ELEMENT_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  ...SWITCH_CONTENT_NODES,
  "choice",
  "reg",
  "note",
  ...QUOTE_NODES,
  "list",
  "headLabel",
  "item",
  ...TABLE_ITEM_CHILDREN,
  "milestone",
  ...SKIP_NODES,
]);

// For `note` nodes. These should be separate since they're
// rendered in a tooltip.
export const NOTE_NODES = new Set([
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
  "num",
  "gloss",
  "name",
  "forename",
  "addName",
  "genName",
  "reg",
  "choice",
  "corr",
  "sic",
  "orig",
  "abbr",
  "expan",
  "ex",
  "supplied",
  "p",
  "head",
  "seg",
  "#comment",
]);
export const NOTE_ELEMENT_ALLOWLIST: ReadonlySet<string> = NOTE_NODES;
export const HANDLED_NOTE_REND = new Set<string | undefined>([
  "italic",
  "italics",
  "sup",
  "superscript",
  "overline",
  "uppercase",
  "smallcaps",
  "blockquote",
  "bold",
  "super",
  "align(raised)",
  "sub",
  "subscript",
  "align(lowered)",
]);
/** Note renditions emitted under another name; see `transformNoteNode`. */
const NOTE_REND_ALIASES = new Map<string, string>([
  ["italics", "italic"],
  ["super", "superscript"],
  ["align(raised)", "superscript"],
  ["sub", "subscript"],
  ["align(lowered)", "subscript"],
]);
/** Rendition tokens allowed in notes; see `allRendTokensIn`. */
export const KNOWN_NOTE_REND = new Set<string | undefined>([
  undefined,
  ...HANDLED_NOTE_REND,
  ...QUOTE_RENDS,
  // Indentation means nothing inside a one-paragraph hover note: ignored.
  "indent",
  "align(indent)",
]);
export const KNOWN_NOTE_ATTRS = new Set<string | undefined>([
  "xml:lang",
  "anchored",
  "type",
  "place",
  "resp",
  "sid",
  "uid",
  "parent",
  "n", // This is just ignored, for now.
  "target",
  // Ignored on an inline note (one that no `<note target>` refers to).
  "xml:id",
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

interface PreprocessedTree {
  root: XmlNode;
  uids: XmlNode[];
  includedSections: Set<string>[];
  notes: XmlNode[];
}

interface DeepcopiedAndExtracted {
  root: XmlNode;
  notesWithXmlId: XmlNode[];
  notesWithN: XmlNode[];
}

/** A `<note target>` reference, without the optional leading `#`. */
function normalizeNoteTarget(target: string): string {
  return target.startsWith("#") ? target.slice(1) : target;
}

/** The `xml:id`s of every `<note>` under `root`. */
function findNoteXmlIds(root: XmlNode, ids = new Set<string>()) {
  for (const child of root.children) {
    if (typeof child === "string") {
      continue;
    }
    const id = child.name === "note" ? child.getAttr("xml:id") : undefined;
    if (id !== undefined) {
      ids.add(id);
    }
    findNoteXmlIds(child, ids);
  }
  return ids;
}

/** The (normalized) targets of every `<note target="..."/>` under `root`. */
function findNoteTargets(root: XmlNode, targets = new Set<string>()) {
  for (const child of root.children) {
    if (typeof child === "string") {
      continue;
    }
    const target = child.name === "note" ? child.getAttr("target") : undefined;
    if (target !== undefined) {
      targets.add(normalizeNoteTarget(target));
    }
    findNoteTargets(child, targets);
  }
  return targets;
}

/**
 * Whether `note` is the detached body of a `<note target="..."/>` that names
 * it by `@n` rather than `@xml:id`, as the Historia Augusta does:
 * `<note target="n1"/>` ... `<note n="n1">body</note>`. Ordinary inline notes
 * also carry `@n` (`<note n="1">body</note>`), so this is only a body when
 * something in the document actually references it.
 */
function isNoteBodyByN(note: XmlNode, targets: ReadonlySet<string>): boolean {
  const n = note.getAttr("n");
  return (
    n !== undefined &&
    note.getAttr("target") === undefined &&
    targets.has(n) &&
    note.children.some((c) => typeof c !== "string" || c.trim().length > 0)
  );
}

/**
 * The text of an empty `<note>` that carries its content in `@n` rather than
 * a footnote number: Tertullian's scripture references
 * (`<note n="I Cor. VII, 39."/>`).
 */
function referenceInN(node: XmlNode): string | undefined {
  const n = node.getAttr("n")?.trim();
  return n !== undefined &&
    /\p{L}/u.test(n) &&
    n.toLowerCase() !== "marg" &&
    textWeight(node) === 0
    ? n
    : undefined;
}

/**
 * Whether `node` is a footnote with nothing to show, which is dropped rather
 * than left as a dangling marker: an empty `<note n="..."/>` (Ausonius), or a
 * printed edition's marginal line number that OCR turned into a note
 * (`<note n="marg">35</note>`; Ausonius, Claudian, the Appendix Vergiliana).
 * Never a `<note target>` anchor, which is empty by design.
 */
export function isVacuousNote(node: XmlNode): boolean {
  if (node.name !== "note" || node.getAttr("target") !== undefined) {
    return false;
  }
  if (textWeight(node) === 0 && node.findDescendants("gap").length === 0) {
    return referenceInN(node) === undefined;
  }
  return (
    node.getAttr("n")?.trim().toLowerCase() === "marg" &&
    node.children.every((c) => typeof c === "string") &&
    /^\s*\d+\s*$/.test(node.children.join(""))
  );
}

// Creates a deep copy of the root, while also extracting out nodes for later assembly.
// A `<note xml:id>` is a detached body only if some `<note target>` names it;
// otherwise it is an ordinary inline note where it stands (Ovid's Ex Ponto
// gives every apparatus note an `xml:id` and has no targets, and Columella,
// Florus and Apuleius' Metamorphoses have bodies whose anchors were lost
// upstream, which sit at the Loeb page break they belong to).
//
// `originals` maps each copy back to the node it was copied from, so that the
// citation spine (computed on the original tree) can be looked up.
function deepcopyAndExtract(
  root: XmlNode,
  targets: ReadonlySet<string>,
  targetsByN: ReadonlySet<string>,
  originals: Map<XmlNode, XmlNode>
): DeepcopiedAndExtracted {
  const children: XmlChild[] = [];
  const notesWithXmlId: XmlNode[] = [];
  const notesWithN: XmlNode[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      children.push(child);
      continue;
    }
    const xmlId = child.name === "note" ? child.getAttr("xml:id") : undefined;
    if (xmlId !== undefined && targets.has(normalizeNoteTarget(xmlId))) {
      notesWithXmlId.push(child.deepcopy());
      continue;
    }
    if (child.name === "note" && isNoteBodyByN(child, targetsByN)) {
      notesWithN.push(child.deepcopy());
      continue;
    }
    const childResult = deepcopyAndExtract(
      child,
      targets,
      targetsByN,
      originals
    );
    children.push(childResult.root);
    notesWithXmlId.push(...childResult.notesWithXmlId);
    notesWithN.push(...childResult.notesWithN);
  }
  const copy = new XmlNode(root.name, [...root.attrs], children);
  originals.set(copy, root);
  return { root: copy, notesWithXmlId, notesWithN };
}

/** Maps each note to its `key` attribute, failing on duplicate keys. */
function indexNotesBy(notes: XmlNode[], key: string): Map<string, XmlNode> {
  const result = new Map<string, XmlNode>();
  for (const note of notes) {
    const id = checkPresent(note.getAttr(key));
    assert(!result.has(id), () => `Duplicate note ${key}="${id}"`);
    result.set(id, note);
  }
  return result;
}

function preprocessTree(
  originalRoot: XmlNode,
  spine: Pick<CitationSpine, "containers">,
  options: ProcessForDisplayOptions
): PreprocessedTree {
  const notes: XmlNode[] = [];
  // Targets that an `xml:id` already satisfies never take a `<note n>` as
  // their body, so an inline `<note n>` with the same value stays in place.
  const xmlIds = findNoteXmlIds(originalRoot);
  const allTargets = findNoteTargets(originalRoot);
  const targetsByN = new Set(
    Array.from(allTargets).filter((t) => !xmlIds.has(t))
  );
  const originals = new Map<XmlNode, XmlNode>();
  const { root, notesWithXmlId, notesWithN } = deepcopyAndExtract(
    originalRoot,
    allTargets,
    targetsByN,
    originals
  );
  const notesWithXmlIdMap = indexNotesBy(notesWithXmlId, "xml:id");
  const notesWithNMap = indexNotesBy(notesWithN, "n");
  const findNoteBody = (target: string): XmlNode | undefined => {
    const normalized = normalizeNoteTarget(target);
    return (
      notesWithXmlIdMap.get(target) ??
      notesWithXmlIdMap.get(normalized) ??
      notesWithNMap.get(normalized)
    );
  };
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

    const [section, isLeader] = CitationSpine.sectionIdOf(
      spine,
      ancestors.map((node) => originals.get(node) ?? node)
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
      // Inline notes are running text (e.g. the speaker labels of the
      // Academica), not footnotes; until they are modelled, fail loudly
      // rather than render them as hover notes.
      assert(
        top.getAttr("place") !== "inline",
        () =>
          `Inline note (place="inline") is not yet supported as a footnote: ${top.toString()}`
      );
      const noteId = notes.length.toString();
      const target = top.getAttr("target");
      if (target === undefined) {
        // If there's no target, treat it as a regular note. This means we expect that it has
        // content as its children. In this case, we keep the original node to mark the location,
        // and store the content separately.
        const reference = referenceInN(top);
        notes.push(
          reference === undefined
            ? top.deepcopy()
            : new XmlNode("note", [...top.attrs], [reference])
        );
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
        // The content is named by `xml:id` or, failing that, by `n`; the
        // target may carry a leading `#` (`target="#n1"`).
        const content = checkPresent(findNoteBody(target), target);
        content.attrs.forEach(([name]) =>
          assert(
            name === "xml:id" || KNOWN_NOTE_ATTRS.has(name),
            () => `Unknown note body attribute: ${name}`
          )
        );
        assert(
          content.getAttr("place") !== "inline",
          () =>
            `Inline note (place="inline") is not yet supported as a footnote: ${content.toString()}`
        );
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
      if (SKIP_NODES.has(child.name) || isVacuousNote(child)) {
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

const DIVISION_ELEMENTS = new Set(["div", "div1", "div2", "div3"]);
const EDITION_TYPES = new Set(["edition", "translation"]);

/**
 * Whether `node` holds editorial matter rather than citable text: a heading
 * or label, or an unnumbered division (Livy's index of sigla, a translator's
 * `<div type="commentary">` argument), which no citation can reach.
 */
function isEditorialNode(node: XmlNode): boolean {
  return (
    node.name === "head" ||
    node.name === "label" ||
    node.name === "docAuthor" ||
    (DIVISION_ELEMENTS.has(node.name) &&
      node.getAttr("n") === undefined &&
      !EDITION_TYPES.has(node.getAttr("type") ?? ""))
  );
}

/**
 * Whether `node`, a row's root, is a heading: a `<head>`, `<label>` or
 * `<docAuthor>` byline, or an unnumbered `opener` division (a letter's
 * dateline and salutation, as in Q. Cicero's Commentariolum). See
 * `divideWork`.
 */
function isHeadingNode(node: XmlNode): boolean {
  if (["head", "label", "docAuthor"].includes(node.name)) {
    return true;
  }
  return (
    DIVISION_ELEMENTS.has(node.name) &&
    node.getAttr("n") === undefined &&
    (node.getAttr("subtype") === "opener" || node.getAttr("type") === "opener")
  );
}

/** A row: its section id, its content, and whether it is editorial matter. */
type RawRow = [string[], XmlNode, boolean];

function convertToRows(
  current: XmlNode,
  data: PreprocessedTree,
  inEditorial: boolean = false
): RawRow[] {
  const editorial = inEditorial || isEditorialNode(current);
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
    return [[sid, current, editorial]];
  }
  const results: RawRow[] = [];
  for (const child of current.children) {
    if (typeof child === "string") {
      // Ignore just whitespace.
      if (child.trim() === "") {
        continue;
      }
      // Wrap the string child in a node.
      results.push([sid, new XmlNode("span", [], [child]), editorial]);
      continue;
    }
    results.push(...convertToRows(child, data, editorial));
  }
  return results;
}

function hasChildNamed(node: XmlNode, name: string): boolean {
  return node.children.some((c) => typeof c !== "string" && c.name === name);
}

/**
 * The transformed `children` of `node` (which correspond one-to-one with
 * `node.children`), except those that came from a child element `name`.
 */
function withoutChildrenNamed<T>(
  node: XmlNode,
  children: T[],
  name: string
): T[] {
  assertEqual(children.length, node.children.length);
  return children.filter((_, i) => {
    const original = node.children[i];
    return typeof original === "string" || original.name !== name;
  });
}

/** Exported for unit testing. */
export function transformNoteNode(node: XmlNode, parent?: XmlNode): XmlNode {
  assert(NOTE_NODES.has(node.name), node.name);
  if (node.name === "lb") {
    return new XmlNode("br", [], []);
  }
  if (node.name === "gap") {
    return new XmlNode("gap", [], []);
  }
  if (node.name === "#comment" || node.name === "pb") {
    return new XmlNode("span", [], []);
  }
  const rend = node.getAttr("rend");
  assert(allRendTokensIn(rend, KNOWN_NOTE_REND), rend);
  // Comments and page breaks are dropped outright: an empty element in
  // their place would hide the seam between its siblings from `needsWordBreak`.
  const sourceChildren = node.children.filter(
    (c) => typeof c === "string" || (c.name !== "#comment" && c.name !== "pb")
  );
  // Every child is transformed, and so validated, even in the branches of a
  // `choice` or `abbr` that are not shown, just as `processRowContent` does.
  const transformed = sourceChildren.map((c) =>
    typeof c === "string" ? c : transformNoteNode(c, node)
  );
  const childIndex = (pred: (c: XmlNode) => boolean) =>
    sourceChildren.findIndex((c) => typeof c !== "string" && pred(c));
  if (node.name === "choice" && childIndex(() => true) !== -1) {
    // As in the text: show the corrected, regularized or abbreviated form.
    let chosen = childIndex((c) => CHOICE_GOOD_CHILD.has(c.name));
    if (chosen === -1) {
      chosen = childIndex(
        (c) => c.name === "expan" && hasChildNamed(c, "abbr")
      );
    }
    assert(chosen !== -1, () => `No usable <choice> child: ${node}`);
    return XmlNode.assertIsNode(transformed[chosen]);
  }
  if (node.name === "expan" && hasChildNamed(node, "abbr")) {
    // <expan><abbr>acturu's</abbr><ex>acturus es</ex></expan>
    return XmlNode.assertIsNode(
      transformed[childIndex((c) => c.name === "abbr")]
    );
  }
  const attrs: XmlNode["attrs"] = [];
  if (node.name === "l") {
    attrs.push(["l", "1"]);
  } else if (["p", "head"].includes(node.name)) {
    attrs.push(["block", "1"]);
  }
  const handledRends = rendTokens(rend ?? "")
    .filter((token) => HANDLED_NOTE_REND.has(token))
    .map((token) => NOTE_REND_ALIASES.get(token) ?? token);
  if (node.name === "num") {
    handledRends.push("smallcaps");
  }
  if (node.name === "emph" && handledRends.length === 0) {
    handledRends.push("italic");
  }
  if (handledRends.length > 0) {
    attrs.push(["rend", Array.from(new Set(handledRends)).join(" ")]);
  }
  if (QUOTE_NODES.has(node.name)) {
    attrs.push(["rend", "italic"]);
  }
  if (node.name === "reg" && parent?.name !== "choice") {
    // As in the text, a standalone `reg` marks a capitalized word
    // (`<reg>cobet</reg>`, `Suet. <reg>iul</reg>.`).
    assert(transformed.length === 1);
    const child = assertType(transformed[0], isString);
    assert(/^[a-zA-Zé]/.test(child), child);
    return new XmlNode("span", attrs, [
      child[0].toUpperCase() + child.slice(1),
    ]);
  }
  // As in the text, an `abbr` shows only its abbreviated form, flush.
  const baseChildren =
    node.name === "abbr" && hasChildNamed(node, "expan")
      ? transformed.filter((c, i) => {
          const original = sourceChildren[i];
          return typeof original === "string"
            ? original.trim().length > 0
            : original.name !== "expan";
        })
      : transformed;
  let isAppCritLem = false;
  if (node.name === "lem") {
    isAppCritLem = true;
  }
  if (node.name === "w") {
    if (node.getAttr("type") === "lemma") {
      assertEqual(node.getAttr("type"), "lemma");
      isAppCritLem = true;
    } else {
      // Otherwise, check that it's just a word with no special attributes.
      // Sometimes `w` is used with `lem`, and sometimes it stands alone.
      assertEqual(node.attrs.length, 0);
    }
  }

  const children =
    node.name === "add"
      ? ["<", ...baseChildren, ">"]
      : isAppCritLem
      ? [...baseChildren, " ]"]
      : node.name === "del"
      ? ["[", ...baseChildren, "]"]
      : node.name === "supplied"
      ? ["⟨", ...baseChildren, "⟩"]
      : baseChildren;
  return new XmlNode("span", attrs, children);
}

/** Exported for unit testing. */
export function transformContentNode(
  node: XmlNode,
  children: XmlChild<ProcessedWorkContentNodeType>[],
  parent?: XmlNode
): XmlNode<ProcessedWorkContentNodeType> {
  const attrs: XmlNode["attrs"] = [];
  const rend = node.getAttr("rend");
  assert(isKnownRend(rend), rend);
  if (rend !== undefined && isHandledRend(rend)) {
    if (node.name === "emph") {
      // Emphasis is italic, or (upstream 2026) small caps: never ignored.
      assert(isFullyHandledRend(rend), rend);
    }
    const finalRend = canonicalRend(rend);
    attrs.push(["rend", finalRend], ["rendParent", node.name]);
  }
  if (node.name === "title") {
    // A title cited in running text (`qui <title>Ἁλιευτικὰ</title> scripsit`)
    // is italic, as printed; it is not a heading.
    if (rend === undefined || !isHandledRend(rend)) {
      attrs.push(["rend", "italic"]);
    }
  }
  if (node.name === "p" || node.name === "ab") {
    // Marks prose, so that a verse work's reader can set a prose preface or
    // epilogue as a paragraph rather than a verse line (`work_preprocessor`).
    attrs.push(["para", "1"]);
  }
  const hasSiblingParagraphs =
    node.name === "p" &&
    parent !== undefined &&
    parent.children.filter((c) => typeof c !== "string" && c.name === "p")
      .length > 1;
  if (node.name === "ab" || hasSiblingParagraphs) {
    attrs.push(["block", "1"]);
  }
  if (node.name === "l") {
    attrs.push(["l", "1"]);
    const part = node.getAttr("part");
    if (part !== undefined) {
      assert(L_PARTS.has(part), () => `Unknown <l part="${part}">`);
      if (CONTINUED_L_PARTS.has(part)) {
        // A separate attribute rather than `rend="indent"`, which would also
        // change the corpus text (see `extractRowText`).
        attrs.push(["linePart", part]);
      }
    }
  }
  if (node.name === "choice") {
    // Ignore children that are just whitespace. Some of the documents have
    // <choice> <corr>corrected</corr> <sic>incorrect</sic> </choice>
    // where the spaces are uneeded.
    const nonEmpty = children.filter(
      (c) => typeof c !== "string" || c.trim().length > 0
    );
    // Plautus wraps both forms in a single `expan`:
    // <choice><expan><abbr>acturu's</abbr><ex>acturus es</ex></expan></choice>
    // in which case the `expan` has already chosen its `abbr`.
    const isSoleExpan =
      nonEmpty.length === 1 &&
      node.children.some((c) => typeof c !== "string" && c.name === "expan");
    if (!isSoleExpan) {
      assertEqual(nonEmpty.length, 2);
    }
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
    assertEqual(parent?.name, "choice");
    attrs.push(["origName", node.name]);
  }
  if (node.name === "abbr") {
    // There are three ways to have `abbr`. The first is within a `choice`, in which it shows
    // one an abbreviated form and one expanded form. The second is an `abbr` with an `expan`
    // inside, before or after the abbreviated text (`<abbr>L.<expan>..</expan></abbr>`, or
    // Nepos' `<abbr><expan><ex>Gaio</ex></expan>C.</abbr>`). In that case, we just want to
    // show the abbreviated form. The third is an `abbr` within an `expan` (see `choice`).
    if (hasChildNamed(node, "expan")) {
      // Whitespace-only text is dropped along with the `expan`, so the
      // abbreviation renders flush, as it did before.
      return new XmlNode(
        "span",
        attrs,
        withoutChildrenNamed(node, children, "expan").filter(
          (c) => typeof c !== "string" || c.trim().length > 0
        )
      );
    }
    assert(
      parent?.name === "choice" || parent?.name === "expan",
      () => `Unexpected <abbr> in <${parent?.name}>`
    );
    attrs.push(["origName", node.name]);
  }
  if (node.name === "expan" && hasChildNamed(node, "abbr")) {
    // <expan><abbr>acturu's</abbr><ex>acturus es</ex></expan>: show only the
    // abbreviated form, as everywhere else. Plautus wraps this in a `choice`;
    // Cicero's speeches (phi0474.phi009, phi010, phi014) use it bare.
    assertEqual(children.length, node.children.length);
    const abbrs = children.filter((c, i) => {
      const original = node.children[i];
      return (
        typeof c !== "string" &&
        typeof original !== "string" &&
        original.name === "abbr"
      );
    });
    assertEqual(abbrs.length, 1);
    return XmlNode.assertIsNode(abbrs[0]);
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
    const normRends = canonicalRend(rend ?? "")
      .split(" ")
      .filter(Boolean);
    const isBlockquote = normRends.includes("blockquote");
    // `undirect` marks indirect discourse (Boethius' De Hebdomadibus), which
    // the printed edition sets without quotation marks.
    const isIndirect = rendTokens(rend ?? "").includes("undirect");
    let quoteChildren = children;
    if (isBlockquote) {
      // Perseus TEI sometimes places <lb/> (or <lb/><lb/>) at the very start
      // of <quote rend="blockquote"> to force a line break in inline
      // renderers; since .blockquote is already display: block with top
      // margin, a leading <br> inside .blockquote produces an unintended blank
      // line before the quote.
      const firstContentIdx = children.findIndex(
        (c) =>
          (typeof c === "string" && c.trim().length > 0) ||
          (typeof c !== "string" && c.name !== "br")
      );
      if (firstContentIdx !== -1) {
        const hasLeadingBr = children
          .slice(0, firstContentIdx)
          .some((c) => typeof c !== "string" && c.name === "br");
        if (hasLeadingBr) {
          quoteChildren = children.slice(firstContentIdx);
        }
      } else {
        const hasBr = children.some(
          (c) => typeof c !== "string" && c.name === "br"
        );
        if (hasBr) {
          quoteChildren = [];
        }
      }
    }
    return new XmlNode(
      "span",
      attrs,
      // We don't need to add quotes even if the node is a `quote` since
      // the blockquote will emphasize enough.
      isBlockquote || isIndirect ? quoteChildren : ["“", ...quoteChildren, "”"]
    );
  }
  if (node.name === "foreign") {
    const lang = node.getAttr("xml:lang") ?? node.getAttr("lang");
    if (lang === "greek") {
      assertEqual(node.children.length, 1);
      const child = assertType(node.children[0], isString);
      // `convertGrcBetaCode` has usually converted it already; only text that
      // is still Beta Code (ASCII, with a letter) is converted here.
      // eslint-disable-next-line no-control-regex
      const isBetaCode = /^[\x00-\x7F]*$/.test(child) && /[a-zA-Z]/.test(child);
      return new XmlNode(
        "span",
        [],
        [isBetaCode ? betaCodeToGreek(child) : child]
      );
    }
  }
  if (!SWITCH_CONTENT_NODES.has(node.name)) {
    throw new Error(`Unknown node: ${node.name}`);
  }
  switch (node.name) {
    case "lb":
      return new XmlNode("br", [], []);
    case "head":
    case "docAuthor":
      // A `docAuthor` byline (the Historia Augusta's lives) reads as a
      // heading over the text.
      return new XmlNode("head", attrs, children);
    case "gap":
      assert(children.length === 0);
      return new XmlNode("gap", attrs, children);
    case "label":
      assert(children.length === 1);
      return new XmlNode("b", attrs, children);
    case "w":
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
    case "name":
    case "forename":
    case "addName":
    case "genName":
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
    case "div3":
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
    case "supplied":
      // Text the editor supplied, in Leiden angle brackets.
      return new XmlNode("span", attrs, ["⟨", ...children, "⟩"]);
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

/** Exported for unit testing. */
export function processRowContent(
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
  spine: Pick<CitationSpine, "containers">,
  options: ProcessForDisplayOptions
): Pick<ProcessedWork2, "rows" | "notes"> {
  const { rows, notes } = processWorkBodyDetailed(originalRoot, spine, options);
  return { rows, notes };
}

/**
 * `processWorkBody`, also returning the indices of the rows that hold only
 * editorial matter (see `isEditorialNode`) or spacing.
 */
function processWorkBodyDetailed(
  originalRoot: XmlNode,
  spine: Pick<CitationSpine, "containers">,
  options: ProcessForDisplayOptions
): Pick<ProcessedWork2, "rows" | "notes"> & {
  editorialRows: Set<number>;
  headingRows: Set<number>;
} {
  const data = preprocessTree(originalRoot, spine, options);
  const rawRows = convertToRows(data.root, data);
  // Coverage: every piece of text in the body lands in some row.
  const rowWeight = rawRows.reduce((sum, [, row]) => sum + textWeight(row), 0);
  assertEqual(rowWeight, textWeight(data.root), "Body text missing from rows");
  const rows: ProcessedWork2["rows"] = [];
  const editorialRows = new Set<number>();
  const headingRows = new Set<number>();
  let currentLg: undefined | [string, string[]] = undefined;
  const addSpaceRowIfNeeded = () => {
    if (currentLg !== undefined) {
      editorialRows.add(rows.length);
      rows.push([currentLg[1], new XmlNode("space", [["lg", currentLg[0]]])]);
    }
  };

  for (const [id, rowRoot, editorial] of rawRows) {
    const rowLg = rowRoot.getAttr("lg");
    // Add a spacer row when the `lg` changes.
    if (rowLg !== currentLg?.[0]) {
      addSpaceRowIfNeeded();
      currentLg =
        rowLg === undefined
          ? undefined
          : [rowLg, splitSid(checkPresent(rowRoot.getAttr("lg-sid")))];
    }
    if (editorial) {
      editorialRows.add(rows.length);
    }
    if (isHeadingNode(rowRoot)) {
      headingRows.add(rows.length);
    }
    rows.push([id, processRowContent(rowRoot)]);
  }
  addSpaceRowIfNeeded();
  return {
    rows,
    notes: data.notes.map((note) => transformNoteNode(note)),
    editorialRows,
    headingRows,
  };
}

function startsWith(id: string[], prefix: string[]): boolean {
  return prefix.every((part, i) => id[i] === part);
}

/**
 * Splits `rows` into pages: one per section one level above the leaf (one per
 * section for a single-level scheme), except that a work cited by line alone
 * is a single page, as a poem is in Hypotactic.
 *
 * `headingRows` are the indices of heading rows (see `isHeadingNode`); a run
 * of them at the top level before the first page joins that page, so a work's
 * title heading or opening byline is not lost.
 *
 * Exported for unit testing.
 */
export function divideWork(
  rows: ProcessedWork2["rows"],
  textParts: string[],
  headingRows: ReadonlySet<number> = new Set()
): WorkPage[] {
  const n = textParts.length;
  if (n === 1 && textParts[0] === "line") {
    // One page per line is unreadable (the Appendix Vergiliana's `.//lb`
    // spines); a whole poem per page is what Hypotactic does too.
    return rows.length === 0 ? [] : [{ id: ["1"], rows: [0, rows.length] }];
  }
  const idLength = n === 1 ? n : n - 1;
  const pages: WorkPage[] = [];
  const addedPages = new Set<string>();
  let currentId: undefined | string[] = undefined;
  let currentStart: undefined | number = undefined;
  let pendingHeaderStartIdx: number | undefined = undefined;

  function addPageIfNeeded(end: number) {
    if (currentId !== undefined) {
      // Page ids are unique (and so each page's rows are contiguous).
      assert(
        !addedPages.has(currentId.join(".")),
        () => `Duplicate page id ${currentId?.join(".")} (rows not contiguous)`
      );
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
      const hasPrefix =
        pendingHeaderStartIdx !== undefined &&
        startsWith(pageId, rows[pendingHeaderStartIdx][0]);
      currentId = pageId;
      currentStart = hasPrefix ? pendingHeaderStartIdx : i;
      pendingHeaderStartIdx = undefined;
    } else {
      currentId = undefined;
      currentStart = undefined;
      if (0 < pageId.length && pageId.length < idLength) {
        if (
          pendingHeaderStartIdx !== undefined &&
          !startsWith(pageId, rows[pendingHeaderStartIdx][0])
        ) {
          pendingHeaderStartIdx = i;
        } else {
          pendingHeaderStartIdx ??= i;
        }
      } else if (
        pageId.length === 0 &&
        pages.length === 0 &&
        headingRows.has(i)
      ) {
        // A top-level heading before the first page (a speech's title, the
        // Historia Augusta's `docAuthor` byline) opens that page. Unnumbered
        // divisions there (Livy's index of sigla) are not headings and stay
        // off the pages, as do top-level rows between pages.
        pendingHeaderStartIdx ??= i;
      } else {
        pendingHeaderStartIdx = undefined;
      }
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
/** Subtrees of a Beta Code `foreign` node whose text should not be converted. */
const BETA_CODE_SKIP_NODES = new Set(["note", "pb", "milestone"]);

/**
 * Beta Code marks capitals with `*` (`*si/bulla`), but some texts just use an
 * uppercase letter (`Si/bulla`), which the converter would make lowercase.
 * `J` and `V` are not Beta Code letters, so they are left alone.
 */
function markBetaCodeCapitals(text: string): string {
  return text.replace(
    /(?<!\*)([A-IK-UW-Z])/g,
    (letter: string) => `*${letter.toLowerCase()}`
  );
}

function convertBetaCodeStrings(node: XmlNode): void {
  node.children.forEach((child, i) => {
    if (typeof child === "string") {
      node.children[i] = betaCodeToGreek(markBetaCodeCapitals(child))
        // A lone sigma (e.g. a manuscript siglum) shouldn't be final-form.
        .replace(/(?<!\p{L})ς(?!\p{L})/gu, "σ");
    } else if (!BETA_CODE_SKIP_NODES.has(child.name)) {
      convertBetaCodeStrings(child);
    }
  });
}

function betaCodeCandidateText(node: XmlNode): string {
  return node.children
    .map((child) =>
      typeof child === "string"
        ? child
        : BETA_CODE_SKIP_NODES.has(child.name)
        ? ""
        : betaCodeCandidateText(child)
    )
    .join("");
}

/**
 * Converts Greek written in Beta Code inside `<foreign xml:lang="grc">` to
 * Unicode, modifying `root` in place.
 *
 * Most `grc` text is already Unicode, but some works (e.g. Petronius, Seneca
 * the Elder, some Cicero) write it in Beta Code (`Si/bulla, ti/ qe/leis;`).
 * A `grc` node is treated as Beta Code only if its text is entirely ASCII and
 * contains at least one letter, so Unicode Greek is never touched.
 * (`xml:lang="greek"` is always Beta Code; see `transformContentNode`.)
 */
export function convertGrcBetaCode(root: XmlNode): void {
  function walk(node: XmlNode, inConvertedSubtree: boolean): void {
    const isSkip = BETA_CODE_SKIP_NODES.has(node.name);
    const isConverted = inConvertedSubtree && !isSkip;
    // Apicius writes `lang` without the `xml:` prefix.
    const lang = node.getAttr("xml:lang") ?? node.getAttr("lang");
    let convertedHere = false;
    if (!isConverted && (lang === "grc" || lang === "greek")) {
      const text = betaCodeCandidateText(node);
      // eslint-disable-next-line no-control-regex
      if (/^[\x00-\x7F]*$/.test(text) && /[a-zA-Z]/.test(text)) {
        convertBetaCodeStrings(node);
        convertedHere = true;
      }
    }
    const nextConverted = isConverted || convertedHere;
    for (const child of node.children) {
      if (typeof child !== "string") {
        walk(child, nextConverted);
      }
    }
  }

  walk(root, false);
}

/** What the structural stage knows about rows, for `assertOutputInvariants`. */
export interface RowFacts {
  /** Indices of rows of editorial matter (headings, unnumbered divisions). */
  editorialRows?: ReadonlySet<number>;
  /** Dotted ids of leaf sections; see `CitationSpine.leafIds`. */
  leafIds?: ReadonlySet<string>;
}

/**
 * Build-time output assertions on a processed work (`docs/PLAN.md` §4.3,
 * pillar 2: citation presence, well-formed row ids, uniform citation depth,
 * unique contiguous pages, and text coverage across pages). Body-to-row text
 * coverage and id-part validation are also checked where the rows and ids are
 * made; see `processWorkBody` and `cite_structure.ts`.
 *
 * Exported for unit testing.
 */
export function assertOutputInvariants(
  work: Pick<ProcessedWork2, "rows" | "pages" | "textParts">,
  facts: RowFacts = {}
): void {
  const { rows, pages, textParts } = work;
  const isCitable = (id: string[]) => id.length === textParts.length;
  // At least one citation level, and at least one citable row.
  assert(textParts.length > 0, "No citation levels");
  assert(
    rows.some(([id]) => isCitable(id)),
    () => `No citable rows (citation depth ${textParts.length}: ${textParts})`
  );
  for (const [id] of rows) {
    // No id part is empty or contains the `.` that joins them.
    assert(
      id.every((part) => part.length > 0 && !part.includes(".")),
      () => `Malformed row id ${JSON.stringify(id)}`
    );
    // Arity: no passage is cited more deeply than the work's scheme. Where
    // some passages go deeper than the rest (one poem of a collection in
    // sections), pages and citations would be wrong for one or the other.
    assert(
      id.length <= textParts.length,
      () =>
        `Ragged citation depth: ${id.join(".")} is deeper than ${textParts.join(
          "."
        )}`
    );
  }
  // Each citation names one passage: a citable id occurs in a single run of
  // consecutive rows. A passage the editor transposed and also printed, struck
  // out, where it was transmitted (Silius 11.453-458), or two divisions with
  // the same number (Cato's preface and chapter 1), would otherwise give two
  // `#sec-` anchors and break corpus search-to-reader links.
  const seenCitable = new Set<string>();
  rows.forEach(([id], i) => {
    if (!isCitable(id)) {
      return;
    }
    const key = id.join(".");
    if (i > 0 && areArraysEqual(rows[i - 1][0], id)) {
      return;
    }
    assert(!seenCitable.has(key), () => `Citation ${key} occurs twice`);
    seenCitable.add(key);
  });
  // There are pages, their ids are unique, and they cover every citable row.
  assert(pages.length > 0, "No pages");
  const pageIds = new Set(pages.map((page) => page.id.join(".")));
  assertEqual(pageIds.size, pages.length, "Duplicate page ids");
  const covered = new Array<boolean>(rows.length).fill(false);
  for (const { rows: range } of pages) {
    assert(
      0 <= range[0] && range[0] < range[1] && range[1] <= rows.length,
      () => `Bad page range ${range}`
    );
    covered.fill(true, range[0], range[1]);
  }
  rows.forEach(([id], i) =>
    assert(
      covered[i] || !isCitable(id),
      () => `Citable row ${id.join(".")} is on no page`
    )
  );
  // Page text coverage: the reader shows only pages, so text on no page is lost.
  // That is only allowed for editorial matter (headings, unnumbered
  // divisions), for the preamble of a section above page depth (text in a
  // book before its first chapter), and, for now, for leaf sections
  // shallower than page depth (Livy's books 46-142, which survive only as
  // summaries), which need per-branch pagination (plan Phase 4).
  const coveredIndices = rows.map((_, i) => i).filter((i) => covered[i]);
  rows.forEach(([id, row], i) => {
    if (covered[i] || facts.editorialRows?.has(i) || textWeight(row) === 0) {
      return;
    }
    if (facts.leafIds?.has(id.join("."))) {
      return;
    }
    const next = coveredIndices.find((j) => j > i);
    const previous = coveredIndices.filter((j) => j < i).pop();
    const isPreamble =
      next !== undefined &&
      startsWith(rows[next][0], id) &&
      (previous === undefined || !startsWith(rows[previous][0], id));
    assert(
      isPreamble,
      () =>
        `Text on no page at ${id.join(".") || "(top level)"}: ` +
        row.toString().replace(/\s+/g, " ").slice(0, 80)
    );
  });
}

export function processTei2(
  xmlRoot: XmlNode,
  metadata: {
    workId: string;
    translationId?: string;
    /**
     * The work's `__cts__.xml` metadata, for headers whose `titleStmt` lacks
     * an `<author>` or `<title>` (the Historia Augusta, the Appendix
     * Vergiliana); see `readCtsMetadata`.
     */
    ctsMetadata?: CtsMetadata;
  },
  options?: ProcessTeiOptions
): ProcessedWork2 {
  convertGrcBetaCode(xmlRoot);
  const body = checkSatisfies(
    xmlRoot.findDescendants("body"),
    (arr) => arr.length === 1
  )[0];
  const spine = buildCitationSpine(xmlRoot, body);
  const textParts = spine.textParts;
  const processOptions: ProcessForDisplayOptions = {
    debug: options?.sideChannel,
    patchTree: createPatchTree(options?.patches ?? [], textParts),
    workId: metadata.workId,
  };
  const { rows, notes, editorialRows, headingRows } = processWorkBodyDetailed(
    body,
    spine,
    processOptions
  );
  const pages = divideWork(rows, textParts, headingRows);
  assertOutputInvariants(
    { rows, pages, textParts },
    { editorialRows, leafIds: spine.leafIds }
  );
  const navTree = buildNavTree(pages);
  const info: DocumentInfo = {
    ...extractInfo(xmlRoot, metadata.ctsMetadata),
    workId: metadata.workId,
    translationId: metadata.translationId,
    attribution: "perseus",
  };
  return { info, textParts, rows, pages, navTree, notes };
}
