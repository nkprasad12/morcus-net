/**
 * UI V2 reader swipe page turns: what only a real browser can check.
 *
 * Gesture policy, the setting's storage, and the view's page-turn wiring are
 * covered by the jsdom tests (core/gesture.test.ts, reader_page_nav.test.ts,
 * reader_settings.test.ts, reader_view.test.ts). This suite keeps the parts
 * that need real layout, CSS (media queries, `:has()`, pseudo-elements), and
 * the server. Kept separate from browser_v2_e2e.test.ts so it runs on its own:
 *
 *   REUSE_DEV_SERVER=1 PORT=5757 npx playwright test \
 *     src/integration/suites/browser_v2_swipe.test.ts \
 *     --project=MobileChrome --project=chromium
 *
 * Touches go through CDP (`Input.dispatchTouchEvent`), so the touch cases run
 * only on Chromium with touch emulation (MobileChrome). CDP touches never
 * trigger Chrome's own history swipe, so suppressing it is checked through
 * the computed `overscroll-behavior-x` rather than behaviorally.
 */

import { test, expect, type Page } from "@playwright/test";

const START = "/v2/reader/caesar/de_bello_gallico/1.1";
const NEXT = /\/v2\/reader\/caesar\/de_bello_gallico\/1\.2$/;
const PREV = /\/v2\/reader\/caesar\/de_bello_gallico\/1\.1$/;

type Swipe = (dx: number) => Promise<void>;

/** Opens the reader and returns a committed-length horizontal swipe. */
async function openReader(page: Page): Promise<Swipe> {
  await page.goto(START);
  await page.waitForSelector(".reader-passage .lat-word");
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: Array<[number, number]>
  ) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map(([x, y]) => ({ x, y })),
    });
  return async (dx) => {
    const width = page.viewportSize()!.width;
    const fromX = dx < 0 ? width - 60 : 60;
    const steps = 12;
    await touch("touchStart", [[fromX, 400]]);
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", [[fromX + (dx * i) / steps, 400]]);
    }
    await touch("touchEnd", []);
  };
}

/** Waits for the slide (and the turn it may trigger) to finish. */
async function settled(page: Page) {
  const panel = page.locator(".reader-text-panel");
  await expect(panel).not.toHaveAttribute("data-swipe", /.*/);
  await expect(panel).not.toHaveAttribute("aria-busy", /.*/);
}

test.describe("UI V2 reader swipe navigation (touch)", () => {
  test.skip(
    ({ browserName, hasTouch }) => browserName !== "chromium" || !hasTouch,
    "Touch is dispatched via CDP: Chromium with touch emulation only"
  );

  test("swiping turns pages forward and back without horizontal overflow", async ({
    page,
  }) => {
    const swipe = await openReader(page);
    const noOverflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      );

    await swipe(-220);
    await expect(page).toHaveURL(NEXT);
    await expect(page.locator(".reader-passage-heading")).toContainText(
      "Chapter 2"
    );
    await settled(page);
    expect(await noOverflow()).toBe(true);

    await swipe(220);
    await expect(page).toHaveURL(PREV);
    await expect(page.locator(".reader-passage-heading")).toContainText(
      "Chapter 1"
    );
    await settled(page);
    expect(await noOverflow()).toBe(true);
  });

  test("the setting is shown and gates the browser history-swipe guard", async ({
    page,
  }) => {
    await openReader(page);
    const root = page.locator("html");
    await expect(root).toHaveCSS("overscroll-behavior-x", "none");

    await page.locator("#reader-settings-btn").click();
    const toggle = page.locator("#toggle-swipe-nav");
    await expect(toggle).toBeVisible();
    await toggle.uncheck();
    await expect(root).toHaveCSS("overscroll-behavior-x", "auto");
    await toggle.check();
    await expect(root).toHaveCSS("overscroll-behavior-x", "none");
  });

  test("slow page turns show the loading spinner after a delay", async ({
    page,
  }) => {
    const swipe = await openReader(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/v2/reader/**", async (route) => {
      if (route.request().headers()["x-requested-with"] === "fetch") {
        await gate;
      }
      await route.continue();
    });

    const spinner = () =>
      page.evaluate(() => {
        const s = getComputedStyle(
          document.querySelector(".reader-main-column")!,
          "::after"
        );
        return {
          content: s.content,
          delay: s.animationDelay,
          opacity: Number(s.opacity),
        };
      });

    await swipe(-220);
    await expect(page.locator(".reader-text-panel")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    // The delay is asserted from the stylesheet, not by racing the clock.
    const initial = await spinner();
    expect(initial.content).toBe('""');
    expect(initial.delay.split(",")[0].trim()).toBe("0.4s");
    await expect.poll(async () => (await spinner()).opacity).toBe(1);

    release();
    await expect(page).toHaveURL(NEXT);
    await settled(page);
    expect((await spinner()).content).toBe("none");
  });
});

test.describe("UI V2 reader swipe navigation (no touchscreen)", () => {
  test.skip(({ hasTouch }) => hasTouch, "Checks devices without a touchscreen");

  test("hides the touch setting and keeps browser history swipes", async ({
    page,
  }) => {
    await page.goto(START);
    await page.waitForSelector(".reader-passage .lat-word");
    await expect(page.locator("html")).toHaveCSS(
      "overscroll-behavior-x",
      "auto"
    );
    await page.locator("#reader-settings-btn").click();
    await expect(page.locator("#reader-settings-popover")).toBeVisible();
    await expect(page.locator(".settings-touch-nav")).toBeHidden();
  });
});
