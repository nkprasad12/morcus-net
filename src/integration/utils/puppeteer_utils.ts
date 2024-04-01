/* istanbul ignore file */

import { assert, assertEqual } from "@/common/assert";
// @ts-ignore - puppeteer is an optional dependency.
import { ElementHandle, Page } from "puppeteer";

export type BrowserProduct = "chrome" | "firefox";
export type ScreenSize = "small" | "large";

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
  const allResults = await page.$x(`//span[contains(., '${label}')]`);
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
  const results = await page.$x(
    `//${parentType}[contains(text(), "${text}")${classString}]`
  );
  expect(results).toHaveLength(1);
  return results[0] as ElementHandle<Element>;
}
