import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { gzipSync } from "zlib";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import { disableSmoothScroll } from "@/integration/utils/playwright_utils";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  V2_BUNDLE_BUDGET,
  sumRouteSizes,
  type V2SizeTotal,
} from "@/bundler/client_bundle_budget";
import {
  V2_JS_CHUNKS,
  V2_ROUTES,
  v2RouteScripts,
  type V2JsChunkName,
  type V2Route,
} from "@/bundler/client_build_contract";

/**
 * Fetches one page per route and returns the hashed asset URLs they reference.
 * Together the routes must load every chunk, so a chunk that is built but
 * never loaded by any route fails here, as does a route whose `<script>` tags
 * are not exactly its dependency chain, in order.
 */
async function collectV2AssetPaths(request: APIRequestContext): Promise<{
  chunkPaths: Map<V2JsChunkName, string>;
  cssPath: string;
}> {
  const routeUrls: Record<V2Route, string> = {
    about: "/about",
    dicts: "/dicts",
    library: "/library",
    corpus: "/corpus",
    external: "/externalReader",
    macronizer: "/macronizer",
  };
  const chunkPaths = new Map<V2JsChunkName, string>();
  let cssPath: string | undefined;
  for (const route of V2_ROUTES) {
    const res = await request.get(routeUrls[route]);
    expect(res.status()).toBe(200);
    const html = await res.text();

    const served = [
      ...html.matchAll(
        /<script\s+type="module"\s+src="(\/assets\/([a-z]+)\.[a-f0-9]+\.js)"[^>]*>/g
      ),
    ];
    // The server emits exactly the route's dependency chain, in order.
    expect(served.map((m) => `${m[2]}.js`)).toEqual(v2RouteScripts(route));
    for (const m of served) {
      chunkPaths.set(`${m[2]}.js` as V2JsChunkName, m[1]);
    }

    cssPath ??= html.match(
      /<link\s+rel="stylesheet"\s+href="(\/assets\/app\.[a-f0-9]+\.css)">/
    )?.[1];
  }
  expect(new Set(chunkPaths.keys())).toEqual(new Set(V2_JS_CHUNKS));
  expect(cssPath).toBeDefined();
  return { chunkPaths, cssPath: cssPath! };
}

/**
 * Opens the mobile navigation drawer and waits for its slide-in animation to
 * finish. Clicking a link mid-slide makes Playwright's actionability retries
 * stall on MobileChrome when JavaScript is disabled, so settle it first.
 * The check is a synchronous `evaluate` polled from the test: with JS
 * disabled, Firefox never settles a promise awaited inside `evaluate`
 * (neither `Animation.finished` nor a timer), which hung the test.
 */
async function openMobileMenu(page: Page): Promise<void> {
  await page.locator(".mobile-menu-btn").click();
  const dropdown = page.locator(".mobile-menu-dropdown");
  await expect
    .poll(() =>
      dropdown.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length
      )
    )
    .toBe(0);
}

