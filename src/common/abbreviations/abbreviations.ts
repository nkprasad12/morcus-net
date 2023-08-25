import { checkPresent } from "@/common/assert";

const START_CHARACTERS = new Set<string>(" ();—-");

export class GenericTrieNode<T> {
  private readonly children: Map<string, GenericTrieNode<T>> = new Map();
  private readonly values: T[] = [];

  add(word: string, value: T): void {
    let lastNode: GenericTrieNode<T> = this;
    for (const character of word) {
      if (!lastNode.children.has(character)) {
        lastNode.children.set(character, new GenericTrieNode());
      }
      lastNode = checkPresent(lastNode.children.get(character));
    }
    lastNode.values.push(value);
  }

  isFullWord(): boolean {
    return this.values.length > 0;
  }

  next(character: string): GenericTrieNode<T> | undefined {
    return this.children.get(character);
  }

  nodeValues(): T[] {
    return this.values.map((v) => v);
  }
}

export class StringTrie extends GenericTrieNode<string> {}

export namespace AbbreviationTrie {
  export function forMap(map: Map<string, string>): StringTrie {
    const root = new StringTrie();
    for (const [key, value] of map.entries()) {
      root.add(key, value);
    }
    return root;
  }
}

export function findExpansions(
  message: string,
  trieRoot: StringTrie,
  ignoreCase: boolean = false
): [number, number, string[]][] {
  // [startIndex, length, expandedString]
  const expansions: [number, number, string[]][] = [];
  let triePosition: StringTrie = trieRoot;
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
