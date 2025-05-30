/* istanbul ignore file */

import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { assertType, checkPresent } from "@/common/assert";
import fs from "fs";
import { repeatedTest } from "@/integration/utils/playwright_utils";
import { isNumber } from "@/web/utils/rpc/parsing";
import {
  E2E_RAW_METRICS_DIR,
  type PerformanceTestResult,
} from "@/perf/e2e_perf";
import { safeParseInt } from "@/common/misc_utils";

type Metric = { name: string; value: number };
type ClientPerfData = Metric[];

const N = safeParseInt(process.env.PERF_TEST_ITERATIONS) ?? 1;
const CPU_THROTTLE = safeParseInt(process.env.CPU_THROTTLE);

const LCP = "LargestContentfulPaint";
const MEM_METRICS = new Set([
  "JSHeapUsedSize",
  "JSHeapTotalSize",
  "JSHeapMaxUsed",
  "JSHeapMaxTotal",
]);
const PERF_METRICS = new Set([
  "LayoutDuration",
  "RecalcStyleDuration",
  "ScriptDuration",
  "ThreadTime",
  "ProcessTime",
  LCP,
]);
const ALL_METRICS = new Set([...MEM_METRICS, ...PERF_METRICS]);

async function largestContentfulPaint(page: Page): Promise<Metric> {
  const lcp = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      new PerformanceObserver((l) => {
        const entries = l.getEntries();
        // the last entry is the largest contentful paint
        const largestPaintEntry = entries.at(-1);
        if (!largestPaintEntry) {
          reject(new Error("No largest contentful paint entry found."));
          return;
        }
        resolve(largestPaintEntry.startTime);
      }).observe({
        type: "largest-contentful-paint",
        buffered: true,
      });
    });
  });
  return { name: LCP, value: assertType(lcp, isNumber) };
}

function groupedMetrics(
  allMetrics: ClientPerfData[]
): Record<string, number[]> {
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
  return byKey;
}

test.describe("Client Performance Tests", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Performance tests rely on Chrome DevTools APIs to get data."
  );

  let client: CDPSession | null = null;
  let runMemory: { total: number; used: number }[] = [];
  let collectorHandle: NodeJS.Timeout | undefined = undefined;

  test.beforeEach(async ({ page }) => {
    client = await page.context().newCDPSession(page);
    if (CPU_THROTTLE !== undefined) {
      await client.send("Emulation.setCPUThrottlingRate", {
        rate: CPU_THROTTLE,
      });
    }
    await client.send("Performance.enable");
    runMemory = [];
    const collector = async () => {
      const metrics = await client!.send("Performance.getMetrics");
      const total = metrics.metrics.find((m) => m.name === "JSHeapTotalSize");
      const used = metrics.metrics.find((m) => m.name === "JSHeapUsedSize");
      if (total && used) {
        runMemory.push({ total: total.value, used: used.value });
      }
    };
    collectorHandle = setInterval(collector, 16);
  });

  test.afterEach(async () => {
    if (client) {
      await client.detach();
      client = null;
    }
  });

  async function collectMetrics(page: Page, tag: string) {
    if (collectorHandle) {
      clearInterval(collectorHandle);
    }
    const maxTotalMem = Math.max(...runMemory.map((m) => m.total)) ?? 0;
    const maxUsedMem = Math.max(...runMemory.map((m) => m.used)) ?? 0;
    await client!.send("HeapProfiler.collectGarbage");
    const metrics = await client!.send("Performance.getMetrics");
    const lcp = await largestContentfulPaint(page);
    const allMetrics = metrics.metrics.concat([
      lcp,
      { name: "JSHeapMaxUsed", value: maxTotalMem },
      { name: "JSHeapMaxTotal", value: maxUsedMem },
    ]);

    const size =
      checkPresent(page.viewportSize()?.width) < 400 ? "small" : "large";
    const rawName = `${tag}-${size}-${Math.random()}.metrics.json`;
    const result: PerformanceTestResult = {
      testId: { name: tag, screenSize: size },
      metrics: groupedMetrics([allMetrics]),
    };
    await fs.promises.writeFile(
      `${E2E_RAW_METRICS_DIR}/${rawName}`,
      JSON.stringify(result)
    );
  }

  repeatedTest("metrics for dict landing", N, async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Morcus Latin Tools");
    await collectMetrics(page, "dicts-landing");
  });

  repeatedTest("metrics for dict-LS unda", N, async ({ page }) => {
    await page.goto(`/dicts/id/n49758`);
    await expect(page.getByText("Water, moisture").first()).toBeVisible();
    await collectMetrics(page, "dicts-ls-unda");
  });

  repeatedTest("metrics for dict-LS habeo", N, async ({ page }) => {
    await page.goto(`/dicts/id/n20077`);
    await expect(page.getByText("HABETO").first()).toBeVisible();
    await collectMetrics(page, "dicts-ls-habeo");
  });

  repeatedTest("metrics for reader DBG", N, async ({ page }) => {
    await page.goto(`/work/caesar/de_bello_gallico?id=1.1`);
    await expect(page.getByText("Pyrenaeos").first()).toBeVisible();
    await collectMetrics(page, "work-de-bello-gallico");
  });

  repeatedTest("metrics for reader DRN", N, async ({ page }) => {
    await page.goto(`/work/lucretius/de_rerum_natura?id=1`);
    await expect(page.getByText("lumina").first()).toBeVisible();
    await collectMetrics(page, "work-de-rerum-natura");
  });

  repeatedTest("metrics for library", N, async ({ page }) => {
    await page.goto(`/library`);
    await expect(page.getByText("Julius Caesar").first()).toBeVisible();
    await collectMetrics(page, "library");
  });
});
