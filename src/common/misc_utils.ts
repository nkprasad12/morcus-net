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

export class TimeProfiler {
  private startTime: number;
  private readonly events: Map<string, number> = new Map();
  private lastTime: number;

  constructor() {
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.reset();
  }

  public phase(name: string): void {
    const now = performance.now();
    const elapsed = now - this.lastTime;
    if (!this.events.has(name)) {
      this.events.set(name, elapsed);
    } else {
      this.events.set(name, this.events.get(name)! + elapsed);
    }
    this.lastTime = now;
  }

  public printReport(): void {
    const totalTime = this.lastTime - this.startTime;
    console.log(`Total time: ${totalTime.toFixed(2)} ms`);
    const sortedEvents = Array.from(this.events.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const maxNameLength = Math.max(
      ...sortedEvents.map(([name]) => name.length)
    );
    for (const [name, time] of sortedEvents) {
      console.log(`- ${name.padEnd(maxNameLength)} : ${time.toFixed(2)} ms`);
    }
    this.reset();
  }

  public getStats(): [string, number][] {
    return Array.from(this.events.entries());
  }

  public reset(): void {
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.events.clear();
  }
}

export const LOOP_PROFILER = singletonOf(() => new TimeProfiler());

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

/**
 * Estimates the memory size in bytes of a JS object, including Maps and Sets.
 * Note: This is a rough estimate, not exact.
 */
export function estimateObjectSize(obj: any, seen = new Set<any>()): number {
  if (obj === null || obj === undefined) return 0;
  if (seen.has(obj)) return 0;
  seen.add(obj);

  let bytes = 0;
  const type = typeof obj;

  if (type === "boolean") {
    bytes += 4;
  } else if (type === "number") {
    bytes += 8;
  } else if (type === "string") {
    bytes += obj.length * 2;
  } else if (type === "object") {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        bytes += estimateObjectSize(item, seen);
      }
    } else if (obj instanceof Map) {
      for (const [key, value] of obj.entries()) {
        bytes += estimateObjectSize(key, seen);
        bytes += estimateObjectSize(value, seen);
      }
    } else if (obj instanceof Set) {
      for (const item of obj.values()) {
        bytes += estimateObjectSize(item, seen);
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          bytes += estimateObjectSize(key, seen);
          bytes += estimateObjectSize(obj[key], seen);
        }
      }
    }
  }
  return bytes;
}

export function bytesToMib(input: number): number {
  const inMib = input / (1024 * 1024);
  return Math.round(inMib * 10) / 10;
}

export function getFormattedMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: bytesToMib(usage.rss),
    heapTotal: bytesToMib(usage.heapTotal),
    heapUsed: bytesToMib(usage.heapUsed),
    external: bytesToMib(usage.external),
    arrayBuffers: bytesToMib(usage.arrayBuffers),
  };
}
