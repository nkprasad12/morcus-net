import { assert, assertEqual, checkPresent } from "@/common/assert";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { extractOutline } from "@/common/lewis_and_short/ls_outline";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseXmlStrings } from "@/common/xml/xml_utils";

import fs from "fs";

function processRawEntry(root: XmlNode): RawDictEntry {
  const id = `georges${checkPresent(root.getAttr("id"))}`;
  const keys = root.findChildren("orth").map(XmlNode.getSoleText);
  return {
    id,
    keys,
    entry: JSON.stringify({
      entry: XmlNodeSerialization.DEFAULT.serialize(root),
      outline: extractOutline(root, { senseNameAttr: "marker" }),
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
      console.log(`[Georges] Processed ${i} of ${rawEntries.length}`);
    }
    const entry = rawEntries[i];
    const processed = processRawEntry(entry);
    assert(!ids.has(processed.id), `Duplicate id: ${processed.id}`);
    ids.add(processed.id);
    processedEntries.push(processed);
  }
  SqliteDict.save(processedEntries, envVar("GEORGES_PROCESSED_PATH"));
}
