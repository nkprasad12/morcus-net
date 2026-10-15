/**
 * UI V2 late hydration: what a user does before `v2.js` arrives must survive
 * the upgrade, and the JS gate / pre-paint snapshot must keep first paint and
 * upgraded layout identical (src/web/v2/docs/TESTING.md, "Pre-hydration (PH) bug index").
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
const READER = "/v2/work/caesar/de_bello_gallico/1.1";

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

const COMMON_SCRIPT = /\/v2\/assets\/common(\.[^/?]*)?\.js(\?|$)/;

interface StagedPage {
  /**
   * Lets `common.js` run while the route chunks stay held, and waits until
   * the page is in the intermediate state: `common.js`'s own elements are
   * upgraded, `routeTag` is not yet defined.
   */
  enterIntermediate(): Promise<void>;
  /** Lets the route chunks (`reader.js`, `dict.js`, ...) through. */
  releaseRoute(): void;
}

/**
 * Like {@link openBeforeHydration}, but with separate gates for `common.js`
 * and every later chunk (docs/archive/CHUNK_ORDERING_ADR.md §1). Module scripts execute in
 * document order, so holding the route chunk after releasing `common.js`
 * reproduces the intermediate state exactly. The gates apply to every frame,
 * so the reader's dictionary iframe (`common.js` then `dict.js`) is staged
 * the same way.
 */
