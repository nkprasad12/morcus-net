import { checkPresent } from "../assert";
import { XmlNode } from "./xml_node";

const START_CHARACTERS = new Set<string>(" ();");

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
export function findExpansions(
  message: string,
  trieRoot: TrieNode,
  ignoreCase: boolean = false
): [number, number, string[]][] {
  // [startIndex, length, expandedString]
  const expansions: [number, number, string[]][] = [];
  let triePosition: TrieNode = trieRoot;
  let currentStart: number | undefined = undefined;
  let bestExpansion: [number, number, string[]] | undefined = undefined;
  for (let i = 0; i <= message.length; i++) {
    const c = i === message.length ? "@@" : message[i];
    // TODO: This is not correct. Backtracking will always choose the lower case branch
    // if it is present, so if we have `aBc hi hello`, and with abbreviations
    // `abd` and `aBc`, we would never find `aBc`.
    const nextNode = ignoreCase
      ? triePosition.next(c.toLowerCase()) || triePosition.next(c.toUpperCase())
      : triePosition.next(c);
    if (nextNode === undefined) {
      triePosition = trieRoot;
      if (bestExpansion !== undefined) {
        expansions.push(bestExpansion);
        // Restart right after the consumed substring for which we found an expansion.
        // We have the `-1` because the loop will increment after this.
        i = bestExpansion[0] + bestExpansion[1] - 1;
        bestExpansion = undefined;
      } else if (currentStart !== undefined) {
        // The loop will increment `i`, so in the next iteration
        // we will read the character after `currentStart`.
        i = currentStart;
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
  return expansions;
}

export function handleAbbreviationsInMessage(
  message: string,
  expansions: [number, number, string[]][],
  replace: boolean,
  expandedCssClasses?: string[]
): (XmlNode | string)[] {
  const chunks: (XmlNode | string)[] = [];
  let lastChunkEnd = 0;
  for (const [startIndex, length, expandedString] of expansions) {
    chunks.push(message.slice(lastChunkEnd, startIndex));
    const original = message.slice(startIndex, startIndex + length);
    lastChunkEnd = startIndex + length;
    if (expandedString.length === 1) {
      const toDisplay = replace ? expandedString[0] : original;
      const onHover = replace
        ? `Expanded from: ${original}`
        : expandedString[0];
      chunks.push(attachHoverText(toDisplay, onHover, expandedCssClasses));
    } else {
      chunks.push(
        attachHoverText(
          original,
          `Ambiguous: ${expandedString.join(" OR ")}`,
          expandedCssClasses
        )
      );
    }
  }
  chunks.push(message.slice(lastChunkEnd));
  return chunks;
}

export function handleAbbreviations(
  contentRoot: XmlNode,
  defaultTrie: TrieNode,
  replace: boolean = true,
  expandedCssClasses?: string[]
): XmlNode {
  const children: (XmlNode | string)[] = [];
  for (const child of contentRoot.children) {
    const rootClass = contentRoot.getAttr("class") || "";
    if (rootClass.includes("lsHover")) {
      // Do not abbreviate any part of a string that has already been expanded.
      children.push(child);
      continue;
    }
    if (typeof child === "string") {
      handleAbbreviationsInMessage(
        child,
        findExpansions(child, defaultTrie),
        replace,
        expandedCssClasses
      ).forEach((x) => children.push(x));
      continue;
    }
    children.push(
      handleAbbreviations(child, defaultTrie, replace, expandedCssClasses)
    );
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
  expandedCssClasses?: string[]
): XmlNode {
  const allClasses = ["lsHover"];
  for (const expandedCssClass of expandedCssClasses || []) {
    allClasses.push(expandedCssClass);
  }
  const attrs: [string, string][] = [
    ["title", hoverText],
    ["class", allClasses.join(" ")],
  ];

  return new XmlNode("span", attrs, [displayText]);
}

export function substituteAbbreviation(
  original: string,
  lookup: Map<string, string>,
  expandedCssClasses?: string[]
): XmlNode {
  const expanded = checkPresent(lookup.get(original));
  return attachHoverText(
    expanded,
    `Expanded from: ${original}`,
    expandedCssClasses
  );
}
