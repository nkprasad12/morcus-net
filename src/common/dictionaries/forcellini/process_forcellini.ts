import { assert } from "@/common/assert";
import type { EntryOutline } from "@/common/dictionaries/dict_result";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";

import fs from "fs";

interface RawForcelliniEntry {
  key: string;
  displayName: string;
}

function getRawForcelliniEntries(inputFilePath?: string): RawForcelliniEntry[] {
  const rawFile = inputFilePath ?? envVar("FORC_RAW_PATH");
  const content = fs.readFileSync(rawFile).toString();
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split("=>");
      assert(
        parts.length === 2,
        `Invalid line in Forcellini raw file: ${line}`
      );
      return {
        key: parts[0].trim(),
        displayName: parts[1].trim(),
      };
    });
}

function getId(rawKey: string, dupeCounts: Map<string, number>): string {
  const key = rawKey
    .toLowerCase()
    .trim()
    .replaceAll(/\[\d+\]/g, "")
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[()]/g, "");
  const count = dupeCounts.get(key) ?? 0;
  dupeCounts.set(key, count + 1);
  return `forc_${key}_${count}`;
}

function resolveKey(rawKey: string): string {
  // Extract the main word, ignoring [2] or (ab, abs)
  return rawKey
    .toLowerCase()
    .trim()
    .split(" ")[0]
    .replaceAll(/[^a-z]/g, "");
}

function urlKey(rawKey: string): string {
  // Strip trailing parentheticals like " (a ab abs)" or unclosed ones like " (sepia, sepicula"
  // and homograph markers like " [2]"
  return rawKey
    .trim()
    .replace(/\s*\([^)]*\)?\s*$/, "")
    .replace(/\s*\[\d+\]\s*$/, "")
    .trim();
}

function processRawEntry(
  raw: RawForcelliniEntry,
  dupeCounts: Map<string, number>
): RawDictEntry {
  const id = getId(raw.key, dupeCounts);
  const keys = [resolveKey(raw.key)];

  const outline: EntryOutline = {
    mainKey: keys[0],
    mainLabel: raw.displayName,
    mainSection: {
      text: raw.displayName,
      level: 0,
      ordinal: "0",
      sectionId: id,
    },
  };

  const url = `http://lexica.linguax.com/forc2.php?searchedLG=${encodeURIComponent(
    urlKey(raw.key)
  )}`;
  const root = new XmlNode(
    "div",
    [["id", id]],
    [
      new XmlNode("span", [], [raw.displayName]),
      " ",
      new XmlNode(
        "a",
        [
          ["class", "forcNewTab"],
          ["href", url],
          ["target", "_blank"],
        ],
        [raw.key]
      ),
    ]
  );

  const entry = JSON.stringify({
    entry: XmlNodeSerialization.DEFAULT.serialize(root),
    outline,
  });

  return { keys, id, entry };
}

export function processForcellini() {
  const rawEntries = getRawForcelliniEntries();
  const processedEntries: RawDictEntry[] = [];
  const dupeCounts = new Map<string, number>();

  const seen = new Set<string>();

  for (let i = 0; i < rawEntries.length; i++) {
    if (i % 5000 === 0) {
      console.debug(`[Forcellini] Processed ${i} of ${rawEntries.length}`);
    }
    const raw = rawEntries[i];
    const dedupeKey = `${urlKey(raw.key)}|${raw.displayName}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    processedEntries.push(processRawEntry(raw, dupeCounts));
  }

  SqliteDict.save(processedEntries, envVar("FORC_PROCESSED_PATH"));
}
