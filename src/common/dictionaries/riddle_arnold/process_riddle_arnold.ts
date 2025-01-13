import fs from "fs";

import { envVar } from "@/common/env_vars";
import { assert, assertEqual } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import type { EntryOutline } from "@/common/dictionaries/dict_result";

function formatEntry(id: string, parts: string[], header: string): XmlNode {
  const headerParts = header
    .split(",")
    .map((word) => new XmlNode("span", [["class", "lsOrth"]], [word.trim()]));
  const formattedHeader = new XmlNode(
    "div",
    [],
    [
      new XmlNode(
        "span",
        [
          ["class", "lsSenseBullet"],
          ["senseid", `${id}.blurb`],
        ],
        ["  •  "]
      ),
      " ",
      // Put commas between each element.
      ...headerParts.flatMap((orth) => [orth, ", "]).slice(0, -1),
    ]
  );
  const formattedParts =
    parts.length === 1
      ? [new XmlNode("div", [], [parts[0]])]
      : parts.map(
          (part, i) =>
            new XmlNode(
              "div",
              [],
              [
                new XmlNode(
                  "span",
                  [
                    ["class", "lsSenseBullet"],
                    ["senseid", `${id}.${i + 1}`],
                  ],
                  [` ${i + 1}. `]
                ),
                " ",
                part,
              ]
            )
        );
  return new XmlNode("div", [["id", id]], [formattedHeader, ...formattedParts]);
}

export function processRiddleArnold() {
  const contents = fs.readFileSync(envVar("RA_PATH"));
  const lines = contents.toString().split("\n");
  const consolidated = arrayMap<string, string>();
  for (const line of lines) {
    const parts = line.split("\t");
    assertEqual(parts.length, 2, line);
    const [header, entry] = parts;
    assertEqual(header.toUpperCase(), header);
    consolidated.add(header.replaceAll("’", "'"), entry);
  }
  const allEntries: RawDictEntry[] = [];
  const usedIds = new Set<string>();
  for (const [header, entries] of consolidated.map.entries()) {
    const keys = header.split(",").map((k) => k.trim().toLowerCase());
    const id = `ra_${keys.join("_").replaceAll(" ", "_").replaceAll("'", "")}`;
    assert(!usedIds.has(id), id);
    usedIds.add(id);
    const entry = formatEntry(id, entries, header);
    const serializedEntry = XmlNodeSerialization.DEFAULT.serialize(entry);
    const outline: EntryOutline = {
      mainKey: keys[0],
      mainSection: { text: header, level: 0, ordinal: "0", sectionId: id },
    };
    const fullEntry = {
      entry: serializedEntry,
      outline,
    };
    allEntries.push({
      keys,
      id,
      entry: JSON.stringify(fullEntry),
    });
  }
  SqliteDict.save(allEntries, envVar("RA_PROCESSED_PATH"));
}
