/**
 * A utility class for counting occurrences of items.
 * @template T The type of items to count.
 */
export class Tally<T> {
  private readonly counts = new Map<T, number>();

  /**
   * Increments the count for the specified item.
   * @param item The item to count.
   */
  count(item: T) {
    if (!this.counts.has(item)) {
      this.counts.set(item, 0);
    }
    this.counts.set(item, this.counts.get(item)! + 1);
  }

  /**
   * Returns a string representation of the counts, sorted by count in descending order.
   * @param threshold The minimum count required for an item to be included in the output.
   * @returns A string representation of the counts.
   */
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
