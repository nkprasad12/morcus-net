import { assert, assertEqual, checkPresent } from "@/common/assert";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import {
  CASE_ABBREVIATIONS,
  EDGE_CASE_HOVERS,
  GENERIC_EXPANSIONS,
  GENERIC_HOVERS,
  GEN_ABBREVIATIONS,
  LBL_ABBREVIATIONS,
  LsAuthorAbbreviations,
  MOOD_ABBREVIATIONS,
  NUMBER_ABBREVIATIONS,
  POS_ABBREVIATIONS,
  SCHOLAR_ABBREVIATIONS,
  USG_TRIE,
} from "@/common/lewis_and_short/ls_abbreviations";
import {
  substituteAbbreviation,
  attachHoverText,
  handleAbbreviations,
  handleAbbreviationsInMessage,
} from "@/common/lewis_and_short/ls_styling";
import { displayTextForOrth } from "@/common/lewis_and_short/ls_orths";
import { getBullet, sanitizeTree } from "@/common/lewis_and_short/ls_outline";
import { findExpansionsOld } from "@/common/abbreviations/abbreviations";
import { GRAMMAR_TERMS } from "@/common/lewis_and_short/ls_grammar_terms";

const AUTHOR_EDGE_CASES = ["Inscr.", "Cod.", "Gloss."];
const AUTHOR_PRE_EXPANDED = ["Georg Curtius", "Georg Curtius."];

export interface DisplayContext {
  lastAuthor?: string;
}

// Table for easy access to the display handler functions
const DISPLAY_HANDLER_LOOKUP = new Map<
  string,
  (root: XmlNode, context: DisplayContext, parent?: XmlNode) => XmlNode
>([
  ["sense", displaySense],
  ["hi", displayHi],
  ["foreign", displayForeign],
  ["cit", displayCit],
  ["quote", displayQuote],
  ["bibl", displayBibl],
  ["author", displayAuthor],
  ["xr", displayXr],
  ["ref", displayRef],
  ["usg", displayUsg],
  ["trans", displayTrans],
  ["tr", displayTr],
  ["etym", displayEtym],
  ["pos", displayPos],
  ["gen", displayGen],
  ["itype", displayItype],
  ["orth", displayOrth],
  ["case", displayCase],
  ["lbl", displayLbl],
  ["cb", displayCb],
  ["pb", displayPb],
  ["mood", displayMood],
  ["number", displayNumber],
  ["q", displayQ],
  ["figure", displayFigure],
  ["note", displayNote],
]);

export function defaultDisplay(
  root: XmlNode,
  context: DisplayContext,
  expectedNodes?: string[]
): XmlNode {
  const result: (XmlNode | string)[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      result.push(child);
    } else {
      if (expectedNodes !== undefined && !expectedNodes.includes(child.name)) {
        throw new Error("Unexpected node.");
      }
      result.push(
        checkPresent(DISPLAY_HANDLER_LOOKUP.get(child.name))(
          child,
          context,
          root
        )
      );
    }
  }
  return new XmlNode("span", [], result);
}

