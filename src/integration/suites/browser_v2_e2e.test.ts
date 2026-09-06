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
    await page.locator('form.v2-search-form button[type="submit"]').click();

    // Verify native HTTP GET navigation and SSR response
    await expect(page).toHaveURL(/\/v2\/dicts\?q=habeo/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.getByText("Lewis").first()).toBeVisible();
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
    await expect(page.getByText("Lewis").first()).toBeVisible();
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
    await expect(page.getByText("Lewis").first()).toBeVisible();
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
    await expect(page.getByText("Lewis").first()).toBeVisible();
  });

  test("allows navigating between Dictionary and About via app bar without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    await expect(page.locator("header.v2-app-bar")).toBeVisible();

    // Click About link in the app bar
    await page.locator('.v2-nav a:has-text("About")').click();
    await expect(page).toHaveURL(/\/v2\/about$/);
    await expect(page.locator("h1")).toContainText("About");
    await expect(page.getByText("GPL-3.0")).toBeVisible();
    await expect(page.getByText("CC BY-SA 4.0")).toBeVisible();

    // Navigate back to Dictionary via app bar
    await page.locator('.v2-nav a:has-text("Dictionary")').click();
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
    await page.locator('.v2-nav a:has-text("About")').click();
    await expect(page).toHaveURL(/\/v2\/about$/);
    await expect(page.locator("h1")).toContainText("About");
    await expect(page.getByText("Perseus project")).toBeVisible();

    // Navigate back to Dictionary via app bar
    await page.locator('.v2-nav a:has-text("Dictionary")').click();
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
    await expect(page.getByText("Lewis").first()).toBeVisible();
  });

  test("loads entries by ID directly via /v2/dicts/id/:id", async ({
    page,
  }) => {
    await page.goto("/v2/dicts/id/n20077");
    await expect(page).toHaveTitle(/ID n20077/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();
    await expect(page.getByText("Lewis").first()).toBeVisible();
    await expect(
      page.locator(".v2-dict-card .v2-entry-content").getByText("hold").first()
    ).toBeVisible();
  });

  test("renders collapsible outline and section anchor permalinks", async ({
    page,
  }) => {
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

    // Clicking anchor sets window location hash
    await anchor.click();
    expect(page.url()).toContain("#");
  });

  test("click-to-lookup linkifies Latin words and navigates on click (No-JS)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts?q=habeo");
    const wordLink = page.locator('.v2-lat-word:has-text("habere")').first();
    await expect(wordLink).toBeVisible();

    // Clicking the word navigates natively to /v2/dicts?q=habere
    await wordLink.click();
    await expect(page).toHaveURL(/\/v2\/dicts\?q=habere/);
    await expect(page.locator(".v2-dict-card").first()).toBeVisible();

    await context.close();
  });

  test("click-to-lookup linkifies Latin words and navigates on click (JS enabled)", async ({
    page,
  }) => {
    await page.goto("/v2/dicts?q=habeo");
    const wordLink = page.locator('.v2-lat-word:has-text("habere")').first();
    await expect(wordLink).toBeVisible();

    // Clicking the word follows standard browser navigation
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
    await expect(nav.getByText("Jump:")).toBeVisible();

    // Verify individual entry headword button exists and links to anchor
    const headwordBtn = page.locator(".v2-entry-headword").first();
    await expect(headwordBtn).toBeVisible();
    await expect(headwordBtn).toHaveAttribute("href", /^#[a-zA-Z0-9_-]+/);

    // Verify jump link navigates to anchor
    const jumpLink = nav.locator(".v2-entry-nav-link").nth(1);
    await jumpLink.click();
    expect(page.url()).toMatch(/#[a-zA-Z0-9_-]+/);
  });
});
