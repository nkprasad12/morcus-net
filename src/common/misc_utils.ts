import { assert } from "@/common/assert";

export class Tally<T> {
  private readonly counts = new Map<T, number>();

  count(item: T) {
    if (!this.counts.has(item)) {
      this.counts.set(item, 0);
    }
    this.counts.set(item, this.counts.get(item)! + 1);
  }

  toString(threshold?: number): string {
    const entries = Array.from(this.counts.entries());
    const total = entries.map(([_, count]) => count).reduce((a, b) => a + b, 0);
    return (
      `Total: ${total}\n` +
      entries
        .filter(([_a, aCount]) => aCount >= (threshold || 0))
        .sort(([_a, aCount], [_b, bCount]) => bCount - aCount)
        .map(([label, count]) => `${count} <= ${label}`)
        .join("\n")
    );
  }
}

export function exhaustiveGuard(_value: never): never {
  throw new Error(
    `ERROR! Reached forbidden guard function with unexpected value: ${JSON.stringify(
      _value
    )}`
  );
}

export function singletonOf<T>(initializer: () => T): { get: () => T } {
  let value: T | undefined = undefined;
  return {
    get: () => {
      if (value === undefined) {
        value = initializer();
      }
      return value;
    },
  };
}

export function safeParseInt(input: string | undefined): number | undefined {
  if (input === undefined || !/^(?:-)?\d+$/.test(input)) {
    return undefined;
  }
  return parseInt(input);
}

export function mergeMaps<K, V>(
  first: Map<K, V>,
  second: Map<K, V>,
  allowDuplicates: boolean = false
): Map<K, V> {
  const result = new Map<K, V>(first);
  for (const [k, v] of second.entries()) {
    if (!allowDuplicates) {
      assert(!result.has(k), `Duplicate for ${k}`);
    }
    result.set(k, v);
  }
  return result;
}
