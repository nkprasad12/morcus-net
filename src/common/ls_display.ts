import { assert, assertEqual } from "@/common/assert";
import { XmlNode } from "@/common/ls_parser";

//
// Helper functions
//
function abbreviationText(
  original: string,
  lookup: Map<string, string>
): string {
  const expanded = lookup.get(original)!;
  return attachHoverText(expanded, `Expanded from: ${original}`);
}

function attachHoverText(displayText: string, hoverText: string): string {
  const style = `style="display: inline; border-bottom: 1px dashed blue;"`;
  return `<div ${style} title="${hoverText}">${displayText}</div>`;
}

function getSoleText(node: XmlNode): string {
  assert(node.children.length === 1);
  return assertIsString(node.children[0]);
}

function assertIsString(node: string | XmlNode): string {
  if (typeof node === "string") {
    return node;
  }
  throw new Error(`Expected "string", but got ${node.formatAsString()}`);
}

function assertIsNode(node: string | XmlNode, name?: string): XmlNode {
  if (typeof node === "string") {
    throw new Error(`Expected XmlNode, but got string.`);
  }
  if (name !== undefined) {
    assertEqual(name, node.name);
  }
  return node;
}

//
// Abbreviation maps
//
const NUMBER_ABBREVIATIONS = new Map<string, string>([
  ["sing.", "singular"],
  ["plur.", "plural"],
]);

const MOOD_ABBREVIATIONS = new Map<string, string>([["Part.", "Participle"]]);

const CASE_ABBREVIATIONS = new Map<string, string>([
  ["nom.", "nominative"],
  ["acc.", "accusative"],
  ["dat.", "dative"],
  ["gen.", "genitive"],
  ["abl.", "ablative"],
  ["voc.", "vocative"],
]);

const LBL_ABBREVIATIONS = new Map<string, Map<string, string>>([
  ["entryFree", new Map<string, string>([["dim.", "diminutive"]])],
  ["xr", new Map<string, string>([["v.", "look [at entry]"]])],
]);

// Schema
// ======
// entryFree:
// - orth
// - text
// - itype
// - gen
// - sense
// - pos
// - bibl
// - foreign
// - case
// - etym
// - mood
// - lbl
// - usg
// - cb
// - pb
// - quote
// - number
// - q
// - note
// - hi
// - figure

// orth:
// - text

// itype:
// - text

// gen:
// - text

// sense:
// - hi
// - text
// - foreign
// - cit
// - xr
// - cb
// - bibl
// - pb
// - usg
// - case
// - pos
// - orth
// - itype
// - gen
// - etym
// - number
// - mood
// - quote
// - figure
// - lbl
// - trans
// - tr

// hi:
// - text
// - q
// - cb
// - pb
// - usg
// - orth
// - hi

// foreign:
// - text
// - cb
// - reg

// cit:
// - quote
// - text
// - bibl
// - trans

// quote:
// - text
// - q
// - bibl
// - hi
// - foreign
// - quote

// bibl:
// - author
// - text
// - hi
// - cb
// - note
// Purpose: Usually contains an author and some text for the part of the work
//          where that comes from. Sometimes it doesn't contain an author, but it's
//          unclear what to do with these.
// Decision: Expand the abbreviations, and in the future when we have the library
//           available, link to the appropriate section of the library.
//           Flag instances where we have <hi> or <note> inside and figure out what to do with these.

// author:
// - text
// Decision: Expand the containing text as needed, show orig on hover.

// xr:
// - lbl
// - text
// - ref
// Purpose: Seems to be a cross-reference to another LS entry.
//          Seems to always contain <lbl> and <ref>.
// Decision: Expand the containing tags with the text it contains.

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
function displayLbl(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "lbl");
  assert(parent !== undefined, "<lbl> should have a parent.");
  return abbreviationText(
    getSoleText(root),
    LBL_ABBREVIATIONS.get(parent.name)!
  );
}

// ref:
// - text
// Purpose: Only used in <xr>. Shows which other entry should be linked to.
// Notes: Every instance has this attribute targOrder="U". Most have type="sym"
//        but the rest just have no type, instead.
// Decision: For `ref`s containing just a single word, link to that entry.
//           For `ref`s containing `the foll.` or `the preced.`, substitute for the name of
//           the following or preceding entry, with `original: foll.` or `preced.`
//           showing on hover.
//           Note: occaisonally we have `in the foll.` and in these cases we need to make sure
//                 to handle this appropriately.
//           Note: sometimes we have "these nouns" or "these words", flag these and manually figure out
//                 wtf we should do here.

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
function displayCb(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "cb");
  return "";
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
function displayPb(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "pb");
  return "";
}

// pos:
// - text
// Decision: Extract contained text and expand the abbreviation.

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
function displayCase(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "case");
  return abbreviationText(getSoleText(root), CASE_ABBREVIATIONS);
}

// usg:
// - text
// - hi
// Purpose: Usage note for the word. Note that it has a "type" attribute.
// Decision: Extract contained text, expanding abbreviations as needed.

// trans:
// - tr
// - text
// Purpose: Seems to be a translation of a <quote>
// Decision: Flag instances where we have a <trans> not immediately after a <quote>
//           Note: Usually there's a text node with a single space between the <trans> and the <quote>
//           Otherwise flatten out and just display the containing text, or possible add a "translation:" label.

// tr:
// - text
// Purpose: Seems to be a sub-part of <trans>
// Decision: Flag instances where we have <tr> outside of <trans> and not after <quote>
//           Otherwise, flatten out and just display the containing text.

// etym:
// - text
// - foreign
// - hi
// - pb
// - cb
// - pos
// - q
// - quote
// - bibl
// - lbl
// - mood
// - case
// - number
// - usg
// - cit
// - itype
// - xr
// - orth
// - gen

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
function displayMood(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "mood");
  return abbreviationText(getSoleText(root), MOOD_ABBREVIATIONS);
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
function displayNumber(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "number");
  return abbreviationText(getSoleText(root), NUMBER_ABBREVIATIONS);
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
function displayQ(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "q");
  return getSoleText(root);
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
function displayFigure(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "figure");
  return "";
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
function displayNote(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "note");
  return "";
}

/**
 * Expands a `reg` element.
 *
 * reg:
 * - sic
 * - corr
 *
 * Decision: Only occurs once. Parse as a special case where we display corr with a mouseover showing the sic.
 *
 * sic:
 * - text
 *
 * Decision: Save the contained text to show on hover for corr.
 *           Only occurrs once with reg and corr.
 *
 * corr:
 * - text
 *
 * Decision: Save the containted text to show as main text.
 *           Only occurs once with reg and sic.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayReg(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "reg");
  assert(root.children.length === 2);
  const sic = assertIsNode(root.children[0], "sic");
  const corr = assertIsNode(root.children[1], "corr");
  return attachHoverText(
    getSoleText(corr),
    `Corrected from original: ${getSoleText(sic)}`
  );
}

// Table for easy access to the display handler functions
export const DISPLAY_HANDLER_LOOKUP = new Map<
  string,
  (root: XmlNode, parent?: XmlNode) => string
>([
  ["case", displayCase],
  ["lbl", displayLbl],
  ["cb", displayCb],
  ["pb", displayPb],
  ["mood", displayMood],
  ["number", displayNumber],
  ["q", displayQ],
  ["figure", displayFigure],
  ["note", displayNote],
  ["reg", displayReg],
]);
