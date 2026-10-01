import { test, type Page } from "@playwright/test";

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

/**
 * Turns off the app's CSS `scroll-behavior: smooth` on the current document.
 *
 * Playwright scrolls a target into view before clicking, and re-scrolls when
 * the target is covered (e.g. by the mobile TOC drawer). Firefox animates those
 * scrolls under `scroll-behavior: smooth`, so the page can still be moving when
 * the click lands: `mousedown` and `mouseup` hit different elements and the
 * `click` goes to their common ancestor instead of the target. A real user
 * waits for the scroll to settle, so this changes timing only, not behavior.
 *
 * Narrower than `reducedMotion: "reduce"`, which would also flip every other
 * `prefers-reduced-motion` path. Scrolls requested in JS with an explicit
 * `behavior: "smooth"` still animate.
 *
 * Applies to the current document only; call it again after a full navigation.
 */
export async function disableSmoothScroll(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "html { scroll-behavior: auto !important; }",
  });
}
