/* istanbul ignore file */

import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { assert, checkPresent } from "@/common/assert";
import fs from "fs";
import { arrayMap } from "@/common/data_structures/collect_map";
import { repeatedTest } from "@/integration/utils/playwright_utils";
import { isArray, isNumber } from "@/web/utils/rpc/parsing";

type ClientPerfData = { name: string; value: number }[];

const MEM_METRICS = new Set(["JSHeapUsedSize", "JSHeapTotalSize"]);
const PERF_METRICS = new Set(["LayoutDuration", "RecalcStyleDuration"]);
const ALL_METRICS = new Set([...MEM_METRICS, ...PERF_METRICS]);
const RAW_METRICS_DIR = "e2e_metrics/raw_data";

function averageMetrics(allMetrics: ClientPerfData[]): Record<string, number> {
  const byKey: Record<string, number[]> = {};
  for (const singleRunMetrics of allMetrics) {
    for (const metrics of singleRunMetrics) {
      if (!ALL_METRICS.has(metrics.name)) {
        continue;
      }
      if (byKey[metrics.name] === undefined) {
        byKey[metrics.name] = [];
      }
      byKey[metrics.name].push(metrics.value);
    }
  }
  const keys = Object.keys(byKey);
  const result: Record<string, number> = {};
  for (const key of keys) {
    const allOfKey = byKey[key];
    assert(isArray(isNumber)(allOfKey), JSON.stringify(allOfKey));
    result[key] = allOfKey.reduce((a, b) => a + b, 0) / allOfKey.length;
  }
  return result;
}

test.describe("Client Performance Tests", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Performance tests rely on Chrome DevTools APIs to get data."
  );

  const allMetrics = arrayMap<string, ClientPerfData>();
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
    const rawName = `${browserName}-${viewport?.width}x${viewport?.height}.metrics.json`;
    await fs.promises.mkdir(RAW_METRICS_DIR, { recursive: true });
    await fs.promises.writeFile(
      `${RAW_METRICS_DIR}/${rawName}`,
      JSON.stringify([...allMetrics.map.entries()], undefined, 2)
    );
    for (const [key, metrics] of allMetrics.map.entries()) {
      console.log(`Metrics for ${JSON.parse(key)}:`);
      console.log(JSON.stringify(averageMetrics(metrics), undefined, 2));
    }
    allMetrics.map.clear();
  });

  async function collectMetrics(page: Page, tag: string) {
    const metrics = await client!.send("Performance.getMetrics");
    const size =
      checkPresent(page.viewportSize()?.width) < 400 ? "small" : "large";
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
