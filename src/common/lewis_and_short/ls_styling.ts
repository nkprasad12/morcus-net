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
      lastNode = lastNode.children.get(character)!;
    }
    lastNode.values.push({ value: value, tags: tags });
  }

  isFullWord(): boolean {
    return this.values.length > 0;
  }

  next(character: string): TrieNode | undefined {
    return this.children.get(character);
  }

  nodeValues(filters?: string[]): TrieValue[] {
    const goodValues: TrieValue[] = [];
    for (const trieValue of this.values) {
      if (filters === undefined || filters.length === 0) {
        goodValues.push(trieValue);
        continue;
      }
      if (trieValue.tags === undefined || trieValue.tags.length === 0) {
        continue;
      }
      const hasAllFilters = filters
        .map((filter) => trieValue.tags!.includes(filter))
        .reduce((previous, current) => previous && current);
      if (!hasAllFilters) {
        continue;
      }
      goodValues.push(trieValue);
    }
    return goodValues;
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
// export function attachAbbreviations(
//   message: string,
//   lookup: Map<string, string>
// ): string {}

export function attachHoverText(
  displayText: string,
  hoverText: string
): string {
  const style = `style="display: inline; border-bottom: 1px dashed blue;"`;
  return `<div ${style} title="${hoverText}">${displayText}</div>`;
}

export function substituteAbbreviation(
  original: string,
  lookup: Map<string, string>
): string {
  const expanded = lookup.get(original)!;
  return attachHoverText(expanded, `Expanded from: ${original}`);
}