test.describe("UI V2 dictionary", () => {
  test("loads results without JavaScript (No-JS fallback)", async ({
    browser,
  }) => {
    // Disable JavaScript to test pure HTML/SSR baseline
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts");
    await expect(page.locator("form.search-form")).toBeVisible();

    // Type query and submit native HTML form
    await page.locator('input[name="q"]').fill("habeo");
    // Note: the search form also contains the dictionary-selection pane's
    // "Apply Selection" submit button when JS is disabled, so target the
    // search button by its own class rather than by [type="submit"].
    await page.locator("form.search-form .search-btn").click();

    // Verify native HTTP GET navigation and SSR response. The native submission
    // also serializes the settings pane's inputs, so `q` is not necessarily
    // the first query parameter.
    await expect(page).toHaveURL(/\/dicts\?.*\bq=habeo\b/);
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".dict-card .entry-content").getByText("hold").first()
    ).toBeVisible();

    await context.close();
  });

  test("loads results by typing and enter (JS enhanced)", async ({ page }) => {
    await page.goto("/dicts");

    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("habeo");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/dicts\?q=habeo/);
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".dict-card .entry-content").getByText("hold").first()
    ).toBeVisible();
  });

  test("supports inflected form searches without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts?q=habuit");
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".dict-card .entry-content").getByText("hold").first()
    ).toBeVisible();

    await context.close();
  });

  test("loads autocomplete suggestions and searches on suggestion click", async ({
    page,
  }) => {
    await page.goto("/dicts");

    const input = page.locator('input[name="q"]');
    await input.click();
    await page.keyboard.type("hab", { delay: 30 });

    // Wait for the reactive suggestions overlay created by Web Component
    const suggestionItem = page.locator(".suggestion-item").first();
    await expect(suggestionItem).toBeVisible({ timeout: 5000 });

    // Click the first suggestion
    const suggestedWord = (await suggestionItem.textContent())?.trim();
    expect(suggestedWord).toBeTruthy();
    await suggestionItem.click();

    // Verify results updated for the clicked word
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toBeVisible();
  });

  test("allows navigating between Dictionary and About via app bar without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts");
    await expect(page.locator("header.app-bar")).toBeVisible();

    // Click About link in the app bar (handles desktop bar or mobile dropdown menu)
    if (await page.locator(".mobile-menu-btn").isVisible()) {
      await openMobileMenu(page);
      await page.locator('.mobile-menu-dropdown a:has-text("About")').click();
    } else {
      await page.locator('.nav-desktop a:has-text("About")').click();
    }
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator(".about-article h2").first()).toContainText(
      "Site"
    );
    await expect(page.getByText("GPL-3.0")).toBeVisible();
    await expect(page.getByText("CC BY-SA 4.0")).toBeVisible();

    // Navigate back to Dictionary via app bar
    if (await page.locator(".mobile-menu-btn").isVisible()) {
      await openMobileMenu(page);
      await page
        .locator('.mobile-menu-dropdown a:has-text("Dictionary")')
        .click();
    } else {
      await page.locator('.nav-desktop a:has-text("Dictionary")').click();
    }
    await expect(page).toHaveURL(/\/dicts$/);
    await expect(page.locator('input[name="q"]')).toBeVisible();

    await context.close();
  });

  test("allows navigating between Dictionary and About via app bar (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/dicts");
    await expect(page.locator("header.app-bar")).toBeVisible();

    // Click About link in the app bar
    if (await page.locator(".mobile-menu-btn").isVisible()) {
      await openMobileMenu(page);
      await page.locator('.mobile-menu-dropdown a:has-text("About")').click();
    } else {
      await page.locator('.nav-desktop a:has-text("About")').click();
    }
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator(".about-article h2").first()).toContainText(
      "Site"
    );
    await expect(page.getByText("Perseus project")).toBeVisible();

    // Navigate back to Dictionary via app bar
    if (await page.locator(".mobile-menu-btn").isVisible()) {
      await openMobileMenu(page);
      await page
        .locator('.mobile-menu-dropdown a:has-text("Dictionary")')
        .click();
    } else {
      await page.locator('.nav-desktop a:has-text("Dictionary")').click();
    }
    await expect(page).toHaveURL(/\/dicts$/);
    await expect(page.locator('input[name="q"]')).toBeVisible();
  });

  test("hides the Appearance menu button when JavaScript is disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts");
    await expect(page.locator("header.app-bar")).toBeVisible();
    await expect(page.locator("#appearance-btn")).not.toBeVisible();

    await context.close();
  });

  test("sets the theme from the Appearance menu and persists it", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const menuBtn = page.locator("#appearance-btn");
    await expect(menuBtn).toBeVisible();

    await menuBtn.click();
    await expect(page.locator("#appearance-popover")).toBeVisible();

    await page
      .locator('label:has(input[name="appearance-theme"][value="dark"])')
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page
      .locator('label:has(input[name="appearance-theme"][value="light"])')
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    const stored = await page.evaluate(() =>
      localStorage.getItem("GlobalSettings")
    );
    expect(stored).toContain('"darkMode":false');

    // System clears the saved choice, so the OS scheme applies again.
    await page
      .locator('label:has(input[name="appearance-theme"][value="system"])')
      .click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);

    // The choice survives a reload (pre-paint snapshot and settings).
    await page
      .locator('label:has(input[name="appearance-theme"][value="dark"])')
      .click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("changing appearance keeps the active dictionary entry", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    await expect(page.locator(".dict-card").first()).toBeVisible();

    await page.locator("#appearance-btn").click();
    await page
      .locator('label:has(input[name="appearance-font"][value="serif"])')
      .click();
    await page.locator("#appearance-size-inc").click();

    await expect(page).toHaveURL(/\/dicts\?q=habeo/);
    await expect(page.locator("#dict-q")).toHaveValue("habeo");
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    const fontFamily = await page
      .locator(".entry")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toContain("Georgia");
  });

  test("the dictionary settings link opens the Appearance menu", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    await page.locator("#dict-settings-btn").click();
    await page.locator("#dict-appearance-link").click();
    await expect(page.locator("#appearance-popover")).toBeVisible();
    await expect(page.locator("dialog#dict-settings")).not.toBeVisible();
  });

  test("loads entries by ID directly via /dicts/id/:id", async ({ page }) => {
    await page.goto("/dicts/id/n20077");
    await expect(page).toHaveTitle(/ID n20077/);
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".dict-card .entry-content").getByText("hold").first()
    ).toBeVisible();
  });

  test("renders collapsible outline and section anchor permalinks", async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await page.goto("/dicts?q=habeo");
    const outlineSummary = page
      .locator('.tool-pane summary:has-text("Outline")')
      .first();
    if (await outlineSummary.isVisible()) {
      // On narrow viewports (< 1080px), the per-entry Outline pill toggles the
      // inline outline drawer. Collapse it again before measuring scrollBefore
      // so the expanded outline does not push the first section anchor behind
      // the fixed bottom TOC sheet.
      const inlineToc = page.locator(".tool-outline .toc-list").first();
      await outlineSummary.click();
      await expect(inlineToc).toBeVisible();
      await outlineSummary.click();
      await expect(inlineToc).not.toBeVisible();
    } else {
      // On desktop (>= 1080px), .has-toc hides the inline .tool-outline pill
      // because the sticky left TOC rail is permanently open.
      await expect(
        page.locator("morcus-dict-toc .toc-list").first()
      ).toBeVisible();
    }

    // Verify section anchor bullet has #hash href
    const anchor = page.locator(".section-anchor").first();
    await expect(anchor).toBeVisible();
    const href = await anchor.getAttribute("href");
    expect(href).toMatch(/^#n20077/);

    // Playwright's click() scrolls the target into view first, so the scroll
    // position has to be settled BEFORE it is measured or this assertion would
    // pass vacuously.
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const urlBefore = page.url();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await anchor.click();
    const copyMenuBtn = page.locator(
      '.section-action-menu [data-action="copy"]'
    );
    await expect(copyMenuBtn).toBeVisible();
    await copyMenuBtn.click();

    // Clicking "Copy permalink" copies an article-qualified permalink rather
    // than jumping. The fragment alone would be useless to a recipient: it
    // names a sense but not the article it lives in. WebKit rejects
    // `navigator.clipboard.readText()` in `page.evaluate` outside a user gesture.
    if (browserName !== "webkit") {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toMatch(/\/dicts\/id\/n20077#n20077/);
    }
    await expect(page.locator("#toast")).toBeVisible();

    // Copying must not move the viewport or rewrite the address bar.
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("section action menu sits under its anchor and dismisses on click-away, Escape, and scroll", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    const anchor = page.locator(".section-anchor").first();
    const menu = page.locator(".section-action-menu");
    await expect(anchor).toBeVisible();

    const openMenu = async () => {
      await anchor.scrollIntoViewIfNeeded();
      await anchor.click();
      await expect(menu).toBeVisible();
      await expect(anchor).toHaveAttribute("aria-expanded", "true");
    };

    // Opens directly below its anchor (8px gap).
    await openMenu();
    const anchorBox = await anchor.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(anchorBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(
      Math.abs(menuBox!.y - (anchorBox!.y + anchorBox!.height + 8))
    ).toBeLessThanOrEqual(2);

    // Click-away dismisses it (the original tester report).
    await page.locator("#dict-q").click();
    await expect(menu).not.toBeVisible();
    await expect(anchor).toHaveAttribute("aria-expanded", "false");

    // Escape dismisses it and returns focus to the anchor.
    await openMenu();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(anchor).toBeFocused();

    // Scrolling the anchor's scroller dismisses it, rather than leaving it
    // floating away from its anchor.
    await openMenu();
    await anchor.evaluate((el) => {
      let node: HTMLElement | null = el.parentElement;
      while (node) {
        const { overflowY } = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          node.scrollBy(0, 150);
          return;
        }
        node = node.parentElement;
      }
      window.scrollBy(0, 150);
    });
    await expect(menu).not.toBeVisible();
  });

  test("renders subsection match banner with working jump chips (No-JS baseline)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts?q=proximus");

    const note = page.locator(".subsection-note").first();
    await expect(note).toBeVisible();
    await expect(note).toContainText("Matched");

    const chips = note.locator(".subsection-chip");
    await expect(chips).toHaveCount(3);

    // Every chip must point at an element that actually exists in the entry.
    const count = await chips.count();
    for (let i = 0; i < count; i++) {
      const href = await chips.nth(i).getAttribute("href");
      expect(href).toMatch(/^#n38913/);
      await expect(page.locator(`[id="${href!.slice(1)}"]`)).toHaveCount(1);
    }

    // Native anchor navigation works with no JavaScript at all.
    await chips.nth(1).click();
    expect(page.url()).toContain("#n38913.14");

    await context.close();
  });

  test("jump chip scrolls to and highlights the matched subsection (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/dicts?q=proximus");

    const chips = page.locator(".subsection-note .subsection-chip");
    await expect(chips).toHaveCount(3);

    await chips.nth(2).click();

    const target = page.locator('[id="n38913.16"]');
    await expect(target).toHaveClass(/target-active/);
    await expect(target).toBeInViewport();
  });

  test("marks matched subsections in the entry body", async ({ page }) => {
    await page.goto("/dicts?q=proximus");

    const hits = page.locator(".entry-content .subsection-hit");
    await expect(hits).toHaveCount(3);
    await expect(hits.first()).toHaveAttribute("aria-current", "location");
  });

  test("resolves subsection anchors that were merged into the entry blurb", async ({
    page,
  }) => {
    // `abbatissa` records a subsection id of `n36.0`, but L&S merges that first
    // sense into the opening blurb so no such element is ever emitted. The
    // anchor must fall back to `n36.blurb` rather than becoming a dead link.
    await page.goto("/dicts?q=abbatissa");

    const link = page.locator(".subsection-note .subsection-namelink");
    await expect(link).toHaveAttribute("href", "#n36.blurb");
    await expect(page.locator('[id="n36.0"]')).toHaveCount(0);
    await expect(page.locator('[id="n36.blurb"]')).toHaveClass(
      /subsection-hit/
    );

    await link.click();
    await expect(page.locator('[id="n36.blurb"]')).toBeInViewport();
  });

  test("renders clean text without word links in No-JS mode (accessible fallback)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts?q=habeo");
    // Ensure no word link elements exist in No-JS mode
    const wordLinks = page.locator(".lat-word");
    await expect(wordLinks).toHaveCount(0);
    // Ensure content is still rendered as readable text
    await expect(page.locator(".entry-content").first()).toContainText(
      "habere"
    );

    await context.close();
  });

  test("click-to-lookup progressively enhances Latin words and navigates on click (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    // On small screens the TOC drawer covers the link, so Playwright re-scrolls
    // before clicking; see `disableSmoothScroll` for why that flakes in Firefox.
    await disableSmoothScroll(page);
    const wordLink = page.locator('.lat-word:has-text("habere")').first();
    await expect(wordLink).toBeVisible();

    // Clicking the word triggers client-side lookup
    await wordLink.click();
    await expect(page).toHaveURL(/\/dicts\?q=habere/);
    await expect(page.locator(".dict-card").first()).toBeVisible();
  });

  test("'/' focuses the search box and pre-fills it from a selected word", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    const word = page.locator('.lat-word:has-text("habere")').first();
    await expect(word).toBeVisible();

    // Select the word with a real DOM range rather than a (double-)click,
    // which would also look the word up.
    await word.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.keyboard.press("/");

    const input = page.locator("#dict-q");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("habere");
    // The query is selected, so typing replaces it.
    await page.keyboard.type("amo");
    await expect(input).toHaveValue("amo");
  });

  test("words are plain spans until hovered, then middle-click opens a new tab", async ({
    page,
    context,
    isMobile,
    hasTouch,
  }) => {
    test.skip(isMobile || hasTouch, "Touch has no hover or middle-click.");
    await page.goto("/dicts?q=habeo");
    await disableSmoothScroll(page);
    const word = page.locator('.lat-word:has-text("habere")').first();
    await expect(word).toBeVisible();

    // At rest a word is not a link or a control, so it is not in the tab
    // order or in a screen reader's links list.
    await expect(word).toHaveJSProperty("localName", "span");
    await expect(word).not.toHaveAttribute("href", /.*/);
    await expect(word).not.toHaveAttribute("tabindex", /.*/);

    // Hovering swaps it for a real link, which is what the browser's own
    // middle-click / "Open in new tab" need.
    await word.hover();
    await expect(word).toHaveJSProperty("localName", "a");
    await expect(word).toHaveAttribute("href", /\/dicts\?q=habere/);
    // ...but still not a tab stop.
    await expect(word).toHaveAttribute("tabindex", "-1");

    const newPage = context.waitForEvent("page");
    await word.click({ button: "middle" });
    const opened = await newPage;
    await expect(opened).toHaveURL(/\/dicts\?q=habere/);
    await opened.close();
    // The original page did not navigate.
    await expect(page).toHaveURL(/\/dicts\?q=habeo/);
  });

  test("report issue button is hidden without JavaScript (No-JS baseline)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts");
    const reportDialogEl = page.locator("morcus-report-dialog");
    await expect(reportDialogEl).toBeHidden();

    await context.close();
  });

  test("report issue button is displayed and interactive when JS is enabled", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const reportBtn = page.locator(".report-btn");
    await expect(reportBtn).toBeVisible();
  });

  test("opens report dialog on click and closes via Cancel button", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const reportBtn = page.locator(".report-btn");
    const dialog = page.locator("dialog.report-dialog");

    await expect(dialog).not.toBeVisible();
    await reportBtn.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Issues / Feedback")).toBeVisible();
    await expect(
      dialog.getByText("This report will be visible to the general public")
    ).toBeVisible();

    const textarea = dialog.locator("textarea.report-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");

    const reporterInput = dialog.locator("input.report-reporter");
    await expect(reporterInput).toBeVisible();

    const cancelBtn = dialog.locator(
      'button[data-dialog-close]:has-text("Cancel")'
    );
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test("closes report dialog via Escape key", async ({ page }) => {
    await page.goto("/dicts");
    const reportBtn = page.locator(".report-btn");
    const dialog = page.locator("dialog.report-dialog");

    await reportBtn.click();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("submits issue report via AJAX and shows confirmation", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const reportBtn = page.locator(".report-btn");
    const dialog = page.locator("dialog.report-dialog");

    await reportBtn.click();
    await expect(dialog).toBeVisible();

    const textarea = dialog.locator("textarea.report-textarea");
    await textarea.fill("Typo report in amicus");

    const reporterInput = dialog.locator("input.report-reporter");
    await reporterInput.fill("E2E Tester");

    const submitBtn = dialog.locator(".report-submit-btn");
    await submitBtn.click();

    const status = dialog.locator(".report-status");
    await expect(status).toHaveText(
      /✓ Thank you! Your report has been submitted./
    );

    // Dialog closes automatically after confirmation timeout
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("renders entry headers, dividers, and jump links for multi-entry dictionaries", async ({
    page,
  }) => {
    await page.goto("/dicts?q=cum");
    // Verify multi-entry dictionary has quick-jump links (inline .entry-nav on
    // narrow viewports, or .toc-entries-summary in the desktop left TOC rail).
    const nav = page.locator(".entry-nav").first();
    const useInlineEntryNav = await nav.isVisible();
    if (useInlineEntryNav) {
      await expect(nav.getByText("Jump to")).toBeVisible();
    } else {
      await expect(page.locator(".toc-entries-summary")).toBeVisible();
    }

    // The headword is inert text; the permalink lives in its own pill.
    const headword = page.locator(".entry-headword").first();
    await expect(headword).toBeVisible();
    await expect(headword).not.toHaveAttribute("href", /./);

    const copyPill = page.locator(".copy-pill").first();
    await expect(copyPill).toBeVisible();
    await expect(copyPill).toHaveAttribute("href", /^\/dicts\/id\/.+/);

    // Verify jump link navigates to anchor
    const jumpLink = useInlineEntryNav
      ? nav.locator(".entry-nav-link").nth(1)
      : page.locator(".toc-entries-summary .toc-entry-chip").nth(1);
    await jumpLink.click();
    expect(page.url()).toMatch(/#[a-zA-Z0-9_-]+/);
  });

  test("copies the article permalink without navigating", async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    }
    await page.goto("/dicts?q=habeo");

    const copyPill = page.locator(".copy-pill").first();
    await expect(copyPill).toBeVisible();
    const urlBefore = page.url();
    await copyPill.click();

    if (browserName !== "webkit") {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toMatch(/^https?:\/\/.+\/dicts\/id\/n20077$/);
    }
    // The article is already on screen, so copying must not spend a server
    // render navigating to it.
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("#toast")).toBeVisible();
  });

  test("article permalink is a working link without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/dicts?q=habeo");

    const copyPill = page.locator(".copy-pill").first();
    await expect(copyPill).toBeVisible();
    // No JS means no clipboard interception, so the anchor must still be a
    // genuinely navigable permalink rather than a decorative control.
    await copyPill.click();
    await expect(page).toHaveURL(/\/dicts\/id\/n20077$/);
    await expect(page.locator(".dict-card").first()).toBeVisible();

    await context.close();
  });

  test("renders abbreviation with tabindex and title in No-JS baseline", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts?q=habeo");
    await expect(page.locator(".dict-card").first()).toBeVisible();

    const abbr = page.locator(".lsHover").first();
    await expect(abbr).toBeVisible();
    await expect(abbr).toHaveAttribute("tabindex", "0");
    const title = await abbr.getAttribute("title");
    expect(title).toBeTruthy();

    // Verify element can receive focus
    await abbr.focus();
    await expect(abbr).toBeFocused();

    await context.close();
  });

  test("opens floating popover on clicking expandable abbreviation (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    await expect(page.locator(".dict-card").first()).toBeVisible();

    const abbr = page.locator(".lsHover").first();
    await expect(abbr).toBeVisible();
    const originalTitle =
      (await abbr.getAttribute("title")) ||
      (await abbr.getAttribute("data-abbr-expansion"));
    expect(originalTitle).toBeTruthy();

    const popover = page.locator("#abbr-popover");
    await expect(popover).not.toBeVisible();

    // Click abbreviation to open popover
    await abbr.click();
    await expect(popover).toBeVisible();
    await expect(popover).toHaveText(originalTitle!);

    // Verify popover stays within viewport boundaries (no clipping)
    const popBox = await popover.boundingBox();
    expect(popBox).not.toBeNull();
    if (popBox) {
      expect(popBox.x).toBeGreaterThanOrEqual(0);
      const viewport = page.viewportSize();
      if (viewport) {
        expect(popBox.x + popBox.width).toBeLessThanOrEqual(
          viewport.width + 10
        );
      }
    }

    // Dismiss popover via Escape key
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();

    // Reopen by clicking and dismiss by clicking away
    await abbr.click();
    await expect(popover).toBeVisible();
    await page.locator(".container").click({ position: { x: 5, y: 5 } });
    await expect(popover).not.toBeVisible();

    // A second click on the same abbreviation toggles it closed. (Unlike
    // native `popover="auto"`, pointerdown does not close the popover before
    // the click handler runs.)
    await abbr.click();
    await expect(popover).toBeVisible();
    await abbr.click();
    await expect(popover).not.toBeVisible();
  });

  test("exposes usable dictionary settings without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/dicts?q=habeo");

    // The settings dialog is server-rendered and reachable without JS: the trigger is a
    // `#dict-settings` link, and `:target` shows the dialog as a full-screen overlay.
    const dialog = page.locator("dialog#dict-settings");
    await expect(dialog).not.toBeVisible();
    await page.locator("#dict-settings-btn").click();
    await expect(page).toHaveURL(/#dict-settings$/);
    await expect(dialog).toBeVisible();

    // Done submits the dialog's own form; the close button needs JS, so it isn't shown.
    const doneBtn = dialog.locator(".dict-settings-done");
    await expect(doneBtn).toBeVisible();
    await expect(dialog.locator(".dialog-close-btn")).not.toBeVisible();

    // Narrow the selection to Lewis and Short and apply it via a native GET.
    const checkboxes = dialog.locator(".dict-checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const box = checkboxes.nth(i);
      if ((await box.getAttribute("value")) !== "L&S") {
        await box.uncheck();
      }
    }
    await doneBtn.click();

    // The selection round-trips through the URL and results still render.
    await expect(page).toHaveURL(/q=habeo/);
    await expect(page).toHaveURL(/d=1/);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".dict-card").first()).toBeVisible();
    await expect(page.locator(".dict-title").first()).toContainText("Lewis");

    // Done is an explicit save: the server set the cookie, then redirected the `save` marker
    // away so the address bar can't carry it into a shared link.
    await expect(page).not.toHaveURL(/save=/);
    const saved = (await context.cookies()).find((c) => c.name === "morcus_d");
    expect(saved?.value).toBe("1"); // L&S

    // Back from an opened dialog leaves without changes.
    await page.locator("#dict-settings-btn").click();
    await expect(dialog).toBeVisible();
    await dialog.locator('.dict-checkbox[value="GAF"]').check();
    await page.goBack();
    await expect(dialog).not.toBeVisible();
    const kept = (await context.cookies()).find((c) => c.name === "morcus_d");
    expect(kept?.value).toBe("1");

    // Opening a link with a different selection shows it but does not overwrite the cookie.
    await page.goto("/dicts?q=habeo&d=2");
    await expect(page.locator('.dict-checkbox[value="GAF"]')).toBeChecked();
    await expect(page.locator('.dict-checkbox[value="L&S"]')).not.toBeChecked();
    const after = (await context.cookies()).find((c) => c.name === "morcus_d");
    expect(after?.value).toBe("1");

    // Guest mode: the link's settings are read-only, and a new search keeps them.
    await expect(page.locator(".guest-chip")).toBeVisible();
    await expect(page.locator('.dict-checkbox[value="GAF"]')).toBeDisabled();
    await expect(page.locator('[name="save"]')).toHaveCount(0);
    await page.locator("#dict-q").fill("amo");
    await page.locator("#dict-q").press("Enter");
    await expect(page).toHaveURL(/q=amo/);
    await expect(page).toHaveURL(/d=2/);
    await expect(page.locator(".guest-chip")).toBeVisible();

    // Return goes back to the saved selection.
    await page.locator(".guest-chip .guest-return").click();
    await expect(page).not.toHaveURL(/d=2/);
    await expect(page.locator('.dict-checkbox[value="L&S"]')).toBeChecked();
    await expect(page.locator('.dict-checkbox[value="L&S"]')).toBeEnabled();
    await expect(page.locator(".guest-chip")).toHaveCount(0);

    await context.close();
  });

  test("dictionary settings apply when the dialog closes (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    await expect(page.locator(".dict-title").first()).toBeVisible();
    const dialog = page.locator("dialog#dict-settings");
    const trigger = page.locator("#dict-settings-btn");

    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // The hash never changes with JS: the element opens the dialog itself.
    await expect(page).not.toHaveURL(/#dict-settings/);

    // Toggling inside the dialog changes nothing behind it.
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/dicts")) requests.push(r.url());
    });
    const checkboxes = dialog.locator(".dict-checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const box = checkboxes.nth(i);
      if ((await box.getAttribute("value")) !== "GAF") {
        await box.uncheck();
      } else {
        await box.check();
      }
    }
    await expect(page.locator(".lang-chips")).not.toContainText("Fr");
    expect(requests).toEqual([]);

    // The dialog is modal: the search box behind it can't take focus or Enter.
    await page.keyboard.press("Tab");
    await expect(page.locator("#dict-q")).not.toBeFocused();

    // Done applies: one fetch, the URL and tray follow, and the cookie is saved.
    await dialog.locator(".dict-settings-done").click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator(".dict-title").first()).toContainText("Gaffiot");
    await expect(page).toHaveURL(new RegExp(`d=${encodeDictBitmask(["GAF"])}`));
    const saved = (await page.context().cookies()).find(
      (c) => c.name === "morcus_d"
    );
    expect(saved?.value).toBe(encodeDictBitmask(["GAF"]));

    // A new search keeps what's on screen.
    await page.locator("#dict-q").fill("amo");
    await page.locator("#dict-q").press("Enter");
    await expect(page).toHaveURL(/q=amo/);
    await expect(page.locator(".dict-title").first()).toContainText("Gaffiot");

    // Escape also applies.
    await trigger.click();
    await dialog.locator('.dict-checkbox[value="L&S"]').check();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`d=${encodeDictBitmask(["L&S", "GAF"])}`)
    );
  });

  test("guest mode locks a shared link's settings until Restore saved (JS enabled)", async ({
    page,
    baseURL,
  }) => {
    const readDictCookie = async () =>
      (await page.context().cookies()).find((c) => c.name === "morcus_d")
        ?.value;
    await page
      .context()
      .addCookies([{ name: "morcus_d", value: "1", url: baseURL! }]); // L&S

    await page.goto("/dicts?q=habeo&d=2"); // GAF
    await expect(page.locator(".guest-chip")).toBeVisible();
    await page.locator("#dict-settings-btn").click();
    await expect(page.locator(".settings-guest-note")).toBeVisible();
    await expect(page.locator('.dict-checkbox[value="FOR"]')).toBeDisabled();

    // Done only closes.
    await page.locator("#dict-settings .dict-settings-done").click();
    await expect(page.locator("dialog#dict-settings")).not.toBeVisible();
    await expect(page).toHaveURL(/d=2/);

    // A new search keeps the link's settings.
    await page.locator("#dict-q").fill("amo");
    await page.locator("#dict-q").press("Enter");
    await expect(page).toHaveURL(/q=amo/);
    await expect(page).toHaveURL(/d=2/);
    await expect(page.locator("#dict-results")).toContainText("aimer");
    await expect(page.locator(".dict-title").first()).toContainText("Gaffiot");
    expect(await readDictCookie()).toBe("1");

    // Restore saved goes back to the user's own settings, which are editable again.
    await page.locator(".guest-chip .guest-return").click();
    await expect(page).not.toHaveURL(/d=2/);
    await expect(page.locator(".guest-chip")).toHaveCount(0);
    await expect(page.locator('.dict-checkbox[value="L&S"]')).toBeEnabled();
    expect(await readDictCookie()).toBe("1");
  });

  test("adjusts highlight strength via quick menu and persists to localStorage", async ({
    page,
  }) => {
    await page.goto("/dicts?q=habeo");
    await expect(page.locator("#dict-settings-btn")).toBeVisible();

    // Verify initial scale is 1
    const initialScale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--highlight-scale")
    );
    expect(initialScale === "1" || initialScale === "").toBe(true);

    // Open the settings dialog
    await page.locator("#dict-settings-btn").click();
    const dialog = page.locator("dialog#dict-settings");
    await expect(dialog).toBeVisible();

    // Adjust slider to 80%; strength stays live while the dialog is open.
    const slider = dialog.locator(".settings-slider");
    await slider.fill("80");
    await slider.dispatchEvent("input");
    await slider.dispatchEvent("change");

    // Verify CSS scale updated on documentElement
    const vividScale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--highlight-scale")
    );
    expect(vividScale).toBe("1.6");

    // Verify persistence in localStorage
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("GlobalSettings") || "{}")
    );
    expect(stored.highlightStrength).toBe(80);

    // Close on Escape
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("supports reader sidebar dictionary search in the embedded frame", async ({
    page,
  }) => {
    await page.goto("/work/caesar/de_bello_gallico/1.1");

    // Verify "Embedded Dictionary" header text is removed
    await expect(page.locator(".reader-dict-title")).toHaveCount(0);

    // The sidebar dictionary is hosted in an iframe pointing at /dicts?embedded=1.
    const dictPanel = page.locator("aside.reader-dict-panel");
    await expect(dictPanel).toBeAttached();

    // On mobile viewports (<= 640px) without an initial ?q=, the bottom-sheet
    // drawer starts minimized with its iframe container hidden; tap the
    // Dictionary tab in the bottom bar to expand the drawer first.
    if ((page.viewportSize()?.width ?? 1280) <= 640) {
      await page.locator("#panel-tab-dict").click();
      await expect(dictPanel).not.toHaveClass(/\bdrawer-minimized\b/);
    }

    // Without an initial ?q= in JS mode, the dictionary starts on its landing
    // card until the reader presses '/' (or clicks a word).
    await expect(dictPanel.locator(".reader-dict-landing")).toBeVisible();
    await page.keyboard.press("/");

    const frame = page.frameLocator("#dict-frame");

    // Verify search form and settings button exist inside the embedded dictionary
    const dictSearch = frame.locator("form.search-form");
    await expect(dictSearch).toBeVisible();
    await expect(dictSearch.locator(".settings-btn")).toBeVisible();

    // The embedded page hides the app bar so it does not duplicate the reader's.
    await expect(frame.locator("header.app-bar")).toHaveCount(0);

    // Search for a word via the embedded search bar. Submit with Enter rather
    // than clicking: on mobile the dictionary panel is a partially-collapsed
    // bottom sheet whose drag handle overlays the top of the iframe.
    const dictInput = dictSearch.locator('input[name="q"]');
    await dictInput.fill("Gallia");
    await dictInput.press("Enter");

    // Verify dictionary results render inside the frame
    await expect(frame.locator(".dict-card").first()).toBeVisible();
    await expect(frame.locator(".dict-title").first()).toContainText("Lewis");
  });

  test("'/' in the reader opens the dictionary panel and pre-fills its search box from a selected passage word", async ({
    page,
  }) => {
    // No ?q=, so the dictionary panel starts closed and its lazy iframe may
    // not have loaded yet: '/' has to wait for it.
    await page.goto("/work/caesar/de_bello_gallico/1.1");
    const word = page.locator("#reader-passage .lat-word").first();
    await expect(word).toBeVisible();
    const wordText = ((await word.textContent()) ?? "").trim();
    expect(wordText).not.toBe("");

    // Select the word with a real DOM range rather than a (double-)click,
    // which would also look the word up and load the iframe at that query.
    await word.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.keyboard.press("/");

    await expect(page.locator("aside.reader-dict-panel")).not.toHaveClass(
      /\bdrawer-minimized\b/
    );
    const dictInput = page.frameLocator("#dict-frame").locator("#dict-q");
    await expect(dictInput).toBeFocused();
    await expect(dictInput).toHaveValue(wordText);
  });

  test("dictionary landing page on mobile viewports scrolls to bottom without clipping footer or trapping scroll", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.use.isMobile &&
        testInfo.project.name !== "FirefoxSmallScreen",
      "Mobile-only viewport scroll test"
    );

    await page.goto("/dicts");
    await disableSmoothScroll(page);
    await expect(page.locator(".landing-container")).toBeVisible();

    // Verify root html document element does not leak internal overflow scrolling
    const htmlOverflowY = await page.evaluate(
      () => window.getComputedStyle(document.documentElement).overflowY
    );
    expect(htmlOverflowY).toBe("visible");

    // Scroll window to bottom
    await page.evaluate(() => {
      const maxScroll = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      window.scrollTo({ top: maxScroll, behavior: "instant" });
    });

    // Verify footer tip is fully in viewport
    const tip = page.locator(".legend-settings-tip");
    await expect(tip).toBeInViewport();

    // Verify container keeps enough bottom padding to clear the footer tip
    const paddingBottom = await page.evaluate(() => {
      const container = document.querySelector(".container");
      return container ? window.getComputedStyle(container).paddingBottom : "";
    });
    expect(parseFloat(paddingBottom)).toBeGreaterThanOrEqual(24);

    // Verify that with enlarged browser accessibility font sizes (e.g. 125% / 20px, 150% / 24px),
    // scrolling to the bottom keeps the footer tip fully in the viewport without clipping.
    // Blur the autofocused search box first: WebKit scrolls a focused input back
    // into view after a layout change, which the font-size switch below is.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    for (const fontSize of ["20px", "24px"]) {
      await page.evaluate((fs) => {
        document.documentElement.style.fontSize = fs;
        const maxScroll = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        window.scrollTo({ top: maxScroll, behavior: "instant" });
      }, fontSize);
      await page.waitForTimeout(100);
      await expect(tip).toBeInViewport();
      const tipBottom = await tip.evaluate(
        (el) => el.getBoundingClientRect().bottom
      );
      const windowHeight = await page.evaluate(() => window.innerHeight);
      expect(tipBottom).toBeLessThanOrEqual(windowHeight);
    }
  });

  test.describe("UI V2 bundle validation", () => {
    test.skip(
      ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
      "Bundle validation does not use browser rendering, so only needs to run once."
    );

    test("every route loads its chunks, and served JS and CSS are within budget", async ({
      request,
    }) => {
      // 1. Every route loads its chunks, and together they load every chunk.
      const { chunkPaths, cssPath } = await collectV2AssetPaths(request);

      // 2. Fetch and validate the CSS asset
      const cssRes = await request.get(cssPath);
      expect(cssRes.status()).toBe(200);
      expect(cssRes.headers()["content-type"]).toContain("text/css");
      expect(cssRes.headers()["cache-control"]).toContain("immutable");
      const cssBuffer = await cssRes.body();
      expect(gzipSync(cssBuffer).byteLength).toBeLessThan(
        V2_BUNDLE_BUDGET.maxCssGzipBytes
      );

      // 3. Fetch and validate each JS chunk asset
      const chunkSizes: Partial<Record<V2JsChunkName, V2SizeTotal>> = {};
      for (const [chunk, jsPath] of chunkPaths) {
        const jsRes = await request.get(jsPath);
        expect(jsRes.status()).toBe(200);
        expect(jsRes.headers()["content-type"]).toContain("javascript");
        expect(jsRes.headers()["cache-control"]).toContain("immutable");
        const jsBuffer = await jsRes.body();
        const size = {
          rawBytes: jsBuffer.byteLength,
          gzipBytes: gzipSync(jsBuffer).byteLength,
        };
        chunkSizes[chunk] = size;

        const budget = V2_BUNDLE_BUDGET.chunks[chunk];
        expect(size.gzipBytes).toBeLessThan(budget.maxGzipBytes);

        // Ensure no banned development-only strings leaked into any client chunk
        expect(jsBuffer.toString("utf8")).not.toContain("/devOnlyHelper");
      }

      // 4. Per-route JS totals
      for (const route of V2_ROUTES) {
        const total = sumRouteSizes(route, chunkSizes)!;
        const budget = V2_BUNDLE_BUDGET.routes[route];
        expect(total.gzipBytes).toBeLessThan(budget.maxGzipBytes);
      }
    });

    test("serves every asset precompressed, identical across encodings", async ({
      request,
    }) => {
      const { chunkPaths, cssPath } = await collectV2AssetPaths(request);
      const baseUrl = process.env.BASE_URL;
      // Node's fetch, not Playwright's: it sends exactly the Accept-Encoding
      // given and still decodes the body, so the encodings can be compared.
      const fetchWith = (assetPath: string, acceptEncoding: string) =>
        fetch(`${baseUrl}${assetPath}`, {
          headers: { "accept-encoding": acceptEncoding },
        });
      for (const assetPath of [cssPath, ...chunkPaths.values()]) {
        const identity = await fetchWith(assetPath, "identity");
        expect(identity.status).toBe(200);
        expect(identity.headers.get("content-encoding")).toBeNull();
        const original = await identity.text();

        for (const [acceptEncoding, expected] of [
          ["gzip, deflate, br, zstd", "br"],
          ["br", "br"],
          ["gzip", "gzip"],
        ] as const) {
          const res = await fetchWith(assetPath, acceptEncoding);
          expect(res.status).toBe(200);
          expect(res.headers.get("content-encoding")).toBe(expected);
          expect(res.headers.get(PRECOMPRESSED_HEADER)).toBe("1");
          expect(res.headers.get("cache-control")).toContain("immutable");
          expect(await res.text()).toBe(original);
        }
      }
    });
  });
});

