import { test, expect } from "@playwright/test";

test.describe("UI V2 dictionary", () => {
  test("loads results without JavaScript (No-JS fallback)", async ({
    browser,
  }) => {
    // Disable JavaScript to test pure HTML/SSR baseline
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/v2/dicts");
    await expect(page.locator("h1")).toHaveText("Morcus Latin Dictionary");
    await expect(page.locator("form.v2-search-form")).toBeVisible();

    // Type query and submit native HTML form
    await page.locator('input[name="q"]').fill("habeo");
    await page.locator('button[type="submit"]').click();

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
    await expect(page.locator(".v2-theme-toggle-btn")).not.toBeVisible();

    await context.close();
  });

  test("toggles theme and persists preference with JavaScript enabled", async ({
    page,
  }) => {
    await page.goto("/v2/dicts");
    const toggleBtn = page.locator(".v2-theme-toggle-btn");
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

    const toggleBtn = page.locator(".v2-theme-toggle-btn");
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
});
