/* istanbul ignore file */

import { assert, assertEqual } from "@/common/assert";
// @ts-ignore - puppeteer is an optional dependency.
import { ElementHandle, Page } from "puppeteer";

export type BrowserProduct = "chrome" | "firefox";
export type ScreenSize = "small" | "large";

const SMALL_SCREEN: ScreenSize = "small";
const LARGE_SCREEN: ScreenSize = "large";
const SIZE_VARIANTS: ScreenSize[] = [SMALL_SCREEN, LARGE_SCREEN];

export const BROWSERS: BrowserProduct[] = ["firefox", "chrome"];
export const SMALL_ONLY: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    [SMALL_SCREEN].map((v) => [v, i + 1] as [ScreenSize, number])
  );
export const LARGE_ONLY: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    [LARGE_SCREEN].map((v) => [v, i + 1] as [ScreenSize, number])
  );
export const ALL_SCREEN_SIZES: (
  iterations: number
) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    SIZE_VARIANTS.map((v) => [v, i + 1] as [ScreenSize, number])
  );

export async function setSize(size: ScreenSize, page: Page) {
  const isSmall = size === "small";
  await page.setViewport({
    width: isSmall ? 600 : 1900,
    height: isSmall ? 900 : 1080,
    deviceScaleFactor: 1,
  });
}

export async function getButtonByAriaLabel(
  label: string,
  page: Page
): Promise<ElementHandle<HTMLButtonElement>> {
  const results = await page.$$(`button[aria-label="${label}"]`);
  assertEqual(
    results.length,
    1,
    `Found ${results.length} buttons with label ${label}`
  );
  const button = results[0];
  assert(await button.isVisible());
  return results[0] as ElementHandle<HTMLButtonElement>;
}

export async function filterNonVisible<
  T extends { isVisible: () => Promise<boolean> }
>(items: T[]): Promise<T[]> {
  const results: T[] = [];
  for (const item of items) {
    if (await item.isVisible()) {
      results.push(item);
    }
  }
  return results;
}

export async function getButtonByLabel(
  label: string,
  page: Page
): Promise<ElementHandle<HTMLButtonElement>> {
  const allResults = await page.$$(`xpath/.//span[contains(., '${label}')]`);
  const visibleResults = await filterNonVisible(allResults);
  assertEqual(
    visibleResults.length,
    1,
    `Found ${visibleResults.length} visible buttons with label ${label}`
  );
  return visibleResults[0] as ElementHandle<HTMLButtonElement>;
}

export function wait(timeMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, timeMs));
}

export async function openTab(label: string, size: ScreenSize, page: Page) {
  const isSmall = size === "small";
  if (isSmall) {
    const hamburger = await getButtonByAriaLabel("site pages", page);
    await hamburger.click();
    // Wait for the drawer entry transition, which is 150 ms
    await wait(200);
  }
  const tabButton = await getButtonByLabel(label, page);
  await tabButton.click();
  if (isSmall) {
    // Wait for the drawer exit transition, which is 150 ms
    await wait(200);
  }
}

export async function findText(
  text: string,
  page: Page,
  parentType: string = "*",
  className?: string
) {
  const classString =
    className === undefined ? "" : `and @class="${className}"`;
  const results = await page.$$(
    `xpath/.//${parentType}[contains(text(), "${text}")${classString}]`
  );
  expect(results).toHaveLength(1);
  return results[0] as ElementHandle<Element>;
}

export async function checkTitleIs(
  expected: string,
  page: Page
): Promise<void> {
  let title: string | undefined = undefined;
  for (let i = 0; i < 3; i++) {
    title = await page.title();
    if (title === expected) {
      break;
    }
  }
  expect(title).toBe(expected);
}

export async function checkHasText(text: string, page: Page): Promise<void> {
  const results = await page.$$(`xpath/.//*[contains(text(), "${text}")]`);
  assert(results.length > 0);
}

export async function waitForText(
  text: string,
  page: Page,
  parentType: string = "*",
  className?: string
): Promise<void> {
  const classString =
    className === undefined ? "" : `and @class="${className}"`;
  const results = await page.waitForSelector(
    `xpath/.//${parentType}[contains(text(), "${text}")${classString}]`,
    { timeout: 3000 }
  );
  assert(results !== null, `Failed to find text: ${text}`);
}
