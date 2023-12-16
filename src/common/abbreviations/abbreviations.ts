import { checkPresent } from "@/common/assert";

const START_CHARACTERS = new Set<string>(" ()[];—-");

// [startIndex, length, [expansions1, expansion2]]
export type GenericExpansion<T> = [number, number, T[]];
export type TextExpansion = [number, number, string[]];

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

export namespace GenericTrieNode {
  export function withValues<T>(initial: [string, T][]) {
    const result = new GenericTrieNode<T>();
    for (const [key, value] of initial) {
      result.add(key, value);
    }
    return result;
  }
}

export class StringTrie extends GenericTrieNode<string> {}

/**
 * @deprecated
 * Use `AbbreviationTrie` instead.
 */
export namespace AbbreviationTrieOld {
  export function forMap(map: Map<string, string>): StringTrie {
    const root = new StringTrie();
    for (const [key, value] of map.entries()) {
      root.add(key, value);
    }
    return root;
  }
}

function areIntervalsDisjoint(intervals: [number, number][]): boolean {
  intervals.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < intervals.length - 1; i++) {
    if (intervals[i][1] >= intervals[i + 1][0]) {
      return false;
    }
  }
  return true;
}

export function areExpansionsDisjoint<T>(
  expansions: [number, number, T][]
): boolean {
  const intervals: [number, number][] = expansions.map((e) => [
    e[0],
    e[0] + e[1],
  ]);
  return areIntervalsDisjoint(intervals);
}

/**
 * @deprecated
 * Use `findExpansions` instead.
 */
export function findExpansionsOld(
  message: string,
  trieRoot: StringTrie,
  ignoreCase: boolean = false
): TextExpansion[] {
  const expansions: TextExpansion[] = [];
  let triePosition: StringTrie = trieRoot;
  let currentStart: number | undefined = undefined;
  let bestExpansion: TextExpansion | undefined = undefined;
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

export interface MatchContext {
  prefix?: string;
  postfix?: string;
}

export interface ContextualMatch extends MatchContext {
  expansion: string;
}

export type AbbreviationData = [string, string | ContextualMatch];

export interface ExpansionData extends ContextualMatch {
  original: string;
  replace?: true;
}

export class AbbreviationTrie extends GenericTrieNode<ExpansionData> {}

export namespace AbbreviationTrie {
  export function from(
    expansions: AbbreviationData[],
    replacements: AbbreviationData[]
  ): AbbreviationTrie {
    const root = new AbbreviationTrie();
    for (const [key, value] of expansions) {
      if (typeof value === "string") {
        root.add(key, { original: key, expansion: value });
        continue;
      }
      root.add(key, { ...value, original: key });
    }
    for (const [key, value] of replacements) {
      if (typeof value === "string") {
        root.add(key, { original: key, expansion: value, replace: true });
        continue;
      }
      root.add(key, { ...value, original: key, replace: true });
    }
    return root;
  }
}

export function findExpansions<T extends MatchContext>(
  message: string,
  trieRoot: GenericTrieNode<T>,
  ignoreCase: boolean = false
): GenericExpansion<T>[] {
  const expansions: GenericExpansion<T>[] = [];
  let triePosition: GenericTrieNode<T> = trieRoot;
  let currentStart: number | undefined = undefined;
  let bestExpansion: GenericExpansion<T> | undefined = undefined;
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
      const validValues: T[] = [];
      const length = i - currentStart + 1;
      for (const value of triePosition.nodeValues()) {
        if (value.prefix !== undefined) {
          const candidate = message.substring(
            currentStart - value.prefix.length,
            currentStart
          );
          if (candidate !== value.prefix) {
            continue;
          }
        }
        if (value.postfix !== undefined) {
          const candidate = message.substring(
            currentStart + length,
            currentStart + length + value.postfix.length
          );
          if (candidate !== value.postfix) {
            continue;
          }
        }
        validValues.push(value);
      }
      if (validValues.length > 0) {
        bestExpansion = [currentStart, length, validValues];
      }
    }
  }
  return expansions;
}
