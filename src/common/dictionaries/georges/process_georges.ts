import { assert, assertEqual, checkPresent } from "@/common/assert";
import type {
  EntryOutline,
  OutlineSection,
} from "@/common/dictionaries/dict_result";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "@/common/xml/xml_utils";

import fs from "fs";

const NAME_FOR_REND = new Map<string, string>([
  ["bold", "b"],
  ["italic", "i"],
  ["spaced", "span"],
  ["superscript", "sup"],
]);

function formatForDisplay(
  root: XmlNode,
  parentId: string,
  outlineSenses: OutlineSection[]
): XmlNode {
  const extras: XmlNode[] = [];
  let name = "span";
  const attrs: [string, string][] = [];
  let newId = parentId;

  if (root.name === "entryFree") {
    name = "div";
    attrs.push(["id", parentId]);
  }
  if (root.name === "br") {
    name = "br";
  }
  if (root.name === "hi") {
    const rend = checkPresent(root.getAttr("rend"));
    name = checkPresent(NAME_FOR_REND.get(rend), rend);
  }
  if (root.name === "foreign") {
    name = "i";
  }
  if (root.name === "abbr") {
    const text = XmlNode.getSoleText(root);
    if (text.replaceAll(".", "").length > 1) {
      attrs.push(["class", "lsHover"]);
      attrs.push(["title", checkPresent(root.getAttr("title"))]);
    }
  }
  if (root.name === "def") {
    name = "div";
  }
  if (root.name === "orth") {
    attrs.push(["class", "lsOrth"]);
  }
  if (root.name === "sense") {
    name = "div";
    const marker = checkPresent(root.getAttr("marker"))
      .trim()
      .replaceAll(")", ".");
    newId = `${parentId}.${marker}`;
    const bullet = new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", newId],
      ],
      [` ${marker} `]
    );
    attrs.push(["id", newId]);
    const level = checkPresent(safeParseInt(root.getAttr("level")));
    attrs.push(["indentLevel", `${level - 1}`]);
    extras.push(bullet);
    outlineSenses.push({
      text: getContainedText(root),
      level,
      sectionId: newId,
      ordinal: marker,
    });
  }
  const children = root.children.map((c) =>
    typeof c === "string" ? c : formatForDisplay(c, newId, outlineSenses)
  );
  return new XmlNode(name, attrs, [...extras, ...children]);
}

function getContainedText(root: XmlNode, charsRequested: number = 20): string {
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
    if (top.name === "sense" && top !== root) {
      return result;
    }
    for (let i = 0; i < top.children.length; i++) {
      queue.push(top.children[top.children.length - i - 1]);
    }
  }
  return result;
}

function processRawEntry(root: XmlNode): RawDictEntry {
  const id = `grg${checkPresent(root.getAttr("id"))}`;
  const keys: string[] = [];
  const defs: XmlNode[] = [];
  for (let i = 0; i < root.children.length; i++) {
    const child = root.children[i];
    if (typeof child === "string") {
      assertEqual(child.trim(), "");
      continue;
    }
    if (child.name === "def") {
      defs.push(child);
      continue;
    }
    assertEqual(child.name, "orth");
    keys.push(XmlNode.getSoleText(child));
  }

  // Then, we should build up a tree of senses.
  // We can have multiple top level senses!
  assert(defs.length > 0, "No definitions found");
  const processedRoot = new XmlNode("entryFree", [["id", id]], defs);
  const outlineSenses: OutlineSection[] = [];
  const formattedEntry = formatForDisplay(processedRoot, id, outlineSenses);
  const outline: EntryOutline = {
    mainKey: keys[0],
    mainSection: { text: "", level: 0, ordinal: "0", sectionId: id },
    senses: outlineSenses,
  };
  return {
    id,
    keys,
    entry: JSON.stringify({
      entry: XmlNodeSerialization.DEFAULT.serialize(formattedEntry),
      outline,
    }),
  };
}

function getRawEntries(): XmlNode[] {
  const contents = fs.readFileSync(envVar("GEORGES_RAW_PATH"));
  const root = parseXmlStrings([contents.toString()])[0];
  const body = root.findDescendants("body");
  assertEqual(body.length, 1, "Expected exactly one body");
  return body[0].findChildren("entryFree");
}

export function processGeorges() {
  const rawEntries = getRawEntries();
  const processedEntries: RawDictEntry[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < rawEntries.length; i++) {
    if (i % 5000 === 0) {
      console.debug(`[Georges] Processed ${i} of ${rawEntries.length}`);
    }
    const entry = rawEntries[i];
    const processed = processRawEntry(entry);
    assert(!ids.has(processed.id), `Duplicate id: ${processed.id}`);
    ids.add(processed.id);
    processedEntries.push(processed);
  }
  SqliteDict.save(processedEntries, envVar("GEORGES_PROCESSED_PATH"));
}
