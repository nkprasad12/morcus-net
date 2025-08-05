export interface TrieNode<T> {
  children?: Map<string, TrieNode<T>>;
  values?: T[];
}

export function fromMap<T>(map: Map<string, T[]>): TrieNode<T> {
  const root: TrieNode<T> = {};
  for (const [key, value] of map.entries()) {
    add(root, key, ...value);
  }
  return root;
}

export function add<T>(node: TrieNode<T>, key: string, ...values: T[]): void {
  let currentNode = node;
  for (const char of key) {
    if (currentNode.children === undefined) {
      currentNode.children = new Map();
    }
    if (!currentNode.children.has(char)) {
      currentNode.children.set(char, {});
    }
    currentNode = currentNode.children.get(char)!;
  }
  if (!currentNode.values) {
    currentNode.values = [];
  }
  currentNode.values.push(...values);
}

/**
 * Searches for the given string in the trie.
 *
 * @param node - The root node of the trie.
 * @param key - The string to search for.
 * @param end - The end index of the search (in the key)
 * @returns An array of values associated with the key, or undefined if not found.
 */
export function find<T>(
  node: TrieNode<T>,
  key: string,
  end: number
): T[] | undefined {
  let currentNode: TrieNode<T> = node;
  for (let i = 0; i < end; i++) {
    const nextNode = currentNode.children?.get(key[i]);
    if (nextNode === undefined) {
      return undefined;
    }
    currentNode = nextNode;
  }
  return currentNode.values;
}
