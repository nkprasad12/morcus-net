/* istanbul ignore file */

import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { checkPresent } from "@/common/assert";
import fs from "fs";
import { arrayMap } from "@/common/data_structures/collect_map";
import { repeatedTest } from "@/integration/utils/playwright_utils";

test.describe("Client Performance Tests", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Performance tests rely on Chrome DevTools APIs to get data."
  );

  const allMetrics = arrayMap<string, object>();
  let client: CDPSession | null = null;

  test.beforeEach(async ({ page }) => {
    client = await page.context().newCDPSession(page);
    await client.send("Performance.enable");
  });

  test.afterEach(async () => {
    if (client) {
      await client.detach();
      client = null;
    }
  });

  test.afterAll(async ({ browserName, viewport }) => {
    if (browserName !== "chromium") {
      return;
    }
    fs.promises.writeFile(
      `${browserName}-${viewport?.width}x${viewport?.height}.metrics.json`,
      JSON.stringify([...allMetrics.map.entries()], undefined, 2)
    );
    allMetrics.map.clear();
  });

  async function collectMetrics(page: Page, tag: string) {
    const metrics = await client!.send("Performance.getMetrics");
    const size = checkPresent(page.viewportSize()?.width) < 400;
    const key = JSON.stringify([size, tag]);
    allMetrics.add(key, metrics.metrics);
  }

  repeatedTest("metrics for landing", 50, async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Morcus Latin Tools");
    await collectMetrics(page, "landing");
  });

  repeatedTest("metrics for habeo", 50, async ({ page }) => {
    await page.goto(`/dicts/id/n20077`);
    await expect(page.getByText("HABETO").first()).toBeVisible();
    await collectMetrics(page, "habeo");
  });
});
