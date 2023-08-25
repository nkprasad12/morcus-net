import { checkPresent } from "@/common/assert";

const START_CHARACTERS = new Set<string>(" ();—-");

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
