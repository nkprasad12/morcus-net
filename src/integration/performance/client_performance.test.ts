/* istanbul ignore file */

import { setEnv } from "@/integration/utils/set_test_env";
const PORT = "1337";
const TEST_TMP_DIR = "tmp_all_functional_test";
const REUSE_DEV = process.env.REUSE_DEV === "1" || false;
const FROM_DOCKER = process.env.FROM_DOCKER === "1" || false;
setEnv(REUSE_DEV, PORT, TEST_TMP_DIR);

// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, Page, Metrics } from "puppeteer";
import { setupMorcusBackendWithCleanup } from "@/integration/utils/morcus_integration_setup";
import {
  ALL_SCREEN_SIZES,
  setSize,
  type ScreenSize,
  checkTitleIs,
  waitForText,
} from "@/integration/utils/puppeteer_utils";
import { checkPresent } from "@/common/assert";
import fs from "fs";
import { arrayMap } from "@/common/data_structures/collect_map";

// @ts-ignore
global.location = {
  origin: "http://localhost:1337",
};

setupMorcusBackendWithCleanup(FROM_DOCKER, REUSE_DEV, PORT, TEST_TMP_DIR);

describe("Client Performance Tests", () => {
  let browser: Browser | undefined = undefined;
  let currentPage: Page | undefined = undefined;

  const allMetrics = arrayMap<string, Metrics>();

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: "new", product: "chrome" });
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(global.location.origin, [
      "clipboard-read",
      "clipboard-write",
    ]);
  });

  beforeEach(async () => {
    currentPage = await checkPresent(browser).newPage();
  });

  afterEach(async () => {
    await currentPage?.close();
    currentPage = undefined;
  });

  afterAll(async () => {
    console.log(allMetrics.map);
    fs.promises.writeFile(
      "metrics.json",
      JSON.stringify([...allMetrics.map.entries()], undefined, 2)
    );
    await currentPage?.close();
    await browser?.close();
  });

  async function getSizedPage(size: ScreenSize): Promise<Page> {
    const page = checkPresent(currentPage);
    await setSize(size, page);
    return page;
  }

  it.each(ALL_SCREEN_SIZES(50))(
    "metrics for landing %s screen #%s",
    async (screenSize) => {
      const page = await getSizedPage(screenSize);
      await page.goto(global.location.origin);
      await checkTitleIs("Morcus Latin Tools", page);
      expect(page.url()).toMatch(/\/dicts$/);

      const metrics = await page.metrics();
      const key = JSON.stringify([screenSize, "habeo"]);
      allMetrics.add(key, metrics);
    }
  );

  it.each(ALL_SCREEN_SIZES(50))(
    "metrics for habeo %s screen #%s",
    async (screenSize) => {
      const page = await getSizedPage(screenSize);
      await page.goto(`${global.location.origin}/dicts/id/n20077`);
      await waitForText("HABETO", page);

      const metrics = await page.metrics();
      const key = JSON.stringify([screenSize, "landing"]);
      allMetrics.add(key, metrics);
    }
  );
});
