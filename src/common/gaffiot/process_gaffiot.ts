import { assert, assertEqual, assertType } from "@/common/assert";
import type {
  EntryResult,
  OutlineSection,
} from "@/common/dictionaries/dict_result";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import {
  encodeMessage,
  isArray,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";
import { readFileSync } from "fs";

const OUTLINE_SKIPS = new Set<string>(["aut", "oeuv", "refch", "cl"]);
const SENSE_NODE_NAMES = ["Rub", "rub", "pp", "qq", "qqng"];
const BLURB_LABEL = " • ";

const REGULAR_TAGS = new Set([
  "entree", // Contains an entry, with diacritics.
  "gen", // Gender
  "aut", // Author
  "oeuv", // Seems to be the work
  "refch", // Reference book, line, etc... in a work.
  "lat", // Seems to be a link to another word in the dictionary
  "es", // Variant spellings
  "latv", // Latin word cited in reference; see
  "grec", // Greek word
  "rub", // Section, I, II, etc... rub > pp > qq/qqng
  "pp", // Section, 1, 2, 3, etc... rub > pp > qq/qqng
  "qq", // Section, a), b), c), etc... rub > pp > qq/qqng
  "cl", // Direct citation from latin work
  "latc", // Latin word cited in reference; as
  "pca", // seems to be when ancient authors quote or commentate others? "composition in small capitals"
  "ital", // Italics
  "pc", // author or character cited in another work
  "des", // The inflection paradigm.
  "comm", // Seems to be a comment.
  "etyml", // Etymology
  "up", // Superscript
  "autz", // Referring to some ref work
  "el", // secondary entry composed in italics in the Gaffiot.
  "autp", // non-antique author
  "refchp", // reference corresponding to a non-antique author
  "Rub", // see `rub`
  "etymgr", // Greek etymology
  "romain", // Seems to be inserted commentary in Latin text?
  "hbox",
  "gras", // bold
  "overline", // Has a line over
  "desv", // Inflection variant (c.f. \\des), e.g. abl. pl. \desv{-tabus}.
  "latdim", // diminuitive of Latin word
  "latp", // Participle of Latin word
  "latgen", // genitive of Latin word
  "freq", // frequentative of latin word
  "latpl", // plural of latin word
  "latpf", // perfect of Latin word
  "italp", // composition in italics for opening parenthesis
  "smash", // Only happens once, can ignore?
  "qqng", // qq non-gras (not bold)
]);

// The below do not have `{` following
const BRACKETLESS_WITH_UNIT = new Set([
  "kern",
  "raise",
  "hskip", // Only happens twice, can convert to a space.
]);
const BRACKETLESS_TAGS: string[] = [
  ...BRACKETLESS_WITH_UNIT,
  "par",
  "F", // Arrow
  "string",
  "dixpc",
  "times",
  "arabe",
  "%", // A literal percent sign
  "thinspace", // replace this and a mandatory following space with a period
  "S",
  "douzerm", // Only happens once, we can maybe ignore
  "break", // small break, maybe can be a space or two. Can have text immediately after.
  "neufrm", // Note: this is after, not before, brackets. can ignore
  ",",
  "goodbreak", // Ignore
  "dixrmchif", // Note: after, not before {. Just render text
  "nobreak", // ignore
  "penalty5000", // ignore
  "hfil", // Just ignore.
  "unskip", // Just ignore
];

interface GaffiotEntry {
  article: string;
  images?: string[];
}

const isGaffiotEntry = matchesObject<GaffiotEntry>({
  article: isString,
  images: maybeUndefined(isArray(isString)),
});

function loadGaffiotDict(): Record<string, Record<string, string>> {
  const filePath = envVar("GAFFIOT_RAW_PATH");
  const data = readFileSync(filePath).toString();
  const start = data.indexOf("{");
  return JSON.parse(data.substring(start));
}

function findClosingBracket(input: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < input.length; i++) {
    if (input[i] === "{") depth++;
    if (input[i] === "}") depth--;
    if (depth === 0) return i;
  }
  throw new Error("Unmatched bracket in input string");
}

