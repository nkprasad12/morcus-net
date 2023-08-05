/* istanbul ignore file */

import * as dotenv from "dotenv";
import { processSmithHall } from "@/common/smith_and_hall/process";

dotenv.config();

const startTime = performance.now();

// @ts-ignore
class Tally<T> {
  private readonly counts = new Map<T, number>();

  count(item: T) {
    if (!this.counts.has(item)) {
      this.counts.set(item, 0);
    }
    this.counts.set(item, this.counts.get(item)! + 1);
  }

  toString(): string {
    const entries = Array.from(this.counts.entries());
    const total = entries.map(([_, count]) => count).reduce((a, b) => a + b, 0);
    return (
      `Total: ${total}\n` +
      entries
        .sort(([_a, aCount], [_b, bCount]) => bCount - aCount)
        .map(([label, count]) => `${count} <= ${label}`)
        .join("\n")
    );
  }
}

processSmithHall();

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
