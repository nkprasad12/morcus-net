import { test } from "@playwright/test";

export const LIGHT_TAG = "@light-theme";
export const DARK_TAG = "@dark-theme";

export function repeatedTest(
  title: string,
  iterations: number,
  testBody: Parameters<typeof test>[2]
) {
  for (let i = 1; i <= iterations; i++) {
    test(`${title} ${i}`, testBody);
  }
}

export function screenshotTest(
  title: string,
  testBody: Parameters<typeof test>[2]
) {
  test(`${title} light`, { tag: LIGHT_TAG }, testBody);
  test(`${title} dark`, { tag: DARK_TAG }, testBody);
}
