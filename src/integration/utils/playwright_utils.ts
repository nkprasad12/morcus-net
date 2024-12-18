import { test } from "@playwright/test";

export function repeatedTest(
  title: string,
  iterations: number,
  testBody: Parameters<typeof test>[2]
) {
  for (let i = 1; i <= iterations; i++) {
    test(`${title} ${i}`, testBody);
  }
}