test.describe("UI V2 corpus", () => {
  test("loads corpus landing page and executes search without JavaScript (No-JS fallback)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/corpus");
    await expect(page.locator(".corpus-welcome-card")).toBeVisible();
    await expect(page.locator("details.corpus-help")).toHaveAttribute(
      "open",
      ""
    );

    // Fill query and submit form natively
    await page.locator('input[name="q"]').fill("Roma");
    await page.locator("form.corpus-form button.search-btn").click();

    // Verify native HTTP GET navigation and SSR response
    await expect(page).toHaveURL(/\/corpus\?.*q=Roma/);
    await expect(page.locator(".corpus-result-list")).toBeVisible();
    await expect(page.locator(".corpus-result").first()).toBeVisible();

    // Verify heading links point to Reader with highlight parameters
    const firstHeading = page.locator(".corpus-result-heading").first();
    await expect(firstHeading).toBeVisible();
    await expect(firstHeading).toHaveAttribute("href", /\/work\//);

    // Verify match highlighting within the snippet
    await expect(
      page.locator(".corpus-result mark.corpus-match").first()
    ).toBeVisible();

    // Verify summary headline
    await expect(page.locator(".corpus-summary-headline")).toContainText(
      "results matching"
    );

    await context.close();
  });

  test("loads corpus results and updates title via Enter key (JS enhanced)", async ({
    page,
  }) => {
    await page.goto("/corpus");

    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("Roma");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/corpus\?q=Roma/);
    await expect(page).toHaveTitle(/Corpus: Roma/);
    await expect(page.locator(".corpus-result-list")).toBeVisible();
    await expect(page.locator(".corpus-beta-chip")).toBeVisible();
  });

  test("supports direct SSR deep-link and query parameter syncing", async ({
    page,
  }) => {
    await page.goto("/corpus?q=Roma&contextLen=25&pageSize=20&strictMode=1");

    await expect(page.locator('input[name="q"]')).toHaveValue("Roma");
    const summary = page.locator('[data-slot="settings-summary"]');
    await expect(summary).toContainText("25");
    await expect(summary).toContainText("20");
    await expect(summary).toContainText("Strict");

    await expect(page.locator(".corpus-result-list")).toBeVisible();
  });

  test("preserves form and focus during slot-swapped searches (slot swapping invariant)", async ({
    page,
  }) => {
    await page.goto("/corpus");

    // Mark the form in DOM to verify it is never recreated during slot replacement
    await page.evaluate(() => {
      document
        .querySelector("form.corpus-form")
        ?.setAttribute("data-test-preserved", "true");
    });

    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("gladius");
    await page.keyboard.press("Enter");

    await expect(page.locator(".corpus-result").first()).toBeVisible();

    // Verify form instance was preserved
    const formPreserved = await page
      .locator("form.corpus-form")
      .getAttribute("data-test-preserved");
    expect(formPreserved).toBe("true");

    // Verify focus remains in the search input
    await expect(input).toBeFocused();
  });

  test("modifies settings in the query settings tray without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/corpus?q=Roma");

    // Open settings tray
    await page.locator("details.corpus-settings summary").click();
    await expect(page.locator(".settings-popover")).toBeVisible();

    // Adjust settings inputs
    await page.locator('input[name="contextLen"]').fill("30");
    await page.locator('input[name="pageSize"]').fill("25");
    await page.locator('input[name="strictMode"]').check();

    // Apply settings via submit button
    await page.locator(".settings-apply-btn").click();

    // Verify URL parameters updated
    await expect(page).toHaveURL(/contextLen=30/);
    await expect(page).toHaveURL(/pageSize=25/);
    await expect(page).toHaveURL(/strictMode=1/);

    // Verify applied settings summary slot updated
    const summary = page.locator('[data-slot="settings-summary"]');
    await expect(summary).toContainText("30");
    await expect(summary).toContainText("25");
    await expect(summary).toContainText("Strict");

    await context.close();
  });

  test("modifies settings via slot swap with JavaScript enabled", async ({
    page,
  }) => {
    await page.goto("/corpus?q=Roma");

    // Open settings tray
    await page.locator("details.corpus-settings summary").click();
    await expect(page.locator(".settings-popover")).toBeVisible();

    // Adjust context length
    await page.locator('input[name="contextLen"]').fill("15");

    // Click Apply
    await page.locator(".settings-apply-btn").click();

    // Verify URL updated and settings popover closed
    await expect(page).toHaveURL(/contextLen=15/);
    await expect(page.locator("details.corpus-settings")).not.toHaveAttribute(
      "open",
      ""
    );

    // Verify settings summary slot reflects the change
    const summary = page.locator('[data-slot="settings-summary"]');
    await expect(summary).toContainText("15");
  });

  test("navigates result pages via Next pager and maintains focus (No-JS and JS)", async ({
    browser,
  }) => {
    // 1. No-JS pager navigation
    const context = await browser.newContext({ javaScriptEnabled: false });
    const noJsPage = await context.newPage();

    await noJsPage.goto("/corpus?q=Roma&pageSize=10");
    const nextBtnNoJs = noJsPage.locator('[data-slot="pager"] a.corpus-next');
    await expect(nextBtnNoJs).toBeVisible();
    await expect(nextBtnNoJs).toHaveAttribute("rel", "next");

    await nextBtnNoJs.click();
    await expect(noJsPage).toHaveURL(/cursor=/);
    await expect(noJsPage.locator(".corpus-summary-detail")).toContainText(
      "Showing results 11 to 20"
    );
    await context.close();

    // 2. JS pager navigation with slot swap & focus preservation
    const jsPage = await browser.newPage();
    await jsPage.goto("/corpus?q=Roma&pageSize=10");
    const nextBtnJs = jsPage.locator('[data-slot="pager"] a.corpus-next');
    await expect(nextBtnJs).toBeVisible();

    await nextBtnJs.click();
    await expect(jsPage).toHaveURL(/cursor=/);
    await expect(jsPage.locator(".corpus-summary-detail")).toContainText(
      "Showing results 11 to 20"
    );
    await expect(jsPage.locator(".corpus-summary")).toBeFocused();
    await jsPage.close();
  });

  test("restores query state via browser Back / popstate", async ({ page }) => {
    await page.goto("/corpus?q=Roma");
    await expect(page.locator('input[name="q"]')).toHaveValue("Roma");
    await expect(page.locator(".corpus-query-echo")).toHaveText("Roma");

    // Perform a second query
    const input = page.locator('input[name="q"]');
    await input.fill("Caesar");
    await page.keyboard.press("Enter");
    await expect(page.locator(".corpus-query-echo")).toHaveText("Caesar");

    // Navigate back
    await page.goBack();
    await expect(page.locator('input[name="q"]')).toHaveValue("Roma");
    await expect(page.locator(".corpus-query-echo")).toHaveText("Roma");
  });

  test("suggests authors and accepts with keyboard (autocomplete)", async ({
    page,
  }) => {
    await page.goto("/corpus");

    const input = page.locator('input[name="q"]');
    await input.click();
    await page.keyboard.type("#C", { delay: 50 });

    const suggestions = page.locator(
      "morcus-corpus-suggestions ul.corpus-suggestions"
    );
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator('li:has-text("#Caesar")')).toBeVisible();

    // Navigate down and choose with Enter
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(input).toHaveValue(/#Caesar\s+/);
  });

  test("suggests grammatical categories and lemma completions (autocomplete)", async ({
    page,
  }) => {
    await page.goto("/corpus");

    const input = page.locator('input[name="q"]');
    await input.click();
    await page.keyboard.type("@case:", { delay: 50 });

    const suggestions = page.locator(
      "morcus-corpus-suggestions ul.corpus-suggestions"
    );
    await expect(suggestions).toBeVisible();
    await expect(
      suggestions.locator('li:has-text("nominative")')
    ).toBeVisible();

    // Dismiss with Escape
    await page.keyboard.press("Escape");
    await expect(suggestions).toBeHidden();

    // Test on-demand lemma shard fetching
    await input.fill("");
    await page.keyboard.type("@lemma:a", { delay: 50 });
    await expect(suggestions).toBeVisible();
    await expect(suggestions.locator("li").first()).toBeVisible();
  });

  test("renders empty state with open syntax guide for zero-result query", async ({
    page,
  }) => {
    await page.goto("/corpus?q=xyznonexistentword");
    await expect(page.locator(".corpus-summary-headline")).toContainText(
      "No results found for"
    );
    await expect(page.locator("details.corpus-help")).toHaveAttribute(
      "open",
      ""
    );
    await expect(page.locator(".corpus-result-list")).toHaveCount(0);
  });

  test("renders inflection notice disclaimer only for inflected queries", async ({
    page,
  }) => {
    // 1. Inflected query has disclaimer
    await page.goto("/corpus?q=@case:genitive");
    await expect(
      page.locator("details.corpus-inflection-notice")
    ).toBeVisible();

    // 2. Uninflected word query does not show disclaimer
    await page.goto("/corpus?q=Roma");
    await expect(page.locator("details.corpus-inflection-notice")).toHaveCount(
      0
    );
  });
});

