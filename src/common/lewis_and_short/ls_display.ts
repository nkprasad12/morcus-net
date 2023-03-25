import { assert, assertEqual } from "@/common/assert";
import { XmlNode } from "@/common/lewis_and_short/ls_parser";
import {
  CASE_ABBREVIATIONS,
  GEN_ABBREVIATIONS,
  LBL_ABBREVIATIONS,
  LsAuthorAbbreviations,
  MOOD_ABBREVIATIONS,
  NUMBER_ABBREVIATIONS,
  POS_ABBREVIATIONS,
} from "@/common/lewis_and_short/ls_abbreviations";
import {
  substituteAbbreviation,
  attachHoverText,
} from "@/common/lewis_and_short/ls_styling";

// Table for easy access to the display handler functions
const DISPLAY_HANDLER_LOOKUP = new Map<
  string,
  (root: XmlNode, parent?: XmlNode) => string
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
  ["reg", displayReg],
]);

function defaultDisplay(root: XmlNode, expectedNodes?: string[]): string {
  let result = "";
  for (const child of root.children) {
    if (typeof child === "string") {
      result += child;
    } else {
      if (expectedNodes !== undefined && !expectedNodes.includes(child.name)) {
        throw new Error("Unexpected node.");
      }
      result += DISPLAY_HANDLER_LOOKUP.get(child.name)!(child);
    }
  }
  return result;
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
function displaySense(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "sense");
  throw new Error("Not yet implemented.");
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
function displayHi(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "hi");
  assertEqual(root.attrs[0][0], "rend");
  const rendAttr = root.attrs[0][1];
  // The only options are "ital" and "sup"
  const styleType = rendAttr === "sup" ? "sup" : "i";
  const result = [`<${styleType}>`];
  result.push(defaultDisplay(root, ["q", "cb", "pb", "usg", "orth", "hi"]));
  result.push(`</${styleType}>`);
  return result.join("");
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
function displayForeign(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "foreign");
  if (root.attrs.length === 0) {
    return attachHoverText(
      "[omitted from digitization]",
      "Expanded from empty, usually for Hebrew or Etruscan."
    );
  }
  return defaultDisplay(root, ["cb", "reg"]);
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
function displayCit(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "cit");
  return defaultDisplay(root);
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
function displayQuote(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "quote");
  const result = [];
  result.push("“");
  // TODO: Is the nested quote intentional here? Maybe we should fix the markup.
  result.push(defaultDisplay(root, ["q", "bibl", "hi", "foreign", "quote"]));
  result.push("”");
  return result.join("");
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
function displayBibl(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "bibl");
  const author = root.findDescendants("author");
  if (author.length === 0) {
    return defaultDisplay(root);
  }
  assertEqual(author.length, 1);
  const authorKey = XmlNode.getSoleText(author[0]);
  const base = defaultDisplay(root);
  const works = LsAuthorAbbreviations.works().get(authorKey);
  if (works === undefined) {
    return base;
  }
  return base;
  // TODO: This does not handle split abbreviations, like t. t.
  // .split(" ")
  // .map((chunk) => {
  //   if (chunk === authorKey) {
  //     return chunk;
  //   }
  //   const expandedWork = works.get(chunk);
  //   if (expandedWork === undefined) {
  //     return chunk;
  //   }
  //   return attachHoverText(chunk, expandedWork);
  // })
  // .join(" ");
}

/**
 * Expands a `author` element.
 *
author:
- text

 * Decision: Expand the containing text as needed, show orig on hover.
 *
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
function displayAuthor(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "author");
  const abbreviated = XmlNode.getSoleText(root);
  if (abbreviated === "id.") {
    // TODO: Support this properly.
    return attachHoverText("id.", "idem (same as above)");
  }
  if (abbreviated === "ib.") {
    // TODO: Support this properly.
    return attachHoverText("ib.", "ibidem (in the same place)");
  }
  return attachHoverText(
    abbreviated,
    LsAuthorAbbreviations.authors().get(abbreviated)!
  );
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
function displayXr(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "xr");
  throw new Error("Not yet implemented.");
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
function displayRef(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "ref");
  throw new Error("Not yet implemented.");
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
function displayUsg(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "usg");
  throw new Error("Not yet implemented.");
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
function displayTrans(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "trans");
  return attachHoverText(defaultDisplay(root, ["tr"]), "translation");
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
function displayTr(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "tr");
  return XmlNode.getSoleText(root);
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
function displayEtym(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "etym");
  return defaultDisplay(root);
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
function displayPos(root: XmlNode, _parent?: XmlNode): string {
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
function displayOrth(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "orth");
  return XmlNode.getSoleText(root);
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
function displayItype(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "itype");
  return XmlNode.getSoleText(root);
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
function displayGen(root: XmlNode, _parent?: XmlNode): string {
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
function displayLbl(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "lbl");
  assert(parent !== undefined, "<lbl> should have a parent.");
  return substituteAbbreviation(
    XmlNode.getSoleText(root),
    LBL_ABBREVIATIONS.get(parent.name)!
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
  return substituteAbbreviation(XmlNode.getSoleText(root), CASE_ABBREVIATIONS);
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
function displayMood(root: XmlNode, _parent?: XmlNode): string {
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
function displayNumber(root: XmlNode, _parent?: XmlNode): string {
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
function displayQ(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "q");
  return `$‘${XmlNode.getSoleText(root)}’`;
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
  const sic = XmlNode.assertIsNode(root.children[0], "sic");
  const corr = XmlNode.assertIsNode(root.children[1], "corr");
  return attachHoverText(
    XmlNode.getSoleText(corr),
    `Corrected from original: ${XmlNode.getSoleText(sic)}`
  );
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
 * @param root The root node for this element.
 * @param _parent The parent node for the root.
 */
export function displayEntryFree(root: XmlNode, _parent?: XmlNode): string {
  assert(root.name === "entryFree");
  throw new Error("Not yet implemented.");
}
