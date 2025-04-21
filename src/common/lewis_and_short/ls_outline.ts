import { COMMENT_NODE, XmlChild, XmlNode } from "@/common/xml/xml_node";
import { assert, checkPresent } from "@/common/assert";
import { displayTextForOrth } from "@/common/lewis_and_short/ls_orths";
import {
  EntryOutline,
  OutlineSection,
} from "@/common/dictionaries/dict_result";

export interface ExtractOutlineOptions {
  senseNameAttr?: string;
}

export function extractOutline(
  rootNode: XmlNode,
  options?: ExtractOutlineOptions
): EntryOutline {
  assert(rootNode.name === "entryFree");
  const nAttr = options?.senseNameAttr ?? "n";
  // TODO: Pass a sanitized tree in to reduce duplication.
  const root = sanitizeTree(rootNode);
  const senses = root.findChildren("sense");
  const level1Isenses = senses
    .map((sense, i): [XmlNode, number] => [sense, i])
    .filter(
      ([sense, _i]) =>
        sense.getAttr("level") === "1" && sense.getAttr(nAttr) === "I"
    );

  const mergeFirstSense =
    level1Isenses.length > 1 ||
    (senses.length === 1 && level1Isenses.length === 1);
  if (mergeFirstSense) {
    senses.splice(level1Isenses[0][1], 1);
  }

  const entryId = checkPresent(rootNode.getAttr("id"), "Root must have an id.");
  const mainBlurb =
    getContainedText(rootNode, 80, (nextNode) => {
      // We only want to break on senses.
      if (nextNode.name !== "sense") {
        return false;
      }
      // If there is no sense to be merged into the main, stop.
      if (!mergeFirstSense) {
        return true;
      }
      // Consume the first level 1I sense, and stop otherwise.
      return nextNode !== level1Isenses[0][0];
    }) + (mergeFirstSense ? "; " + getContainedText(level1Isenses[0][0]) : "");
  const mainSection: OutlineSection = {
    text: mainBlurb,
    level: 0,
    ordinal: "",
    sectionId: entryId,
  };
  const senseBlurbs: OutlineSection[] = senses.map((sense) => {
    const senseId = checkPresent(sense.getAttr("id"), "Sense must have an id.");
    return {
      text: getSenseBlurb(sense),
      level: +checkPresent(sense.getAttr("level"), "Sense must have a level"),
      ordinal: checkPresent(sense.getAttr(nAttr), "Sense must have an n") + ".",
      sectionId: senseId,
    };
  });
  const orths = root.findChildren("orth");
  return {
    mainSection: mainSection,
    mainKey: displayTextForOrth(XmlNode.getSoleText(orths[0])),
    senses: senseBlurbs,
  };
}

export function sanitizeTree(root: XmlNode): XmlNode {
  const children: (XmlNode | string)[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      children.push(child);
    } else if (child.name === "reg") {
      assert(child.children.length === 2);
      XmlNode.assertIsNode(child.children[0], "sic");
      const corr = XmlNode.assertIsNode(child.children[1], "corr");
      children.push(XmlNode.getSoleText(corr));
      console.debug(`Corrected ${child} -> ${XmlNode.getSoleText(corr)}`);
    } else if (child.name === COMMENT_NODE) {
      // Intentional no-op. We want to just ignore comments.
    } else {
      children.push(sanitizeTree(child));
    }
  }
  return new XmlNode(root.name, root.attrs, children);
}

function getSenseBlurb(senseNode: XmlNode): string {
  // This getContainedText call should probably break on authors or citations or whatever.
  const text = getContainedText(senseNode);
  // TODO: This could potentially remove lot of characters, we
  // should consider updating the logic to keep 35 characters always so
  // we display something.
  const bracketFree = removeBracketedText(text);
  return bracketFree.split(":")[0];
}

function removeBracketedText(input: string): string {
  let result: string = "";
  const openQueue: string[] = [];
  for (const c of input) {
    if (c === "(") {
      openQueue.push(")");
    } else if (c === "[") {
      openQueue.push("]");
    } else if (openQueue[0] === c) {
      openQueue.pop();
    } else if (openQueue.length === 0) {
      result += c;
    }
  }
  return result;
}

// TODO: This will add the `...` overflow markers
// even if there is no more text (i.e the last word causes the overflow)
function getContainedText(
  root: XmlNode,
  charsRequested: number = 35,
  stopCheck: (node: XmlNode) => boolean = (n) => false
): string {
  const queue: XmlChild[] = [root];
  let result = "";
  while (queue.length > 0) {
    const top = queue.pop()!;
    if (typeof top === "string") {
      result += top;
      if (result.length > charsRequested) {
        return result + " ...";
      }
      continue;
    }
    if (top.name === "etym") {
      continue;
    }
    if (stopCheck(top)) {
      return result;
    }
    for (let i = 0; i < top.children.length; i++) {
      let child = top.children[top.children.length - i - 1];
      if (typeof child === "string" && top.name === "orth") {
        child = displayTextForOrth(child);
      }
      queue.push(child);
    }
  }
  return result;
}
