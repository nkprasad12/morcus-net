import { assert } from "@/common/assert";
import type { EntryOutline } from "@/common/dictionaries/dict_result";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";

import fs from "fs";

function getRawEntries(): string[][] {
  const lines = fs.readFileSync(envVar("POZO_RAW_PATH")).toString().split("\n");
  const rawEntries: string[][] = [];
  let parseState: "firstLine" | "content" | "header" = "content";
  let currentEntry: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (currentEntry.length > 0) {
        rawEntries.push(currentEntry);
        currentEntry = [];
      }
      parseState = "header";
      continue;
    }
    if (parseState === "firstLine") {
      assert(line.startsWith(`*`), line);
      parseState = "content";
    }
    if (parseState === "header") {
      parseState = "firstLine";
    }
    currentEntry.push(line.trim());
  }
  if (currentEntry.length > 0) {
    rawEntries.push(currentEntry);
  }
  return rawEntries;
}

// @ts-expect-error
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

function formatSections(
  blurb: string[],
  senses: string[][],
  key: string,
  id: string
): string {
  const children: XmlChild[] = [];
  const blurbNode = new XmlNode(
    "div",
    [],
    blurb.map((b) => new XmlNode("div", [], [b]))
  );
  children.push(blurbNode);
  for (let i = 0; i < senses.length; i++) {
    const sense = senses[i];
    const senseNode = new XmlNode(
      "div",
      [["class", "lsSense"]],
      sense.map((s) => new XmlNode("div", [], [s]))
    );
    children.push(senseNode);
  }
  const outline: EntryOutline = {
    mainKey: key,
    mainSection: {
      text: blurb[0].substring(0, 20),
      level: 0,
      ordinal: "0",
      sectionId: id,
    },
    // senses: outlineSenses,
  };
  const root = new XmlNode("div", [["id", id]], children);
  return JSON.stringify({
    entry: XmlNodeSerialization.DEFAULT.serialize(root),
    outline,
  });
}

function processRawEntry(
  entryLines: string[],
  dupeCounts: Map<string, number>
): RawDictEntry {
  const key = entryLines[0];
  assert(entryLines.length > 1, JSON.stringify(entryLines));

  const sections: string[][] = [];
  let currentSection: string[] = [entryLines[1]];
  for (let i = 2; i < entryLines.length; i++) {
    const line = entryLines[i];
    if (line.startsWith(">")) {
      assert(currentSection.length > 0);
      sections.push(currentSection);
      currentSection = [];
    }
    currentSection.push(line);
  }
  if (currentSection.length > 0) {
    sections.push(currentSection);
  }
  const id = `pozo_${key}${dupeCounts.get(key) ?? ""}`;
  dupeCounts.set(key, (dupeCounts.get(key) ?? 1) + 1);
  const entry = formatSections(sections[0], sections.slice(1), key, id);
  return { keys: [key], id, entry };
}

export function processPozo() {
  const rawEntries = getRawEntries();
  const processedEntries: RawDictEntry[] = [];
  const ids = new Set<string>();
  const dupeCounts = new Map<string, number>();
  for (let i = 0; i < rawEntries.length; i++) {
    if (i % 5000 === 0) {
      console.debug(`[Pozo] Processed ${i} of ${rawEntries.length}`);
    }
    const entry = rawEntries[i];
    const processed = processRawEntry(entry, dupeCounts);
    assert(!ids.has(processed.id), `Duplicate id: ${processed.id}}`);
    ids.add(processed.id);
    processedEntries.push(processed);
  }
  SqliteDict.save(processedEntries, envVar("POZO_PROCESSED_PATH"));
}
