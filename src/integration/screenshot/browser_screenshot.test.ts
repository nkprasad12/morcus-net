import { test, expect } from "@playwright/test";

import { DARK_TAG, screenshotTest } from "@/integration/utils/playwright_utils";

test.describe("screenshot tests", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!testInfo.tags.includes(DARK_TAG)) {
      return;
    }
    await page.goto("/");
    await page.getByLabel("dark mode").click();
  });

  screenshotTest("dicts landing", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot();
  });

  screenshotTest("library landing", async ({ page }) => {
    await page.goto("/library");
    await expect(page).toHaveScreenshot();
  });
});