test.describe("UI V2 macronizer", () => {
  test("swaps dictionary results in place on word clicks, skips duplicate clicks, and preserves history.length across fallback navigations", async ({
    page,
  }) => {
    await page.goto("/macronizer");
    await disableSmoothScroll(page);

    await page
      .locator("#mac-text")
      .fill("Gallia est omnis divisa in partes tres.\n".repeat(12));
    await page.locator("#mac-submit-btn").click();

    const macPassage = page.locator("#mac-passage");
    await expect(macPassage).toBeVisible();

    const frame = page.frameLocator("#mac-dict-frame");
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    const initialHistoryLength = await page.evaluate(() => history.length);

    const wordA = macPassage.locator('a.mac-word[data-w="3"]');
    const wordB = macPassage.locator('a.mac-word[data-w="2"]');
    const wordC = macPassage.locator('a.mac-word[data-w="5"]');
    const wordAText = ((await wordA.textContent()) ?? "").trim();
    const wordBText = ((await wordB.textContent()) ?? "").trim();
    const wordCText = ((await wordC.textContent()) ?? "").trim();

    // On mobile viewports (<= 860px), the 48svh bottom drawer covers the lower
    // half of the viewport while the sticky toolbar covers the top ~90px; keep
    // the first passage line in the unobstructed band between them.
    const ensureAboveDrawer = () =>
      wordA.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < 110 || rect.bottom > 280) {
          window.scrollBy({ top: rect.top - 160, behavior: "instant" });
        }
      });

    // 1. Click word A ("divisa" / "dīvīsa"): initial /dicts?embedded=1 has no lang=La,
    // so lookup declines and falls back to navigateFrameReplace without adding a history entry.
    await ensureAboveDrawer();
    await wordA.click();
    await expect(
      frame.getByText("To force asunder", { exact: true })
    ).toBeVisible();
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength
    );

    const dictDocRequests: string[] = [];
    const dictAllRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/dicts")) {
        dictAllRequests.push(req.url());
        if (req.resourceType() === "document") {
          dictDocRequests.push(req.url());
        }
      }
    });

    // 2. Click word B ("omnis") -> in-place partial swap, no document request in frame.
    await wordB.click();
    await expect(frame.locator("#dict-q")).toHaveValue(wordBText);
    await expect(frame.locator("#dict-results")).toContainText("omnis");
    expect(dictDocRequests).toEqual([]);
    expect(
      dictAllRequests.some(
        (u) =>
          u.includes(`q=${encodeURIComponent(wordBText)}`) &&
          u.includes("format=partial")
      )
    ).toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength
    );

    // 3. Re-click word B, then click word C ("partes" / "partēs") to flush the request pipeline:
    // no request is made for the re-click on B.
    dictAllRequests.length = 0;
    await wordB.click();
    await wordC.click();
    await expect(frame.locator("#dict-q")).toHaveValue(wordCText);
    await expect(frame.locator("#dict-results")).toContainText("pars");
    expect(dictDocRequests).toEqual([]);
    expect(
      dictAllRequests.some((u) =>
        u.includes(`q=${encodeURIComponent(wordBText)}`)
      )
    ).toBe(false);
    expect(
      dictAllRequests.some(
        (u) =>
          u.includes(`q=${encodeURIComponent(wordCText)}`) &&
          u.includes("format=partial")
      )
    ).toBe(true);

    // 4. Leave lang=La via a typed search in the iframe, then click word A again ->
    // falls back to a full navigation via navigateFrameReplace and keeps top-level history.length unchanged.
    const dictInput = frame.locator("#dict-q");
    await dictInput.fill("love");
    await dictInput.press("Enter");
    await expect(frame.locator("#dict-results")).toContainText("love");
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    dictDocRequests.length = 0;
    await ensureAboveDrawer();
    await wordA.click();
    await expect(frame.locator("#dict-q")).toHaveValue(wordAText);
    await expect(
      frame.getByText("To force asunder", { exact: true })
    ).toBeVisible();
    expect(
      dictDocRequests.some(
        (u) =>
          u.includes(`q=${encodeURIComponent(wordAText)}`) &&
          u.includes("lang=La")
      )
    ).toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength
    );
  });
});