async function openStaged(
  page: Page,
  url: string,
  ready: string,
  routeTag: string,
  frameUrl?: RegExp
): Promise<StagedPage> {
  let releaseCommon!: () => void;
  const commonGate = new Promise<void>((resolve) => (releaseCommon = resolve));
  let releaseRoute!: () => void;
  const routeGate = new Promise<void>((resolve) => (releaseRoute = resolve));
  await page.route(V2_SCRIPTS, async (route) => {
    const isCommon = COMMON_SCRIPT.test(route.request().url());
    await (isCommon ? commonGate : routeGate);
    await route.continue();
  });
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector(ready);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every((l) =>
      Boolean((l as HTMLLinkElement).sheet)
    )
  );
  return {
    async enterIntermediate() {
      releaseCommon();
      const frame = () =>
        frameUrl === undefined
          ? page.mainFrame()
          : page.frames().find((f) => frameUrl.test(f.url()));
      await expect.poll(() => frame() !== undefined).toBe(true);
      await frame()!.waitForFunction(
        (tag) =>
          customElements.get("morcus-report-dialog") !== undefined &&
          customElements.get(tag) === undefined,
        routeTag
      );
    },
    releaseRoute,
  };
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
      // After the settings dialog in the markup (the host itself is `display: contents`).
      ".dict-card"
    );
    // Before upgrade the trigger is a hash link: `:target` shows the dialog, with Done (a
    // submit) but not the JS-only close button.
    const dialog = page.locator("dialog#dict-settings");
    const closeBtn = dialog.locator(".dialog-close-btn");
    const reportBtn = page.locator("morcus-report-dialog .report-btn");
    await page.locator("#dict-settings-btn").click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".dict-settings-done")).toBeVisible();
    await expect(closeBtn).toBeHidden();
    await expect(reportBtn).toBeHidden();

    // At upgrade the element adopts the hash and keeps the dialog open, now modal.
    release();
    await expectUpgraded(page, "morcus-dict-settings");
    await expectUpgraded(page, "morcus-report-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("open", "");
    await expect(closeBtn).toBeVisible();
    await expect(page).not.toHaveURL(/#dict-settings/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
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

    // The settings dialog works as it does without JS: `:target` opens it, Done submits.
    const dialog = page.locator("dialog#dict-settings");
    await page.locator("#dict-settings-btn").click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".dict-settings-done")).toBeVisible();
    await expect(dialog.locator(".dialog-close-btn")).toBeHidden();
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
    const dialog = page.locator("dialog#dict-settings");
    await page.locator("#dict-settings-btn").click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".dict-settings-done")).toBeVisible();
    await expect(dialog.locator(".dialog-close-btn")).toBeHidden();
    await context.close();
  });

  test("dictionary settings: edits made before upgrade stay a draft and apply on Done (PH1)", async ({
    page,
  }) => {
    const release = await openBeforeHydration(
      page,
      "/v2/dicts?q=habeo",
      // After the settings dialog in the markup (the host itself is `display: contents`).
      ".dict-card"
    );
    const dialog = page.locator("dialog#dict-settings");
    await page.locator("#dict-settings-btn").click();
    await expect(dialog).toBeVisible();
    const checkboxes = dialog.locator(".dict-checkbox");
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

    // The upgrade keeps the dialog open with the draft in it; nothing applies yet.
    release();
    await expectUpgraded(page, "morcus-dict-settings");
    await expect(dialog).toBeVisible();
    for (const value of toUncheck) {
      await expect(
        dialog.locator(`.dict-checkbox[value="${value}"]`)
      ).not.toBeChecked();
    }

    // Done applies (with JS, in place) and saves.
    await dialog.locator(".dict-settings-done").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("/v2/dicts?q=habeo");
    await expectUpgraded(page, "morcus-dict-settings");
    for (const value of toUncheck) {
      await expect(
        dialog.locator(`.dict-checkbox[value="${value}"]`)
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
        JSON.stringify({ readerWidth: 1680 })
      );
      localStorage.setItem(
        "morcus_prepaint",
        JSON.stringify({
          "--reader-scale": "1.30",
          "--reader-font": "var(--font-sans)",
          "--reader-line-height": "1.85",
          "data-reader-hide-gutter": "",
          "--reader-page-max": "1680px",
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
          width: root.style.getPropertyValue("--reader-page-max"),
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
    expect(before.width).toBe("1680px");
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

/**
 * The intermediate state (docs/archive/CHUNK_ORDERING_ADR.md): `common.js` has run, the route
 * chunk has not. Nothing in `common.js` may suppress native No-JS behaviour
 * for a component that has not upgraded, and the route's upgrade must still
 * adopt whatever the user did.
 */
test.describe("UI V2 chunk ordering: intermediate state", () => {
  const targetId = (page: Page) =>
    page.evaluate(() => document.querySelector(":target")?.id ?? null);

  test("reader: TOC link works while reader.js is still loading (PH5)", async ({
    page,
  }) => {
    const staged = await openStaged(
      page,
      READER,
      "#reader-toc-btn",
      "morcus-reader-view"
    );
    await staged.enterIntermediate();
    await page.locator("#reader-toc-btn").click();
    const drawer = page.locator("#reader-toc-drawer");
    // The No-JS mechanism: the fragment navigation happened, so `:target`
    // opens the drawer.
    await expect.poll(() => targetId(page)).toBe("reader-toc-drawer");
    await expect(drawer).toBeVisible();

    staged.releaseRoute();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("reader: dictionary tab works while reader.js is still loading (PH7)", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1280) > 640,
      "The dictionary sheet is the mobile layout"
    );
    const opener = ".reader-panel-tab[href='#panel-view-dict']";
    const staged = await openStaged(page, READER, opener, "morcus-reader-view");
    await staged.enterIntermediate();
    await page.locator(opener).click();
    const panel = page.locator("#reader-dict");
    await expect.poll(() => targetId(page)).toBe("panel-view-dict");
    await expect
      .poll(async () => (await panel.boundingBox())?.height ?? 0)
      .toBeGreaterThan(100);

    staged.releaseRoute();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(panel).not.toHaveClass(/\bdrawer-minimized\b/);
    expect((await panel.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  });

  test("reader: a #hash deep link stays open across both chunks", async ({
    page,
  }) => {
    const staged = await openStaged(
      page,
      `${READER}#reader-toc-drawer`,
      "#reader-toc-btn",
      "morcus-reader-view"
    );
    const drawer = page.locator("#reader-toc-drawer");
    // Where the browser has applied `:target` (Firefox does at once; Chromium
    // only at `load`, after every chunk), the No-JS drawer shows.
    const expectNativeDrawer = async () => {
      if ((await targetId(page)) === "reader-toc-drawer") {
        await expect(drawer).toBeVisible();
      }
    };
    await expectNativeDrawer();

    await staged.enterIntermediate();
    await expectNativeDrawer();
    // `common.js` must not consume the hash before its owner can adopt it.
    expect(await page.evaluate(() => location.hash)).toBe("#reader-toc-drawer");

    staged.releaseRoute();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("reader: a hashchange while reader.js is loading is adopted", async ({
    page,
  }) => {
    const staged = await openStaged(
      page,
      READER,
      "#reader-toc-btn",
      "morcus-reader-view"
    );
    await staged.enterIntermediate();
    await page.evaluate(() => {
      location.hash = "#reader-toc-drawer";
    });
    const drawer = page.locator("#reader-toc-drawer");
    await expect(drawer).toBeVisible();

    staged.releaseRoute();
    await expectUpgraded(page, "morcus-reader-view");
    await expect(drawer).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
  });

  test("dictionary: in-page links work while dict.js is still loading", async ({
    page,
  }) => {
    const staged = await openStaged(
      page,
      "/v2/dicts?q=habeo",
      ".dict-card",
      "morcus-dict-search"
    );
    await staged.enterIntermediate();
    const link = page.locator("a.jump-pill[href^='#']").last();
    const href = (await link.getAttribute("href"))!;
    await link.click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(href);
    await expect(page.locator(href)).toBeInViewport();

    staged.releaseRoute();
    await expectUpgraded(page, "morcus-dict-search");
    await expect(page.locator(href)).toBeInViewport();
  });

  test("reader dictionary iframe: in-page links work while its dict.js is loading", async ({
    page,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 1280) <= 640,
      "The dictionary iframe is collapsed on mobile"
    );
    const frameUrl = /\/v2\/dicts\?.*embedded=1/;
    const staged = await openStaged(
      page,
      `${READER}?q=habeo`,
      "#dict-frame",
      "morcus-dict-search",
      frameUrl
    );
    await staged.enterIntermediate();
    const frame = page.frameLocator("#dict-frame");
    const link = frame.locator("a.jump-pill[href^='#']").last();
    const href = (await link.getAttribute("href"))!;
    await link.click();
    await expect(frame.locator(href)).toBeInViewport();

    staged.releaseRoute();
    await expect(frame.locator("morcus-dict-search")).toHaveAttribute(
      "data-upgraded",
      "",
      { timeout: 15000 }
    );
    await expect(frame.locator(href)).toBeInViewport();
  });

  test("reader: TOC link works natively when reader.js fails to load", async ({
    page,
  }) => {
    // The realistic case for the owner check (docs/archive/CHUNK_ORDERING_ADR.md §8): common.js
    // arrives, so the anchor handler installs at page ready, but the route
    // chunk never does (flaky network, deploy skew).
    await page.route(V2_SCRIPTS, (route) =>
      COMMON_SCRIPT.test(route.request().url())
        ? route.continue()
        : route.abort()
    );
    await page.goto(READER);
    await page.waitForLoadState("load");
    await expect(page.locator("html")).toHaveAttribute("data-js-failed", "");
    expect(
      await page.evaluate(() => ({
        common: customElements.get("morcus-report-dialog") !== undefined,
        reader: customElements.get("morcus-reader-view") !== undefined,
      }))
    ).toEqual({ common: true, reader: false });

    await page.locator("#reader-toc-btn").click();
    await expect.poll(() => targetId(page)).toBe("reader-toc-drawer");
    await expect(page.locator("#reader-toc-drawer")).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe("#reader-toc-drawer");
  });
});