/**
 * Expands a `sense` element.
 *
sense:
- hi
- text
- foreign
- cit
- xr
- cb
- bibl
- pb
- usg
- case
- pos
- orth
- itype
- gen
- etym
- number
- mood
- quote
- figure
- lbl
- trans
- tr
 *
 * Decision: TODO
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displaySense(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "sense");
  return defaultDisplay(root, context);
}

/**
 * Expands a `hi` element.
 *
hi:
- text
- q
- cb
- pb
- usg
- orth
- hi
 *
 * Note: Highlighted text in a quote means it was filled in by L/S
 *
 * Decision: Just enclose in the appropriate style.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayHi(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "hi");
  assertEqual(root.attrs[0][0], "rend");
  const rendAttr = root.attrs[0][1];
  if (rendAttr === "sup") {
    return new XmlNode("sup", [], [defaultDisplay(root, context)]);
  }
  // The only options are "ital" and "sup"
  const firstChild = root.children[0];
  if (firstChild !== undefined && typeof firstChild === "string") {
    if (GRAMMAR_TERMS.has(firstChild)) {
      return new XmlNode("span", [["class", "lsGrammar"]], [firstChild]);
    }
  }
  return new XmlNode(
    "span",
    [["class", "lsEmph"]],
    [defaultDisplay(root, context, ["q", "cb", "pb", "usg", "orth", "hi"])]
  );
}

/**
 * Expands a `foreign` element.
 *
foreign:
- text
- cb
- reg
 *
 * Decision: Almost all of these are Greek, with only a few dozen exceptions
 *           which are mostly empty because they required a difficult scripts.
 *           Just display the text or a note explaining the omission.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayForeign(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "foreign");
  if (root.attrs.length === 0) {
    return attachHoverText(
      "[omitted]",
      "Usually for text in Hebrew or Etruscan scripts"
    );
  }
  if (root.getAttr("lang") === "he") {
    return new XmlNode("span", [["dir", "rtl"]], [XmlNode.getSoleText(root)]);
  }
  return defaultDisplay(root, context, ["cb", "reg"]);
}

/**
 * Expands a `cit` element.
 *
cit:
- quote
- text
- bibl
- trans
 *
 * Decision: No special handling.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayCit(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "cit");
  return defaultDisplay(root, context);
}

/**
 * Expands a `quote` element.
 *
quote:
- text
- q
- bibl
- hi
- foreign
- quote
 *
 * Note: `quote` inside quote is extremely rare (5 times total)
 *       `hi` inside quote only happens 7 times total
 *       `q` inside quote only happens 5 times, for nested quotes.
 *       `foreign` inside quote only happens once, and it's for a citation
 *       `bibl` inside quote happens only three times, and it
 * *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayQuote(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "quote");
  const result = defaultDisplay(root, context, [
    "q",
    "bibl",
    "hi",
    "foreign",
    "quote",
  ]);
  result.attrs.push(["class", "lsQuote"]);
  return result;
}

function chooseAuthor(
  biblRoot: XmlNode,
  context: DisplayContext,
  authorRoot: XmlNode
): LsAuthorAbbreviations.LsAuthorData | undefined {
  // TODO: Dedupe with logic in displayAuthor
  const authorKey = XmlNode.getSoleText(authorRoot);
  const resolvedKey =
    authorKey === "id." && context.lastAuthor !== undefined
      ? context.lastAuthor
      : authorKey;
  if (resolvedKey === "id.") {
    // TODO: Flag and correct these.
    return undefined;
  }
  const authorData = checkPresent(
    LsAuthorAbbreviations.authors().get(resolvedKey),
    `Expected authors map to contain ${resolvedKey}`
  );
  const siblings = biblRoot.children;
  let nextSibling: string | undefined = undefined;
  for (let i = 0; i < siblings.length - 1; i++) {
    if (siblings[i] === authorRoot) {
      nextSibling = XmlNode.assertIsString(siblings[i + 1]);
      break;
    }
  }
  if (nextSibling === undefined) {
    return undefined;
  }
  const workStart = nextSibling.trim().toLowerCase();
  for (const option of authorData) {
    for (const work of option.works.keys()) {
      if (workStart.startsWith(work.trim().toLowerCase())) {
        return option;
      }
    }
  }
  return undefined;
}

/**
 * Expands a `bibl` element.
 *
bibl:
- author
- text
- hi
- cb
- note

 * Purpose: Usually contains an author and some text for the part of the work
         where that comes from. Sometimes it doesn't contain an author, and in
         these cases it is referring to the previous `bibl`.

 * Decision: Expand the abbreviations, and in the future when we have the library
          available, link to the appropriate section of the library.
          Flag instances where we have <hi> or <note> inside and figure out what to do with these.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayBibl(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "bibl");
  const author = root.findDescendants("author");
  if (author.length === 0) {
    return defaultDisplay(root, context);
  }
  assertEqual(author.length, 1);

  const authorKey = XmlNode.getSoleText(author[0]);
  const resolvedKey =
    authorKey === "id." && context.lastAuthor !== undefined
      ? context.lastAuthor
      : authorKey;
  // TODO: Flag and correct cases where authorKey is id. but there's
  // no last author.
  const authorData = LsAuthorAbbreviations.authors().get(resolvedKey);
  let works = authorData === undefined ? undefined : authorData[0].worksTrie;
  if (authorData !== undefined && authorData.length > 1) {
    works = chooseAuthor(root, context, author[0])?.worksTrie;
  }
  const result = new XmlNode("span", [], []);
  for (const child of root.children) {
    if (typeof child === "string") {
      if (works === undefined) {
        result.children.push(child);
      } else {
        let expansions = findExpansionsOld(child, works);
        if (expansions.length === 0) {
          expansions = findExpansionsOld(child, works, true);
        }
        handleAbbreviationsInMessage(child, expansions, true).forEach((x) =>
          result.children.push(x)
        );
      }
    } else if (child.name === "author") {
      result.children.push(displayAuthor(child, context, root));
    } else {
      let display = defaultDisplay(child, context);
      if (works !== undefined) {
        display = handleAbbreviations(display, works, true);
      }
      result.children.push(display);
    }
  }
  result.attrs.push(["class", "lsBibl"]);
  return result;
}

/**
 * Expands a `author` element.
 *
author:
- text

 * Decision: Expand the containing text as needed, show orig on hover.
 *
 * @param root The root node for this element.
 * @param parent The parent node for the root.
 */
