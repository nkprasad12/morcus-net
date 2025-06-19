import { assert } from "@/common/assert";
import type { EntryOutline } from "@/common/dictionaries/dict_result";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "@/common/xml/xml_utils";

import fs from "fs";

interface RawGesnerEntry {
  keys: string[];
  content: string;
}

function getRawGesnerEntries(inputFilePath?: string): RawGesnerEntry[] {
  const rawFile = inputFilePath ?? envVar("GESNER_RAW_PATH");
  return JSON.parse(fs.readFileSync(rawFile).toString());
}

function getId(rawKey: string, dupeCounts: Map<string, number>): string {
  const key = rawKey
    .toLowerCase()
    .trim()
    .replaceAll(/\[\]/g, "")
    .replaceAll(" ", "_");
  const count = dupeCounts.get(key) ?? 0;
  dupeCounts.set(key, count + 1);
  return `gesner_${key}_${count}`;
}

function resolveKey(rawKey: string): string {
  const candidate = rawKey
    .toLowerCase()
    .trim()
    .replaceAll(/\[\d+\]$/g, "");
  assert(/[a-z_]+/.test(candidate), `Invalid key: ${rawKey}`);
  return candidate;
}

function processRawEntry(
  root: XmlNode,
  dupeCounts: Map<string, number>
): RawDictEntry {
  assert(root.name === "def");
  const keyNode = XmlNode.assertIsNode(root.children[0]);
  assert(keyNode.name === "emph");
  const rawKey = XmlNode.getSoleText(keyNode);
  const id = getId(rawKey, dupeCounts);
  const keys = [resolveKey(rawKey)];
  const outline: EntryOutline = {
    mainKey: keys[0],
    mainSection: {
      text: "",
      level: 0,
      ordinal: "0",
      sectionId: id,
    },
  };
  const entry = JSON.stringify({
    entry: XmlNodeSerialization.DEFAULT.serialize(root),
    outline,
  });
  return { keys, id, entry };
}

export function processGesner() {
  const rawEntries = getRawGesnerEntries();
  const processedEntries: RawDictEntry[] = [];
  const dupeCounts = new Map<string, number>();
  for (let i = 0; i < rawEntries.length; i++) {
    if (i % 5000 === 0) {
      console.debug(`[Gesner] Processed ${i} of ${rawEntries.length}`);
    }
    const content = parseXmlStrings([rawEntries[i].content])[0];
    processedEntries.push(processRawEntry(content, dupeCounts));
  }
  SqliteDict.save(processedEntries, envVar("GESNER_PROCESSED_PATH"));
}
