/**
 * UI V2 late hydration: what a user does before `v2.js` arrives must survive
 * the upgrade, and the JS gate / pre-paint snapshot must keep first paint and
 * upgraded layout identical (PRE_HYDRATION.md; PE_FRAMEWORK_RFC_REVISIONS_1.md §9.3).
 *
 * Each test holds back every script under /v2/assets/ with `page.route`, so
 * the page sits in the pre-hydration window (SSR markup plus the inline
 * critical CSS/JS) for as long as the test likes. It interacts, releases the
 * scripts, waits for the owner's `data-upgraded` marker, and asserts that the
 * upgraded component adopted the state instead of clobbering it.
 *
 *   REUSE_DEV_SERVER=1 PORT=5757 npx playwright test \
 *     src/integration/suites/browser_v2_late_hydration.test.ts \
 *     --project=chromium --project=MobileChrome
 *
 * (`./morcus.sh e2e --v2` runs it along with browser_v2_e2e.test.ts.)
 */

import { test, expect, type Page } from "@playwright/test";

const V2_SCRIPTS = /\/v2\/assets\/[^?]*\.js(\?|$)/;
const READER = "/v2/reader/caesar/de_bello_gallico/1.1";

/**
 * Holds every V2 asset script until the returned function is called, then
 * navigates to `url`. Module scripts delay DOMContentLoaded, so navigation
 * only waits for the response to commit and then for `ready` to render.
 */
async function openBeforeHydration(
  page: Page,
  url: string,
  ready: string
): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(V2_SCRIPTS, async (route) => {
    await released;
    await route.continue();
  });
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector(ready);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every((l) =>
      Boolean((l as HTMLLinkElement).sheet)
    )
  );
  return release;
}

async function expectUpgraded(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toHaveAttribute(
    "data-upgraded",
    "",
    { timeout: 15000 }
  );
}

/** Sums unexpected layout shifts from page start (Chromium only). */
async function trackLayoutShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number | null };
    w.__cls = null;
    if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      return;
    }
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as unknown as {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) w.__cls = (w.__cls ?? 0) + shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

function layoutShift(page: Page): Promise<number | null> {
  return page.evaluate(
    () => (window as unknown as { __cls: number | null }).__cls
  );
}

/** `[data-nojs-only]` elements that have a rendered box. */
function paintedFallbacks(page: Page): Promise<number> {
  return page
    .locator("[data-nojs-only]")
    .evaluateAll(
      (els) => els.filter((el) => el.getClientRects().length > 0).length
    );
}

/** Rendered `[data-js-only]` elements, split by computed visibility. */
function jsOnlyVisibility(page: Page) {
  return page.locator("[data-js-only]").evaluateAll((els) => {
    const rendered = els.filter((el) => el.getClientRects().length > 0);
    const hidden = rendered.filter(
      (el) => getComputedStyle(el).visibility === "hidden"
    ).length;
    return { rendered: rendered.length, hidden };
  });
}