export function displayAuthor(
  root: XmlNode,
  context: DisplayContext,
  parent?: XmlNode
): XmlNode {
  assert(root.name === "author");
  const abbreviated = XmlNode.getSoleText(root);
  if (abbreviated === "id." || abbreviated === "ib.") {
    // TODO: Support these properly.
    return new XmlNode("span", [], [abbreviated]);
  }
  context.lastAuthor = abbreviated;

  if (SCHOLAR_ABBREVIATIONS.has(abbreviated)) {
    // TODO: Handle this correctly.
    return new XmlNode("span", [["class", "lsAuthor"]], [abbreviated]);
  }
  if (AUTHOR_PRE_EXPANDED.includes(abbreviated)) {
    return new XmlNode("span", [["class", "lsAuthor"]], [abbreviated]);
  }
  if (abbreviated === "Pseudo") {
    // TODO: Support this properly. We want to ideally read to the next
    // text node and figure out who the Pseudo author was.
    return new XmlNode("span", [["class", "lsAuthor"]], [abbreviated]);
  }
  for (const edgeCase of AUTHOR_EDGE_CASES) {
    if (!abbreviated.startsWith(edgeCase + " ")) {
      continue;
    }
    const authorData = checkPresent(
      LsAuthorAbbreviations.authors().get(edgeCase)
    );
    assertEqual(authorData.length, 1);
    const end = abbreviated.substring(edgeCase.length + 1);
    const worksMap = checkPresent(authorData[0].works);
    const endExpanded = checkPresent(worksMap.get(end));
    const expanded = `${authorData[0].expanded} ${endExpanded}`;
    return attachHoverText(expanded, `Originally: ${abbreviated}`);
  }
  const authorData = checkPresent(
    LsAuthorAbbreviations.authors().get(abbreviated)
  );
  assert(authorData.length > 0);
  if (authorData.length === 1) {
    return attachHoverText(abbreviated, authorData[0].expanded, ["lsAuthor"]);
  }
  // TODO: Dedupe with logic in displayBibl
  const siblings = checkPresent(parent).children;
  let nextSibling: string | undefined = undefined;
  for (let i = 0; i < siblings.length - 1; i++) {
    if (siblings[i] === root) {
      nextSibling = XmlNode.assertIsString(siblings[i + 1]);
      break;
    }
  }
  if (nextSibling === undefined) {
    const expansions = authorData.map((data) => data.expanded).join(" OR ");
    return attachHoverText(abbreviated, expansions, ["lsAuthor"]);
  }
  const workStart = nextSibling.trim().toLowerCase();
  for (const option of authorData) {
    for (const work of option.works.keys()) {
      if (workStart.startsWith(work.trim().toLowerCase())) {
        return attachHoverText(abbreviated, option.expanded, ["lsAuthor"]);
      }
    }
  }
  if (/^\d/.test(workStart)) {
    if (abbreviated === "Plin.") {
      return attachHoverText(
        abbreviated,
        "(Likely) Pliny the Elder; (Rarely) Pliny the Younger",
        ["lsAuthor"]
      );
    }
    if (abbreviated === "Just.") {
      return attachHoverText(
        abbreviated,
        "(Likely) Justinus, historian, about fl.(?) A.D. 150; (Rarely) Justinianus, emperor, ob. A.D. 565",
        ["lsAuthor"]
      );
    }
  }
  const expansions = authorData.map((data) => data.expanded).join(" OR ");
  return attachHoverText(abbreviated, expansions, ["lsAuthor"]);
}