function cleanText(entryText: string): string {
  // Does three things:
  // - Removes XML-like comments
  // - Removes $ characters
  // - Replaces ~ with a space
  return entryText
    .replace(/(<[^>]*>)|\$/g, "")
    .replaceAll("~", " ")
    .replaceAll("ÿ", "ў")
    .replaceAll("Ÿ", "Y̆");
  // From gaffiot.fr, but we haven't seen these yet.
  // .replace(/Ȟ/g, "ن")
  // .replace(/ȟ/g, "Y")
  // .replace(/Ƞ/g, "˘");
}

export function texToXml(input: string): XmlChild[] {
  const stack: XmlChild[] = [];
  let currentText = "";

  const flushText = () => {
    if (currentText) {
      stack.push(cleanText(currentText));
      currentText = "";
    }
  };

  for (let i = 0; i < input.length; i++) {
    // Handle the case of nameless brackets.
    if (input[i] === "{") {
      flushText();
      const close = findClosingBracket(input, i);
      const content = input.slice(i + 1, close);
      const children = texToXml(content);
      // Omit empty brackets.
      if (children.length > 0) {
        stack.push(new XmlNode("nameless", [], children));
      }
      i = close;
      continue;
    }
    // If we don't have a backslash, just add to the current text.
    if (input[i] !== "\\" || input[i + 1] === undefined) {
      currentText += input[i];
      continue;
    }
    flushText();
    const end = input.indexOf("{", i);
    const maybeTag = input.slice(i + 1, end);
    if (end !== -1 && REGULAR_TAGS.has(maybeTag)) {
      const close = findClosingBracket(input, end);
      const content = input.slice(end + 1, close);
      // Ignore comments.
      if (maybeTag !== "comm") {
        stack.push(new XmlNode(maybeTag, [], texToXml(content)));
      }
      i = close;
      continue;
    }
    let foundMatch = false;
    for (const tag of BRACKETLESS_TAGS) {
      if (input.startsWith(tag, i + 1)) {
        let extra = "";
        const attrs: [string, string][] = [];
        if (BRACKETLESS_WITH_UNIT.has(tag)) {
          const match = input
            .substring(i + tag.length + 1)
            .match(/^-?(\d\.\d+em)/);
          if (!match) {
            throw new Error(`Expected unit after ${tag}: ${input.slice(i)}`);
          }
          extra = match[0];
          attrs.push(["unit", match[1]]);
        }
        stack.push(new XmlNode(tag, attrs, []));
        i += tag.length + extra.length;
        foundMatch = true;
        break;
      }
    }
    assert(foundMatch);
  }
  flushText();
  return stack;
}

export function assertAllSenseNodesTopLevel(children: XmlChild[]): void {
  function checkDescendants(node: XmlChild, level: number = 0): void {
    if (typeof node === "string") {
      return;
    }
    const isSenseNode = SENSE_NODE_NAMES.includes(node.name);
    assert(!isSenseNode || level === 0);
    node.children.forEach((child) => checkDescendants(child, level + 1));
  }
  children.forEach((child) => checkDescendants(child));
}

interface SenseTreeNode {
  label: string;
  level: number;
  content: XmlChild[];
  children: SenseTreeNode[];
}

function buildSenseTreeHelper(
  data: XmlChild[],
  i: number,
  parentLevel?: number
): [SenseTreeNode, number] {
  const current = XmlNode.assertIsNode(data[i]);

  const label = XmlNode.getSoleText(current).trim();
  assert(label.length > 0);

  const level = SENSE_NODE_NAMES.indexOf(current.name);
  assert(level !== -1);
  assert(parentLevel === undefined || level > parentLevel);

  // Collect the content for this node.
  const content: XmlChild[] = [];
  let k = i + 1;
  for (; k < data.length; k++) {
    const xmlChild = data[k];
    if (typeof xmlChild === "string") {
      content.push(xmlChild);
      continue;
    }
    const childLevel = SENSE_NODE_NAMES.indexOf(xmlChild.name);
    if (childLevel === -1) {
      content.push(xmlChild);
      continue;
    }
    break;
  }

  // Anything else is a sense.
  const children: SenseTreeNode[] = [];
  while (k < data.length) {
    const nextChild = XmlNode.assertIsNode(data[k]);
    const nextLevel = SENSE_NODE_NAMES.indexOf(nextChild.name);
    assert(nextLevel !== -1);
    if (nextLevel <= level) {
      break;
    }
    const [childSense, nextK] = buildSenseTreeHelper(data, k, level);
    children.push(childSense);
    k = nextK;
  }
  assert(k > i);
  return [{ label, level, content, children }, k];
}

