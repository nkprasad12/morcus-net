import { checkPresent } from "../assert";
import { XmlNode } from "./ls_parser";

const START_CHARACTERS = new Set<string>([" "]);

export interface TrieValue {
  value: string;
  tags?: string[];
}

export class TrieNode {
  private readonly children: Map<string, TrieNode> = new Map();
  private readonly values: TrieValue[] = [];

  add(word: string, value: string, tags?: string[]): void {
    let lastNode: TrieNode = this;
    for (const character of word) {
      if (!lastNode.children.has(character)) {
        lastNode.children.set(character, new TrieNode());
      }
      lastNode = checkPresent(lastNode.children.get(character));
    }
    lastNode.values.push({ value: value, tags: tags });
  }

  isFullWord(): boolean {
    return this.values.length > 0;
  }

  next(character: string): TrieNode | undefined {
    return this.children.get(character);
  }

  nodeValues(filters?: string[]): string[] {
    const goodValues: string[] = [];
    for (const trieValue of this.values) {
      if (filters === undefined || filters.length === 0) {
        goodValues.push(trieValue.value);
        continue;
      }
      const trieTags = trieValue.tags;
      if (trieTags === undefined || trieTags.length === 0) {
        continue;
      }
      const hasAllFilters = filters
        .map((filter) => trieTags.includes(filter))
        .reduce((previous, current) => previous && current);
      if (!hasAllFilters) {
        continue;
      }
      goodValues.push(trieValue.value);
    }
    return goodValues;
  }
}

export namespace AbbreviationTrie {
  export function forMap(map: Map<string, string>): TrieNode {
    const root = new TrieNode();
    for (const [key, value] of map.entries()) {
      root.add(key, value);
    }
    return root;
  }
}

// Edge cases to watch out for:
// We can have two separate abbreviated forms next to each other,
// for example `Am. prol. 33` has:
// `Am.` -> `Amphitruo`
// `prol.` -> Prologue
//
// And also we can have multi-word keys like `de Or.` where we need to
// make sure we are handling `de` as connected to `Or.`.
export function expandAbbreviationsSingle(
  message: string,
  trieRoot: TrieNode,
  expandedTextClass?: string
): (XmlNode | string)[] {
  // [startIndex, length, expandedString]
  const expansions: [number, number, string[]][] = [];
  let triePosition: TrieNode = trieRoot;
  let currentStart: number | undefined = undefined;
  let bestExpansion: [number, number, string[]] | undefined = undefined;
  for (let i = 0; i <= message.length; i++) {
    const c = i === message.length ? "@@" : message[i];
    const nextNode = triePosition.next(c);
    if (nextNode === undefined) {
      triePosition = trieRoot;
      if (bestExpansion !== undefined) {
        expansions.push(bestExpansion);
        bestExpansion = undefined;
      } else if (currentStart !== undefined) {
        i = currentStart + 1;
      }
      currentStart = undefined;
      continue;
    }

    if (currentStart === undefined) {
      currentStart = i;
    }
    triePosition = nextNode;
    if (
      triePosition.isFullWord() &&
      (currentStart === 0 || START_CHARACTERS.has(message[currentStart - 1]))
    ) {
      bestExpansion = [
        currentStart,
        i - currentStart + 1,
        triePosition.nodeValues(),
      ];
    }
  }

  const chunks: (XmlNode | string)[] = [];
  let lastChunkEnd = 0;
  for (const [startIndex, length, expandedString] of expansions) {
    chunks.push(message.slice(lastChunkEnd, startIndex));
    const original = message.slice(startIndex, startIndex + length);
    lastChunkEnd = startIndex + length;
    if (expandedString.length === 1) {
      chunks.push(
        attachHoverText(
          expandedString[0],
          `Expanded from: ${original}`,
          expandedTextClass
        )
      );
    } else {
      chunks.push(
        attachHoverText(
          original,
          `Ambiguous: ${expandedString.join(" OR ")}`,
          expandedTextClass
        )
      );
    }
  }
  chunks.push(message.slice(lastChunkEnd));
  return chunks;
}

export function expandAbbreviations(
  contentRoot: XmlNode,
  defaultTrie: TrieNode,
  expandedTextClass?: string
): XmlNode {
  const children: (XmlNode | string)[] = [];
  for (const child of contentRoot.children) {
    if (typeof child === "string") {
      expandAbbreviationsSingle(child, defaultTrie, expandedTextClass).forEach(
        (x) => children.push(x)
      );
      continue;
    }
    children.push(expandAbbreviations(child, defaultTrie, expandedTextClass));
  }
  return new XmlNode(
    contentRoot.name,
    contentRoot.attrs.map(([k, v]) => [k, v]),
    children
  );
}

export function attachHoverText(
  displayText: XmlNode | string,
  hoverText: string,
  expandedTextClass?: string
): XmlNode {
  const attrs: [string, string][] = [["title", hoverText]];
  if (expandedTextClass !== undefined) {
    attrs.push(["class", expandedTextClass]);
  }
  return new XmlNode("span", attrs, [displayText]);
}

export function substituteAbbreviation(
  original: string,
  lookup: Map<string, string>,
  expandedTextClass: string = "lsHoverText"
): XmlNode {
  const expanded = checkPresent(lookup.get(original));
  return attachHoverText(
    expanded,
    `Expanded from: ${original}`,
    expandedTextClass
  );
}