test.describe("UI V2 late hydration", () => {
  test("gate: JS-only UI stays hidden until upgrade and No-JS fallbacks never paint", async ({
    page,
  }) => {
    const release = await openBeforeHydration(
      page,
      "/v2/dicts?q=habeo",
      "morcus-dict-settings"
    );
    const settings = page.locator("morcus-dict-settings");
    await settings.locator(".settings-btn").click();
    const applyBtn = settings.locator(".settings-apply-btn");
    const reportBtn = page.locator("morcus-report-dialog .report-btn");
    await expect(applyBtn).toBeHidden();
    await expect(reportBtn).toBeHidden();

    release();
    await expectUpgraded(page, "morcus-dict-settings");
    await expectUpgraded(page, "morcus-report-dialog");
    await expect(applyBtn).toBeHidden();
    await expect(reportBtn).toBeVisible();
  });

  const PAGES = [
    { name: "dictionary", url: "/v2/dicts?q=habeo", ready: ".dict-card" },
    { name: "library", url: "/v2/library", ready: ".work-card" },
    { name: "reader", url: READER, ready: ".reader-passage" },
    {
      name: "External Reader",
      url: "/v2/externalReader",
      ready: ".external-import-card",
    },
  ];

  for (const { name, url, ready } of PAGES) {
    test(`gate (${name}): fallbacks never paint and nothing shifts at upgrade`, async ({
      page,
    }) => {
      await trackLayoutShift(page);
      const release = await openBeforeHydration(page, url, ready);

      // Pre-upgrade: JS-only controls hold their space but are invisible.
      expect(await paintedFallbacks(page)).toBe(0);
      const before = await jsOnlyVisibility(page);
      expect(before.hidden).toBe(before.rendered);

      release();
      await page.waitForLoadState("load");
      await expect
        .poll(async () => (await jsOnlyVisibility(page)).hidden)
        .toBe(0);
      expect(await paintedFallbacks(page)).toBe(0);

      await page.waitForTimeout(500);
      const cls = await layoutShift(page);
      if (cls !== null) expect(cls).toBeLessThan(0.01);
    });
  }

  test("gate: a bundle that fails to load restores the No-JS fallbacks", async ({
    page,
  }) => {
    await page.route(V2_SCRIPTS, (route) => route.abort());
    await page.goto("/v2/dicts?q=habeo");
    await expect(page.locator("html")).toHaveAttribute("data-js-failed", "");

    expect((await jsOnlyVisibility(page)).rendered).toBe(0);

    const settings = page.locator("morcus-dict-settings");
    await settings.locator(".settings-btn").click();
    expect(await paintedFallbacks(page)).toBeGreaterThan(0);
    await expect(settings.locator(".settings-apply-btn")).toBeVisible();
  });

  test("gate: without JavaScript, fallbacks show and JS-only UI takes no space", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    for (const url of ["/v2/dicts?q=habeo", READER]) {
      await page.goto(url);
      const displays = await page
        .locator("[data-js-only]")
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).display));
      expect(displays.length).toBeGreaterThan(0);
      expect(displays.every((display) => display === "none")).toBe(true);
    }

    await page.goto("/v2/dicts?q=habeo");
    const settings = page.locator("morcus-dict-settings");
    await settings.locator(".settings-btn").click();
    expect(await paintedFallbacks(page)).toBeGreaterThan(0);
    await expect(settings.locator(".settings-apply-btn")).toBeVisible();
    await context.close();
  });

  test("dictionary settings: checkboxes changed before upgrade are kept and saved (PH1)", async ({
    page,
  }) => {
    const release = await openBeforeHydration(
      page,
      "/v2/dicts?q=habeo",
      "morcus-dict-settings"
    );
    const settings = page.locator("morcus-dict-settings");
    await settings.locator(".settings-btn").click();
    const checkboxes = settings.locator(".dict-checkbox");
    const count = await checkboxes.count();
    const toUncheck: string[] = [];
    for (let i = 0; i < count; i++) {
      const value = await checkboxes.nth(i).getAttribute("value");
      if (
        value !== null &&
        value !== "L&S" &&
        (await checkboxes.nth(i).isChecked())
      ) {
        toUncheck.push(value);
        await checkboxes.nth(i).uncheck();
      }
    }
    expect(toUncheck.length).toBeGreaterThan(0);

    release();
    await expectUpgraded(page, "morcus-dict-settings");
    for (const value of toUncheck) {
      await expect(
        settings.locator(`.dict-checkbox[value="${value}"]`)
      ).not.toBeChecked();
    }

    // The adopted selection was persisted, not just left on screen.
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("/v2/dicts?q=habeo");
    await expectUpgraded(page, "morcus-dict-settings");
    for (const value of toUncheck) {
      await expect(
        settings.locator(`.dict-checkbox[value="${value}"]`)
      ).not.toBeChecked();
    }
  });

  test("dictionary search: a query typed before upgrade is kept and acted on (PH3)", async ({
    page,
  }) => {
    const release = await openBeforeHydration(
      page,
      "/v2/dicts",
      'input[name="q"]'
    );
    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("hab");

    release();
    await expectUpgraded(page, "morcus-dict-search");
    await expect(input).toHaveValue("hab");
    await expect(page.locator(".suggestion-item").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("dictionary landing: scrolling before upgrade is not undone (PH9)", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: page.viewportSize()?.width ?? 1280,
      height: 400,
    });
    const release = await openBeforeHydration(
      page,
      "/v2/dicts",
      ".landing-container"
    );
    await page.evaluate(() =>
      window.scrollTo({ top: 200, behavior: "instant" })
    );
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBe(200);

    release();
    await expectUpgraded(page, "morcus-dict-search");
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await expect(page.locator('input[name="q"]')).not.toBeFocused();
  });

  test("reader: TOC opened via its link before upgrade is adopted and closable (PH5)", async ({
    page,
  }) => {
    const release = await openBeforeHydration(page, READER, "#reader-toc-btn");
    await page.locator("#reader-toc-btn").click();
    const drawer = page.locator("#reader-toc-drawer");
    await expect(drawer).toBeVisible();

    release();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(drawer).toBeVisible();
    // The hash was only a No-JS state carrier, so the reader cleared it.
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("reader: dictionary sheet opened before upgrade stays open (PH7)", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1280) > 640,
      "The dictionary sheet is the mobile layout"
    );
    // Works always carry About, so the server renders the companion tabs and
    // the Dictionary tab (not the dict-only open link) opens the sheet.
    const opener = ".reader-panel-tab[href='#panel-view-dict']";
    const release = await openBeforeHydration(page, READER, opener);
    await page.locator(opener).click();
    const panel = page.locator("#reader-dict");
    const openHeight = (await panel.boundingBox())?.height ?? 0;
    expect(openHeight).toBeGreaterThan(100);

    release();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(panel).not.toHaveClass(/\bdrawer-minimized\b/);
    expect((await panel.boundingBox())?.height ?? 0).toBeGreaterThan(100);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
  });

  test("reader: saved typography and width apply before upgrade without reflow (PH11)", async ({
    page,
  }) => {
    // A returning reader: the owners' settings plus the snapshot they record.
    await page.addInitScript(() => {
      localStorage.setItem(
        "morcus_reader_settings",
        JSON.stringify({
          readerScale: 130,
          fontFamily: "sans",
          lineHeight: "relaxed",
          showGutter: false,
        })
      );
      localStorage.setItem(
        "GlobalSettings",
        JSON.stringify({ readerWidth: "wide" })
      );
      localStorage.setItem(
        "morcus_prepaint",
        JSON.stringify({
          "--reader-scale": "1.30",
          "--reader-font": "var(--font-sans)",
          "--reader-line-height": "1.85",
          "data-reader-hide-gutter": "",
          "data-reader-width": "wide",
        })
      );
    });
    const release = await openBeforeHydration(page, READER, ".reader-passage");
    const measure = () =>
      page.evaluate(() => {
        const root = document.documentElement;
        const passage = document.querySelector(".reader-passage")!;
        const style = getComputedStyle(passage);
        return {
          scale: getComputedStyle(root)
            .getPropertyValue("--reader-scale")
            .trim(),
          width: root.getAttribute("data-reader-width"),
          hideGutter: root.hasAttribute("data-reader-hide-gutter"),
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          lineHeight: style.lineHeight,
          bodyWidth: document
            .querySelector(".body-reader")
            ?.getBoundingClientRect().width,
        };
      });

    const before = await measure();
    // The defaults would be 20px (1.25rem) serif.
    expect(before.scale).toBe("1.30");
    expect(before.width).toBe("wide");
    expect(before.hideGutter).toBe(true);
    expect(before.fontSize).not.toBe("20px");
    expect(
      parseFloat(before.lineHeight) / parseFloat(before.fontSize)
    ).toBeCloseTo(1.85, 2);

    release();
    await expectUpgraded(page, "morcus-reader-view");
    expect(await measure()).toEqual(before);
  });
});