/**
 * Expands a `xr` element.
 *
xr:
- lbl
- text
- ref

 * Purpose: Seems to be a cross-reference to another LS entry.
         Seems to always contain <lbl> and <ref>.

 * Decision: Expand the containing tags with the text it contains.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayXr(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "xr");
  return defaultDisplay(root, context);
}

/**
 * Expands a `ref` element.
 *
ref:
- text

 * Purpose: Only used in <xr>. Shows which other entry should be linked to.

Notes: Every instance has this attribute targOrder="U". Most have type="sym"
       but the rest just have no type, instead.

 * Decision: For `ref`s containing just a single word, link to that entry.
          For `ref`s containing `the foll.` or `the preced.`, substitute for the name of
          the following or preceding entry, with `original: foll.` or `preced.`
          showing on hover.
          Note: occaisonally we have `in the foll.` and in these cases we need to make sure
                to handle this appropriately.
          Note: sometimes we have "these nouns" or "these words", flag these and manually figure out
                wtf we should do here.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayRef(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "ref");
  const word = XmlNode.getSoleText(root);
  if (
    word.includes("foll.") ||
    word.includes("preced.") ||
    word.includes(" ")
  ) {
    // TODO: Calculate what the preceding and following entries are.
    // This also captures the "these words" case, for example like in "habeo". We need to
    // figure out how to handle these as well.
  }
  // TODO: Most of the links are `infra`, etc... referring to below in the same entry,
  // not to `infra` itself.
  // const link = `${process.env.SOCKET_ADDRESS}/dicts#${word}`;
  // return `<a href="${link}">${word}</a>`;
  return new XmlNode("span", [], [word]);
}

/**
 * Expands a `usg` element.
 *
usg:
- text
- hi

 * Purpose: Usage note for the word. Note that it has a "type" attribute.

 * Decision: Extract contained text, expanding abbreviations as needed.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayUsg(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "usg");
  return handleAbbreviations(defaultDisplay(root, context), USG_TRIE, true);
}

/**
 * Expands a `trans` element.
 *
trans:
- tr
- text
 *
 * Purpose: Seems to be a translation of a <quote>
 *
 * Decision: Flag instances where we have a <trans> not immediately after a <quote>
          Note: Usually there's a text node with a single space between the <trans> and the <quote>
          Otherwise flatten out and just display the containing text, or possible add a "translation:" label.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayTrans(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "trans");
  const result = defaultDisplay(root, context, ["tr"]);
  result.attrs.push(["class", "lsTrans"]);
  return result;
}

/**
 * Expands a `tr` element.
 *
 * tr:
 * - text
 *
 * Purpose: Seems to be a sub-part of <trans>
 *
 * Decision: Flag instances where we have <tr> outside of <trans> and not after <quote>
          Otherwise, flatten out and just display the containing text.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayTr(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "tr");
  return new XmlNode("span", [["class", "lsTr"]], [XmlNode.getSoleText(root)]);
}

/**
 * Expands a `etym` element.
 *
etym:
- text
- foreign
- hi
- pb
- cb
- pos
- q
- quote
- bibl
- lbl
- mood
- case
- number
- usg
- cit
- itype
- xr
- orth
- gen
 *
 * Decision: TODO
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayEtym(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "etym");
  const result = defaultDisplay(root, context);
  result.children.unshift("[");
  result.children.push("]");
  return result;
}

/**
 * Expands a `pos` element.
 *
 * pos:
 * - text
 *
 * Decision: Extract contained text and expand the abbreviation.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayPos(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "pos");
  return substituteAbbreviation(XmlNode.getSoleText(root), POS_ABBREVIATIONS);
}

/**
 * Expands a `orth` element.
 *
 * orth:
 * - text
 *
 * Purpose: Versions of the word. Has vowel length markings.
 *
 * Decision: can flatten to the contained text.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayOrth(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "orth");
  return new XmlNode(
    "span",
    [["class", "lsOrth"]],
    [displayTextForOrth(XmlNode.getSoleText(root))]
  );
}

/**
 * Expands a `itype` element.
 *
 * itype:
 * - text
 *
 * Purpose: Contains the inflection type of the element.
 *
 * Decision: can flatten to the contained text. In the long
 *           term we'll use this for inflection tables.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayItype(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "itype");
  return new XmlNode("span", [], [XmlNode.getSoleText(root)]);
}

/**
 * Expands a `gen` element.
 *
 * gen:
 * - text
 *
 * Purpose: Contains the gender of the element.
 *
 * Decision: can flatten to the contained text.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayGen(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "gen");
  return substituteAbbreviation(XmlNode.getSoleText(root), GEN_ABBREVIATIONS);
}

/**
 * Expands a `lbl` element.
 *
 * lbl:
 * - text
 *
 * Purpose: Seems to be a general "label" type of field.
 *         In `<xr>`, it seems to contain only v. = vide.
 *         In `<entryFree>`, it seems to contain only dim. = diminuitive
 *
 * Decision: Flag any non v. or dim. entries. For the rest, expand the
 *          abbrevation with a note on hover showing the original.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayLbl(
  root: XmlNode,
  context: DisplayContext,
  parent?: XmlNode
): XmlNode {
  assert(root.name === "lbl");
  assert(parent !== undefined, "<lbl> should have a parent.");
  return substituteAbbreviation(
    XmlNode.getSoleText(root),
    checkPresent(LBL_ABBREVIATIONS.get(checkPresent(parent).name))
  );
}

/**
 * Expands a `cb` element.
 *
 * cb:
 *
 * Decision: Stands for Column Break, can ignore.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayCb(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "cb");
  return new XmlNode("span");
}

/**
 * Expands a `pb` element.
 *
 * pb:
 *
 * Decision: Stands for Page Break, can ignore.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayPb(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "pb");
  return new XmlNode("span");
}

/**
 * Expands a `case` element.
 *
 * case:
 * - text
 *
 * Decision: Extract contained text and expand the case abbreviation.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayCase(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "case");
  return substituteAbbreviation(XmlNode.getSoleText(root), CASE_ABBREVIATIONS, [
    "lsGrammar",
  ]);
}

/**
 * Expands a `mood` element.
 *
 * mood:
 * - text
 *
 * Purpose: Seems to show verb mood. Only seems to contains "Part."
 *
 * Decision: Expand to `Participle`, with hover showing the original.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayMood(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "mood");
  return substituteAbbreviation(XmlNode.getSoleText(root), MOOD_ABBREVIATIONS);
}

/**
 * Expands a `number` element.
 *
 * number:
 * - text
 *
 * Purpose: Used for sing / pl tantum words.
 *
 * Decision: Expand to `singular` or `plural`, with hover showing the original.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayNumber(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "number");
  return substituteAbbreviation(
    XmlNode.getSoleText(root),
    NUMBER_ABBREVIATIONS
  );
}

/**
 * Expands a `q` element.
 *
 * q:
 * - text
 *
 * Purpose: I have no idea.
 *
 * Decision: can flatten to the contained text.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayQ(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "q");
  return new XmlNode("span", [["class", "lsQ"]], [XmlNode.getSoleText(root)]);
}

/**
 * Expands a `figure` element.
 *
 * figure:
 *
 * Purpose: Probably used for diagrams.
 *
 * Decision: Ignore.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayFigure(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "figure");
  return new XmlNode("span");
}

/**
 * Expands a `note` element.
 *
 * note:
 * - text
 *
 * Decision: only happens twice. Can just ignore.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayNote(
  root: XmlNode,
  context: DisplayContext,
  _parent?: XmlNode
): XmlNode {
  assert(root.name === "note");
  return new XmlNode("span");
}

export function formatSenseList(
  senseNodes: XmlNode[],
  context: DisplayContext
): XmlNode {
  if (senseNodes.length === 0) {
    return new XmlNode("div");
  }
  const stack: XmlNode[] = [];
  for (const senseNode of senseNodes) {
    const attrsMap = new Map(senseNode.attrs);
    const level = +checkPresent(attrsMap.get("level"));
    const n = checkPresent(attrsMap.get("n"));
    const id = checkPresent(senseNode.getAttr("id"));

    while (stack.length < level) {
      const attrs: [string, string][] =
        level === 1 ? [["class", "lsTopSense"]] : [];
      const newList = new XmlNode("ol", attrs, []);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(newList);
      }
      stack.push(newList);
    }
    while (stack.length > level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(
      new XmlNode(
        "li",
        [
          ["id", id],
          ["class", "QNA"],
        ],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsSenseBullet"],
              ["senseid", id],
            ],
            [` ${getBullet(n)}. `]
          ),
          defaultDisplay(senseNode, context),
        ]
      )
    );
  }
  return stack[0];
}

/**
 * Expands an `entryFree` element.
 *
entryFree:
- orth
- text
- itype
- gen
- sense
- pos
- bibl
- foreign
- case
- etym
- mood
- lbl
- usg
- cb
- pb
- quote
- number
- q
- note
- hi
- figure
 *
 * Decision: TODO
 *
 * @param rootNode The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayEntryFree(
  rootNode: XmlNode,
  _parent?: XmlNode
): XmlNode {
  assert(rootNode.name === "entryFree");
  const root = sanitizeTree(rootNode);
  const idAttr = checkPresent(root.getAttr("id"));
  const blurbId = idAttr + ".blurb";
  const context: DisplayContext = {};

  const mainBlurbNodes: XmlChild[] = [
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", blurbId],
      ],
      ["  •  "]
    ),
    " ",
  ];
  const senseNodes: XmlNode[] = [];
  let level1Icount = 0;
  for (const child of root.children) {
    if (typeof child === "string") {
      mainBlurbNodes.push(child);
    } else if (child.name === "sense") {
      // Sense nodes are always the last nodes, so we can process them after.
      senseNodes.push(child);
      const attrsMap = new Map(child.attrs);
      const level = checkPresent(attrsMap.get("level"));
      const n = checkPresent(attrsMap.get("n"));
      if (level === "1" && n === "I") {
        level1Icount += 1;
      }
    } else {
      mainBlurbNodes.push(
        checkPresent(DISPLAY_HANDLER_LOOKUP.get(child.name))(
          child,
          context,
          root
        )
      );
    }
  }

  const hasDuplicate1I = senseNodes.length > 0 && level1Icount > 1;
  const isSole1I = senseNodes.length === 1 && level1Icount === 1;
  if (hasDuplicate1I || isSole1I) {
    mainBlurbNodes.push(...defaultDisplay(senseNodes[0], context).children);
  }
  const attrs: [string, string][] = [["class", "lsEntryFree"]];
  attrs.push(["id", idAttr]);
  let result = new XmlNode("div", attrs, [
    new XmlNode(
      "div",
      [
        ["id", blurbId],
        ["class", "QNA"],
      ],
      mainBlurbNodes
    ),
    formatSenseList(
      senseNodes.slice(hasDuplicate1I || isSole1I ? 1 : 0),
      context
    ),
  ]);
  result = handleAbbreviations(result, EDGE_CASE_HOVERS, false);
  result = handleAbbreviations(result, GENERIC_EXPANSIONS, true);
  return handleAbbreviations(result, GENERIC_HOVERS, false);
}