/** Exported for unit testing only. Do not use. */
export function buildSenseTree(nodes: XmlChild[]): SenseTreeNode[] {
  let i = 0;
  const blurbChildren: XmlChild[] = [];
  for (; i < nodes.length; i++) {
    const node = nodes[i];
    if (typeof node !== "string" && SENSE_NODE_NAMES.includes(node.name)) {
      break;
    }
    blurbChildren.push(node);
  }
  const blurb = {
    label: BLURB_LABEL,
    level: -2,
    content: blurbChildren,
    children: [],
  };
  const senses: SenseTreeNode[] = [blurb];
  while (i < nodes.length) {
    const [sense, nextI] = buildSenseTreeHelper(nodes, i);
    senses.push(sense);
    i = nextI;
  }
  assert(i >= nodes.length);
  validateSenseTree(senses);
  return senses;
}

function validateSenseTree(
  senses: SenseTreeNode[],
  topLevel: boolean = true,
  parentLevel: number = -1
): void {
  const sensesToCheck = topLevel
    ? senses.filter((s) => s.level !== -2)
    : senses;
  if (sensesToCheck.length === 0) {
    return;
  }

  const minLevel = Math.min(...sensesToCheck.map((s) => s.level));
  const maxLevel = Math.max(...sensesToCheck.map((s) => s.level));
  assertEqual(minLevel, maxLevel);
  assert(minLevel > parentLevel);
  for (const sense of senses) {
    validateSenseTree(sense.children, false, minLevel);
  }
}

function processSenseTree(senseTree: SenseTreeNode, parentId: string): XmlNode {
  const id =
    parentId + (senseTree.label === BLURB_LABEL ? "blurb" : senseTree.label);
  const content = processEntryXml(senseTree.content);
  const children = senseTree.children.map(
    (child) => new XmlNode("li", [], [processSenseTree(child, id)])
  );

  const dot = /[\dIVX]$/.test(senseTree.label) ? "." : "";
  const senseHead = new XmlNode(
    "span",
    [
      ["class", "lsSenseBullet"],
      ["senseid", id],
    ],
    [` ${senseTree.label}${dot} `]
  );

  return new XmlNode(
    "div",
    [],
    [
      new XmlNode("span", [["id", id]], [senseHead, " ", ...content]),
      children.length > 0 ? new XmlNode("ol", [], children) : "",
    ]
  );
}

function processEntryXml(children: XmlChild[]): XmlChild[] {
  const results: XmlChild[] = [];
  for (const child of children) {
    if (typeof child === "string") {
      results.push(child);
      continue;
    }
    assert(
      BRACKETLESS_TAGS.includes(child.name) ||
        REGULAR_TAGS.has(child.name) ||
        child.name === "nameless",
      child.name
    );
    let name = "span";
    const attrs: [string, string][] = [];
    if (child.name === "entree") {
      attrs.push(["class", "lsOrth"]);
    }
    if (child.name === "aut") {
      attrs.push(["class", "gafAuth"]);
    }
    if (child.name === "cl") {
      attrs.push(["class", "lsQuote"]);
    }
    if (child.name === "oeuv" || child.name === "refch") {
      attrs.push(["class", "lsBibl"]);
    }
    if (child.name === "S") {
      assertEqual(child.children.length, 0);
      results.push("§");
      continue;
    }
    if (child.name === "F") {
      assertEqual(child.children.length, 0);
      results.push("➳");
      continue;
    }
    if (child.name === "gras") {
      name = "b";
    }
    if (child.name === "ital") {
      name = "i";
    }

    results.push(new XmlNode(name, attrs, processEntryXml(child.children)));
  }
  return results;
}

