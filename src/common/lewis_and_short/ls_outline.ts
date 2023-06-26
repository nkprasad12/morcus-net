import { LsOutline, SectionOutline } from "@/web/utils/rpc/ls_api_result";
import { COMMENT_NODE, XmlNode } from "./xml_node";
import { assert, checkPresent } from "../assert";

const GREEK_BULLET_MAP = new Map<string, string>([
  ["a", "α"],
  ["b", "β"],
  ["g", "γ"],
  ["d", "δ"],
  ["e", "ε"],
  ["z", "ζ"],
]);

export function getBullet(input: string): string {
  if (input[0] !== "(") {
    return input;
  }
  const result = GREEK_BULLET_MAP.get(input[1]);
  if (result === undefined) {
    return input;
  }
  return result;
}

export function extractOutline(rootNode: XmlNode): LsOutline {
  assert(rootNode.name === "entryFree");
  // TODO: Pass a sanitized tree in to reduce duplication.
  const root = sanitizeTree(rootNode);
  const senses = root.findChildren("sense");
  const level1Isenses = senses
    .map((sense, i): [XmlNode, number] => [sense, i])
    .filter(
      ([sense, _i]) =>
        sense.getAttr("level") === "1" && sense.getAttr("n") === "I"
    );

  if (level1Isenses.length > 0) {
    senses.splice(level1Isenses[0][1], 1);
  }

  const entryId = checkPresent(rootNode.getAttr("id"), "Root must have an id.");
  const mainSection: SectionOutline = {
    text: `MainBlurb[${entryId}]`,
    level: 0,
    ordinal: "",
    sectionId: entryId,
  };
  const senseBlurbs: SectionOutline[] = senses.map((sense) => {
    const senseId = checkPresent(sense.getAttr("id"), "Sense must have an id.");
    return {
      text: `SenseBlurb[${senseId}]`,
      level: +checkPresent(sense.getAttr("level"), "Sense must have a level"),
      ordinal: checkPresent(sense.getAttr("n"), "Sense must have an n"),
      sectionId: senseId,
    };
  });
  return { mainSection: mainSection, senses: senseBlurbs };
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
