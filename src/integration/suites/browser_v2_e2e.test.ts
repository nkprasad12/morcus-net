import { test, expect } from "@playwright/test";

test.describe("UI V2 dictionary", () => {
  test("loads results without JavaScript (No-JS fallback)", async ({
    browser,
  }) => {
    // Disable JavaScript to test pure HTML/SSR baseline
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    await expect(page.locator("form.v2-search-form")).toBeVisible();

    // Type query and submit native HTML form
    await page.locator('input[name="q"]').fill("habeo");
    // Note: the search form also contains the dictionary-selection pane's
    // "Apply Selection" submit button when JS is disabled, so target the
    // search button by its own class rather than by [type="submit"].
    await page.locator("form.v2-search-form .v2-search-btn").click();

    // Verify native HTTP GET navigation and SSR response. The native submission
    // also serializes the settings pane's inputs, so `q` is not necessarily
    // the first query parameter.
    await expect(page).toHaveURL(/\/v2\/dicts\?.*\bq=habeo\b/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".v2-dict-card .v2-entry-content").getByText("hold").first()
    ).toBeVisible();

    await context.close();
  });

  test("loads results by typing and enter (JS enhanced)", async ({ page }) => {
    await page.goto("/v2/dicts");

    const input = page.locator('input[name="q"]');
    await input.click();
    await input.fill("habeo");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/v2\/dicts\?q=habeo/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".v2-dict-card .v2-entry-content").getByText("hold").first()
    ).toBeVisible();
  });

  test("supports inflected form searches without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=habuit");
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".v2-dict-card .v2-entry-content").getByText("hold").first()
    ).toBeVisible();

    await context.close();
  });

  test("loads autocomplete suggestions and searches on suggestion click", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");

    const input = page.locator('input[name="q"]');
    await input.click();
    await page.keyboard.type("hab", { delay: 30 });

    // Wait for the reactive suggestions overlay created by Lit component
    const suggestionItem = page.locator(".v2-suggestion-item").first();
    await expect(suggestionItem).toBeVisible({ timeout: 5000 });

    // Click the first suggestion
    const suggestedWord = (await suggestionItem.textContent())?.trim();
    expect(suggestedWord).toBeTruthy();
    await suggestionItem.click();

    // Verify results updated for the clicked word
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
  });

  test("allows navigating between Dictionary and About via app bar without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    await expect(page.locator("header.v2-app-bar")).toBeVisible();

    // Click About link in the app bar (handles desktop bar or mobile dropdown menu)
    if (await page.locator(".v2-mobile-menu-btn").isVisible()) {
      await page.locator(".v2-mobile-menu-btn").click();
      await page
        .locator('.v2-mobile-menu-dropdown a:has-text("About")')
        .click();
    } else {
      await page.locator('.v2-nav-desktop a:has-text("About")').click();
    }
    await expect(page).toHaveURL(/\/v2\/about$/);
    await expect(page.locator("h1")).toContainText("About");
    await expect(page.getByText("GPL-3.0")).toBeVisible();
    await expect(page.getByText("CC BY-SA 4.0")).toBeVisible();

    // Navigate back to Dictionary via app bar
    if (await page.locator(".v2-mobile-menu-btn").isVisible()) {
      await page.locator(".v2-mobile-menu-btn").click();
      await page
        .locator('.v2-mobile-menu-dropdown a:has-text("Dictionary")')
        .click();
    } else {
      await page.locator('.v2-nav-desktop a:has-text("Dictionary")').click();
    }
    await expect(page).toHaveURL(/\/v2\/dicts$/);
    await expect(page.locator('input[name="q"]')).toBeVisible();

    await context.close();
  });

  test("allows navigating between Dictionary and About via app bar (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    await expect(page.locator("header.v2-app-bar")).toBeVisible();

    // Click About link in the app bar
    if (await page.locator(".v2-mobile-menu-btn").isVisible()) {
      await page.locator(".v2-mobile-menu-btn").click();
      await page
        .locator('.v2-mobile-menu-dropdown a:has-text("About")')
        .click();
    } else {
      await page.locator('.v2-nav-desktop a:has-text("About")').click();
    }
    await expect(page).toHaveURL(/\/v2\/about$/);
    await expect(page.locator("h1")).toContainText("About");
    await expect(page.getByText("Perseus project")).toBeVisible();

    // Navigate back to Dictionary via app bar
    if (await page.locator(".v2-mobile-menu-btn").isVisible()) {
      await page.locator(".v2-mobile-menu-btn").click();
      await page
        .locator('.v2-mobile-menu-dropdown a:has-text("Dictionary")')
        .click();
    } else {
      await page.locator('.v2-nav-desktop a:has-text("Dictionary")').click();
    }
    await expect(page).toHaveURL(/\/v2\/dicts$/);
    await expect(page.locator('input[name="q"]')).toBeVisible();
  });

  test("hides theme toggle button when JavaScript is disabled", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    await expect(page.locator("header.v2-app-bar")).toBeVisible();
    await expect(
      page.locator("morcus-theme-toggle .v2-theme-toggle-btn")
    ).not.toBeVisible();

    await context.close();
  });

  test("toggles theme and persists preference with JavaScript enabled", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    const toggleBtn = page.locator("morcus-theme-toggle .v2-theme-toggle-btn");
    await expect(toggleBtn).toBeVisible();

    // Click theme toggle button
    await toggleBtn.click();

    // Verify data-theme is set on html element
    const theme1 = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme1).toMatch(/^(dark|light)$/);

    // Click again to toggle to opposite theme
    await toggleBtn.click();
    const theme2 = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme2).toMatch(/^(dark|light)$/);
    expect(theme2).not.toEqual(theme1);

    // Verify localStorage has persisted darkMode setting
    const stored = await page.evaluate(() =>
      localStorage.getItem("GlobalSettings")
    );
    expect(stored).toBeTruthy();
    expect(stored).toContain("darkMode");
  });

  test("toggles theme without clearing active dictionary entry", async ({
    page,
  }) => {
    await page.goto("/v2/dicts?q=habeo");
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();

    const toggleBtn = page.locator("morcus-theme-toggle .v2-theme-toggle-btn");
    await expect(toggleBtn).toBeVisible();

    // Click theme toggle button
    await toggleBtn.click();

    // Verify URL, search input, and dictionary entry remain active and are not cleared
    await expect(page).toHaveURL(/\/v2\/dicts\?q=habeo/);
    await expect(page.locator('input[name="q"]')).toHaveValue("habeo");
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
  });

  test("loads entries by ID directly via /v2/dicts/id/:id", async ({
    page,
  }) => {
    await page.goto("/v2/dicts/id/n20077");
    await expect(page).toHaveTitle(/ID n20077/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");
    await expect(
      page.locator(".v2-dict-card .v2-entry-content").getByText("hold").first()
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
    await page.goto("/v2/dicts?q=habeo");
    const outlineSummary = page
      .locator('.v2-tool-pane summary:has-text("Outline")')
      .first();
    await expect(outlineSummary).toBeVisible();

    // Click to open outline drawer
    await outlineSummary.click();
    await expect(page.locator(".v2-toc-list").first()).toBeVisible();

    // Verify section anchor bullet has #hash href
    const anchor = page.locator(".v2-section-anchor").first();
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

    // Clicking copies an article-qualified permalink rather than jumping. The
    // fragment alone would be useless to a recipient: it names a sense but not
    // the article it lives in.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/v2\/dicts\/id\/n20077#n20077/);

    // Copying must not move the viewport or rewrite the address bar.
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("renders subsection match banner with working jump chips (No-JS baseline)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=proximus");

    const note = page.locator(".v2-subsection-note").first();
    await expect(note).toBeVisible();
    await expect(note).toContainText("Matched");

    const chips = note.locator(".v2-subsection-chip");
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
    await page.goto("/v2/dicts?q=proximus");

    const chips = page.locator(".v2-subsection-note .v2-subsection-chip");
    await expect(chips).toHaveCount(3);

    await chips.nth(2).click();

    const target = page.locator('[id="n38913.16"]');
    await expect(target).toHaveClass(/v2-target-active/);
    await expect(target).toBeInViewport();
  });

  test("marks matched subsections in the entry body", async ({ page }) => {
    await page.goto("/v2/dicts?q=proximus");

    const hits = page.locator(".v2-entry-content .v2-subsection-hit");
    await expect(hits).toHaveCount(3);
    await expect(hits.first()).toHaveAttribute("aria-current", "location");
  });

  test("resolves subsection anchors that were merged into the entry blurb", async ({
    page,
  }) => {
    // `abbatissa` records a subsection id of `n36.0`, but L&S merges that first
    // sense into the opening blurb so no such element is ever emitted. The
    // anchor must fall back to `n36.blurb` rather than becoming a dead link.
    await page.goto("/v2/dicts?q=abbatissa");

    const link = page.locator(".v2-subsection-note .v2-subsection-namelink");
    await expect(link).toHaveAttribute("href", "#n36.blurb");
    await expect(page.locator('[id="n36.0"]')).toHaveCount(0);
    await expect(page.locator('[id="n36.blurb"]')).toHaveClass(
      /v2-subsection-hit/
    );

    await link.click();
    await expect(page.locator('[id="n36.blurb"]')).toBeInViewport();
  });

  test("renders clean text without word links in No-JS mode (accessible fallback)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=habeo");
    // Ensure no word link elements exist in No-JS mode
    const wordLinks = page.locator(".v2-lat-word");
    await expect(wordLinks).toHaveCount(0);
    // Ensure content is still rendered as readable text
    await expect(page.locator(".v2-entry-content").first()).toContainText(
      "habere"
    );

    await context.close();
  });

  test("click-to-lookup progressively enhances Latin words and navigates on click (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/v2/dicts?q=habeo");
    const wordLink = page.locator('.v2-lat-word:has-text("habere")').first();
    await expect(wordLink).toBeVisible();

    // Clicking the word triggers client-side lookup
    await wordLink.click();
    await expect(page).toHaveURL(/\/v2\/dicts\?q=habere/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
  });

  test("report issue button is hidden without JavaScript (No-JS baseline)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    const reportDialogEl = page.locator("morcus-report-dialog");
    await expect(reportDialogEl).toBeHidden();

    await context.close();
  });

  test("report issue button is displayed and interactive when JS is enabled", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    const reportBtn = page.locator(".v2-report-btn");
    await expect(reportBtn).toBeVisible();
  });

  test("opens report dialog on click and closes via Cancel button", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    const reportBtn = page.locator(".v2-report-btn");
    const dialog = page.locator("dialog.v2-report-dialog");

    await expect(dialog).not.toBeVisible();
    await reportBtn.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Issues / Feedback")).toBeVisible();
    await expect(
      dialog.getByText("This report will be visible to the general public")
    ).toBeVisible();

    const textarea = dialog.locator("textarea.v2-report-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");

    const reporterInput = dialog.locator("input.v2-report-reporter");
    await expect(reporterInput).toBeVisible();

    const cancelBtn = dialog.locator(
      'button[data-dialog-close]:has-text("Cancel")'
    );
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test("closes report dialog via Escape key", async ({ page }) => {
    await page.goto("/v2/dicts");
    const reportBtn = page.locator(".v2-report-btn");
    const dialog = page.locator("dialog.v2-report-dialog");

    await reportBtn.click();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("submits issue report via AJAX and shows confirmation", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    const reportBtn = page.locator(".v2-report-btn");
    const dialog = page.locator("dialog.v2-report-dialog");

    await reportBtn.click();
    await expect(dialog).toBeVisible();

    const textarea = dialog.locator("textarea.v2-report-textarea");
    await textarea.fill("Typo report in amicus");

    const reporterInput = dialog.locator("input.v2-report-reporter");
    await reporterInput.fill("E2E Tester");

    const submitBtn = dialog.locator(".v2-report-submit-btn");
    await submitBtn.click();

    const status = dialog.locator(".v2-report-status");
    await expect(status).toHaveText(
      /✓ Thank you! Your report has been submitted./
    );

    // Dialog closes automatically after confirmation timeout
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("renders entry headers, dividers, and jump links for multi-entry dictionaries", async ({
    page,
  }) => {
    await page.goto("/v2/dicts?q=cum");
    // Verify multi-entry dictionary has quick-jump bar
    const nav = page.locator(".v2-entry-nav").first();
    await expect(nav).toBeVisible();
    await expect(nav.getByText("Jump to")).toBeVisible();

    // The headword is inert text; the permalink lives in its own pill.
    const headword = page.locator(".v2-entry-headword").first();
    await expect(headword).toBeVisible();
    await expect(headword).not.toHaveAttribute("href", /./);

    const copyPill = page.locator(".v2-copy-pill").first();
    await expect(copyPill).toBeVisible();
    await expect(copyPill).toHaveAttribute("href", /^\/v2\/dicts\/id\/.+/);

    // Verify jump link navigates to anchor
    const jumpLink = nav.locator(".v2-entry-nav-link").nth(1);
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
    await page.goto("/v2/dicts?q=habeo");

    const copyPill = page.locator(".v2-copy-pill").first();
    await expect(copyPill).toBeVisible();
    const urlBefore = page.url();
    await copyPill.click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^https?:\/\/.+\/v2\/dicts\/id\/n20077$/);
    // The article is already on screen, so copying must not spend a server
    // render navigating to it.
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("#v2-toast")).toBeVisible();
  });

  test("article permalink is a working link without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/v2/dicts?q=habeo");

    const copyPill = page.locator(".v2-copy-pill").first();
    await expect(copyPill).toBeVisible();
    // No JS means no clipboard interception, so the anchor must still be a
    // genuinely navigable permalink rather than a decorative control.
    await copyPill.click();
    await expect(page).toHaveURL(/\/v2\/dicts\/id\/n20077$/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();

    await context.close();
  });

  test("renders abbreviation with tabindex and title in No-JS baseline", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=habeo");
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();

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
    await page.goto("/v2/dicts?q=habeo");
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();

    const abbr = page.locator(".lsHover").first();
    await expect(abbr).toBeVisible();
    const originalTitle =
      (await abbr.getAttribute("title")) ||
      (await abbr.getAttribute("data-abbr-expansion"));
    expect(originalTitle).toBeTruthy();

    const popover = page.locator("#v2-abbr-popover");
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
    await page.locator(".v2-container").click({ position: { x: 5, y: 5 } });
    await expect(popover).not.toBeVisible();
  });

  test("exposes usable dictionary settings without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=habeo");

    // The settings pane is server-rendered and reachable without JS: the
    // trigger is a <details> summary, so it toggles natively.
    const settings = page.locator("morcus-dict-settings");
    await expect(settings).toBeVisible();

    const popover = settings.locator(".v2-settings-popover");
    await expect(popover).not.toBeVisible();
    await settings.locator(".v2-settings-btn").click();
    await expect(popover).toBeVisible();

    // Without JS the pane offers an explicit submit button to apply changes.
    const applyBtn = popover.locator(".v2-settings-apply-btn");
    await expect(applyBtn).toBeVisible();

    // Narrow the selection to Lewis and Short and apply it via a native GET.
    const checkboxes = popover.locator(".v2-dict-checkbox");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const box = checkboxes.nth(i);
      if ((await box.getAttribute("value")) !== "L&S") {
        await box.uncheck();
      }
    }
    await applyBtn.click();

    // The selection round-trips through the URL and results still render.
    await expect(page).toHaveURL(/q=habeo/);
    await expect(page).toHaveURL(/dict=L%26S/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.locator(".v2-dict-title").first()).toContainText("Lewis");

    await context.close();
  });

  test("adjusts highlight strength via quick menu and persists to localStorage", async ({
    page,
  }) => {
    await page.goto("/v2/dicts?q=habeo");
    await expect(page.locator(".v2-settings-btn").first()).toBeVisible();

    // Verify initial scale is 1
    const initialScale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    );
    expect(initialScale === "1" || initialScale === "").toBe(true);

    // Open settings popover
    await page.locator(".v2-settings-btn").first().click();
    const popover = page.locator(".v2-settings-popover").first();
    await expect(popover).toBeVisible();

    // Adjust slider to 80%
    const slider = popover.locator(".v2-settings-slider");
    await slider.fill("80");
    await slider.dispatchEvent("input");
    await slider.dispatchEvent("change");

    // Verify CSS scale updated on documentElement
    const vividScale = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    );
    expect(vividScale).toBe("1.6");

    // Verify persistence in localStorage
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("GlobalSettings") || "{}")
    );
    expect(stored.highlightStrength).toBe(80);

    // Close on Escape
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();
  });

  test("supports reader sidebar dictionary search in the embedded frame", async ({
    page,
  }) => {
    await page.goto("/v2/reader");

    // Verify "Embedded Dictionary" header text is removed
    await expect(page.locator(".v2-reader-dict-title")).toHaveCount(0);

    // The sidebar dictionary is hosted in an iframe pointing at /v2/dicts?embedded=1.
    await expect(page.locator("aside.v2-reader-dict-panel")).toBeAttached();
    const frame = page.frameLocator("#v2-dict-frame");

    // Verify search form and settings button exist inside the embedded dictionary
    const dictSearch = frame.locator("form.v2-search-form");
    await expect(dictSearch).toBeVisible();
    await expect(dictSearch.locator(".v2-settings-btn")).toBeVisible();

    // The embedded page hides the app bar so it does not duplicate the reader's.
    await expect(frame.locator("header.v2-app-bar")).toHaveCount(0);

    // Search for a word via the embedded search bar. Submit with Enter rather
    // than clicking: on mobile the dictionary panel is a partially-collapsed
    // bottom sheet whose drag handle overlays the top of the iframe.
    const dictInput = dictSearch.locator('input[name="q"]');
    await dictInput.fill("Gallia");
    await dictInput.press("Enter");

    // Verify dictionary results render inside the frame
    await expect(frame.locator(".v2-dict-card").first()).toBeVisible();
    await expect(frame.locator(".v2-dict-title").first()).toContainText(
      "Lewis"
    );
  });
});