function getOutlineText(data: XmlChild[], numWords: number = 12): string {
  const stack = data.slice().reverse();
  const words: string[] = [];
  while (stack.length > 0 && words.length < numWords) {
    const node = stack.pop()!;
    if (typeof node !== "string") {
      if (!OUTLINE_SKIPS.has(node.name)) {
        stack.push(...node.children.slice().reverse());
      }
      continue;
    }
    const parts = node.split(" ");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part.length === 0) {
        continue;
      }
      words.push(part);
      if (words.length >= numWords) {
        if (i < parts.length - 1 || stack.length > 0) {
          words.push("...");
        }
        return words.join(" ");
      }
    }
  }
  return words.join(" ");
}

function makeOutline(
  senses: SenseTreeNode[],
  key: string,
  id: string
): EntryResult["outline"] {
  const senseSections: OutlineSection[] = [];
  type StackItem = [SenseTreeNode, string];
  const stack: StackItem[] = senses
    .slice()
    .reverse()
    .map((s) => [s, `${id}.`]);
  while (stack.length > 0) {
    const [sense, idPrefix] = stack.pop()!;
    if (sense.label === BLURB_LABEL) {
      continue;
    }
    const senseId = idPrefix + sense.label;
    const senseSection: OutlineSection = {
      text: getOutlineText(sense.content),
      level: sense.level,
      ordinal: sense.label,
      sectionId: senseId,
    };
    senseSections.push(senseSection);
    for (const child of sense.children.slice().reverse()) {
      stack.push([child, `${senseId}`]);
    }
  }
  assertEqual(senses[0].label, BLURB_LABEL);
  const mainSection: OutlineSection = {
    text: getOutlineText(senses[0].content),
    level: 0,
    ordinal: "",
    sectionId: id,
  };
  return { mainKey: key, mainSection, senses: senseSections };
}

function findEntryKey(root: XmlNode): string {
  const entrees = root.findDescendants("entree");
  assert(entrees.length === 1);
  const text = XmlNode.getSoleText(entrees[0]).trim();
  return text.replace(/\s*[,!]\s*$/, "").replace(/^\s*\d\s*/, "");
}

export function processGaffiot(): RawDictEntry[] {
  const gaffiot = loadGaffiotDict();
  const entries: RawDictEntry[] = [];
  const ids = new Set<string>();
  // Guide:
  // - Initial number indicates that there are two words with the
  //   same spelling but different meanings.
  // - ? indicates that the word may have some doubt.
  // - ' and ! indicate an abbreviation or an exclamation.
  // const KEY_PATTERN = /^(\d )?(\? )?\w[\w -]*['!]?$/;
  let i = 0;
  for (const entryName in gaffiot) {
    i++;
    if (i % 10000 === 0) {
      console.debug(`[Gaffiot] ${i} / ${Object.keys(gaffiot).length}`);
    }
    const id = "gaf-" + entryName.replaceAll(/[\s'?!*()]/g, "");
    assert(/^[A-Za-z\d-]+$/.test(id), id);
    assert(!ids.has(id), `Duplicate id: ${id}`);
    ids.add(id);

    const entryText = assertType(gaffiot[entryName], isGaffiotEntry).article;
    const rawXml = new XmlNode("div", [], texToXml(entryText));
    const headword = findEntryKey(rawXml);
    assertAllSenseNodesTopLevel(rawXml.children);
    const senses = buildSenseTree(rawXml.children);
    const xmlContent = senses.map((sense) => processSenseTree(sense, `${id}.`));
    const entry = new XmlNode("div", [["id", id]], xmlContent);

    entries.push({
      id,
      keys: [
        headword
          .replace(/Æ/g, "AE")
          .replace(/æ/g, "ae")
          .replace(/Œ/g, "OE")
          .replace(/œ/g, "oe"),
      ],
      entry: encodeMessage(
        { entry, outline: makeOutline(senses, headword, id) },
        [XmlNodeSerialization.DEFAULT]
      ),
    });
  }
  return entries;
}
