import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";

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

export function singletonOf<T>(initializer: () => T): {
  readonly get: () => T;
} {
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

export class AggregateTimer {
  private readonly map = arrayMap<string, number>();
  private currentStart: [string, number] | undefined = undefined;

  start(tag: string) {
    assertEqual(this.currentStart, undefined);
    this.currentStart = [tag, performance.now()];
  }

  end(tag: string) {
    const [startTag, startTime] = checkPresent(this.currentStart);
    const span = performance.now() - startTime;
    assertEqual(tag, startTag);
    this.map.add(tag, span);
    this.currentStart = undefined;
  }

  summary(): string {
    const result: string[] = [];
    result.push("========================");
    result.push("= Global Timer Summary =");
    result.push("========================");
    Array.from(this.map.map.entries(), ([tag, values]): [string, number] => [
      tag,
      values.reduce((a, b) => a + b),
    ])
      .sort((a, b) => b[1] - a[1])
      .map(([tag, sum]) => `${sum.toFixed(1).padEnd(8)}   [${tag}]`)
      .forEach((s) => result.push(s));
    return result.join("\n");
  }
}

export function areArraysEqual<T>(first: T[], second: T[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let i = 0; i < first.length; i++) {
    if (first[i] !== second[i]) {
      return false;
    }
  }
  return true;
}
