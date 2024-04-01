/* istanbul ignore file */

import { setEnv } from "@/integration/utils/set_test_env";

const PORT = "1337";
const TEST_TMP_DIR = "tmp_server_integration_test";
const REUSE_DEV = process.env.REUSE_DEV === "1" || false;
const FROM_DOCKER = process.env.FROM_DOCKER === "1" || false;
setEnv(REUSE_DEV, PORT, TEST_TMP_DIR);

import { gzipSync } from "zlib";
// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { mkdirSync, rmSync } from "fs";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { assert, checkPresent } from "@/common/assert";
import { ServerMessage } from "@/web/utils/rpc/rpc";
import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import fetch from "node-fetch";
import {
  startMorcusFromDocker,
  setupMorcus,
} from "@/integration/utils/morcus_integration_setup";
import {
  findText,
  openTab,
  setSize,
  type BrowserProduct,
  type ScreenSize,
} from "@/integration/utils/puppeteer_utils";

// @ts-ignore
global.location = {
  origin: "http://localhost:1337",
};

const SCREENSHOTS_DIR = "puppeteer_screenshots";

type Closer = () => Promise<void>;

let morcusCloser: Closer | undefined = undefined;
beforeAll(async () => {
  if (FROM_DOCKER) {
    morcusCloser = await startMorcusFromDocker();
    return;
  }
  morcusCloser = await setupMorcus(REUSE_DEV, PORT, TEST_TMP_DIR);
}, 180000);

afterAll(async () => {
  if (morcusCloser !== undefined) {
    await morcusCloser();
  }
}, 10000);

describe("bundle size check", () => {
  test("bundle size is within limit", async () => {
    const req = await fetch(`${global.location.origin}/`);
    const rootHtml = await req.text();

    const pattern = /script src="\/([\w0-9.]+\.js)"/g;
    const matches = [...rootHtml.matchAll(pattern)];
    const bundleFiles = matches.map((matchArray) => matchArray[1]);

    let totalSize = 0;
    for (const genfile of bundleFiles) {
      const jsReq = await fetch(`${global.location.origin}/${genfile}`);
      const contents = await jsReq.buffer();
      const gzipped = gzipSync(contents).byteLength;
      console.debug(`${genfile}: ${gzipped / 1024} KB`);
      totalSize += gzipped;
    }

    expect(totalSize).toBeGreaterThan(0);
    expect(totalSize / 1024).toBeLessThan(100);
  });
});

describe("morcus.net backend integration", () => {
  test("serves PWA manifest", async () => {
    const req = await fetch(`${global.location.origin}/public/pwa.webmanifest`);
    const manifest = await req.json();
    expect(manifest.name).toBe("Morcus Latin Tools");
    expect(manifest.short_name).toBe("Morcus");
  });

  test("returns LS results in uninflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "canaba",
      dicts: [LatinDict.LewisAndShort.key],
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("cannăba")).toBe(true);
  });

  test("returns LS results in inflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("billow")).toBe(true);
  });

  test("returns LS results in inflected mode with diacritics", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "occīdit",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("occīdo")).toBe(true);
    expect(articles[0].entry.toString().includes("occĭdo")).toBe(false);
  });

  test("returns LS results in inflected mode with capitals", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "Undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("wave")).toBe(true);
  });

  test("returns LS results in inflected mode with weird characters", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "Ægyptus",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).not.toHaveLength(0);
    expect(articles[0].entry.toString().includes("Aegyptus")).toBe(true);
  });

  test("returns LS results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "n1153",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("ἀηδών")).toBe(true);
  });

  test("returns SH results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "sh2708",
      dicts: [LatinDict.SmithAndHall.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("caerŭlĕus")).toBe(true);
  });

  test("returns SH results", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "influence",
      dicts: [LatinDict.SmithAndHall.key],
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(2);
    expect(articles[0].entry.toString().includes("Power exerted")).toBe(true);
    expect(articles[1].entry.toString().includes("impello")).toBe(true);
  });

  test("returns expected library result list", async () => {
    const result = await callApiFull(ListLibraryWorks, {});

    const works = result.data;
    expect(
      works.filter((work) => work.id === "phi0448.phi001.perseus-lat2")
    ).toHaveLength(1);
  });

  test("returns DBG by id", async () => {
    const result = await callApiFull(GetWork, {
      id: "phi0448.phi001.perseus-lat2",
    });
    expect(result.data.info.title).toBe("De bello Gallico");
  });

  test("returns DBG by name and author ", async () => {
    const result = await callApiFull(GetWork, {
      nameAndAuthor: {
        urlAuthor: "caesar",
        urlName: "de_bello_gallico",
      },
    });
    expect(result.data.info.title).toBe("De bello Gallico");
  });

  test("handles concurrent requests", async () => {
    const fetchHabeo = () =>
      callApiFull(DictsFusedApi, {
        query: "habeo",
        dicts: [LatinDict.LewisAndShort.key],
      });

    const requests: Promise<ServerMessage<DictsFusedResponse>>[] = [];
    for (const _ of Array(10).fill(0)) {
      requests.push(fetchHabeo());
    }
    await Promise.all(requests);

    for (const result of requests) {
      const articles = (await result).data[LatinDict.LewisAndShort.key];
      expect(articles).toHaveLength(1);
      expect(articles[0].entry.toString().includes("to have")).toBe(true);
    }
  });
});

const BROWSERS: BrowserProduct[] = ["chrome"];

const SMALL_SCREEN: ScreenSize = "small";
const LARGE_SCREEN: ScreenSize = "large";
const SIZE_VARIANTS: ScreenSize[] = [SMALL_SCREEN, LARGE_SCREEN];
const LARGE_ONLY: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    [LARGE_SCREEN].map((v) => [v, i + 1] as [ScreenSize, number])
  );
const ALL_SCREEN_SIZES: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    SIZE_VARIANTS.map((v) => [v, i + 1] as [ScreenSize, number])
  );

// Just on chrome for now, but we should add firefox later.
// It requires some extra setup steps to install the browser.
describe.each(BROWSERS)("E2E Puppeteer tests on %s", (product) => {
  let browser: Browser | undefined = undefined;
  let currentPage: Page | undefined = undefined;
  let testName: string | undefined = undefined;
  let screenSize: ScreenSize | undefined = undefined;
  let iteration: number | undefined = undefined;

  beforeAll(async () => {
    try {
      rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
    } catch {}
    try {
      mkdirSync(SCREENSHOTS_DIR);
    } catch {}
    browser = await puppeteer.launch({ headless: "new", product });
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(global.location.origin, [
      "clipboard-read",
      "clipboard-write",
    ]);
    currentPage = await checkPresent(browser).newPage();
  });

  afterAll(async () => {
    await currentPage?.close();
    await browser?.close();
  });

  async function takeScreenshot(): Promise<void> {
    const page = checkPresent(currentPage);
    const tag = `${testName}.${screenSize}.n${iteration}.png`;
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${tag}` });
  }

  function writeContext(tag: string, size: ScreenSize, i: number) {
    testName = tag;
    screenSize = size;
    iteration = i;
  }

  async function checkTitleIs(expected: string): Promise<void> {
    const page = checkPresent(currentPage);
    let title: string | undefined = undefined;
    for (let i = 0; i < 3; i++) {
      title = await page.title();
      if (title === expected) {
        break;
      }
    }
    if (title !== expected) {
      await takeScreenshot();
    }
    expect(title).toBe(expected);
  }

  async function checkHasText(text: string): Promise<void> {
    const page = checkPresent(currentPage);
    const results = await page.$x(`//*[contains(text(), "${text}")]`);
    if (results.length === 0) {
      await takeScreenshot();
      throw new Error(`Failed to find text: ${text}`);
    }
  }

  async function waitForText(
    text: string,
    parentType: string = "*",
    className?: string
  ): Promise<void> {
    const page = checkPresent(currentPage);
    const classString =
      className === undefined ? "" : `and @class="${className}"`;
    try {
      const results = await page.waitForXPath(
        `//${parentType}[contains(text(), "${text}")${classString}]`,
        { timeout: 3000 }
      );
      assert(results !== null, `Failed to find text: ${text}`);
    } catch (err) {
      await takeScreenshot();
      throw err;
    }
  }

  async function getPage(size: ScreenSize, morcusPage?: string): Promise<Page> {
    const page = await getEmptyPage(size);
    await page.goto(global.location.origin + (morcusPage || ""));
    return page;
  }

  async function getEmptyPage(size: ScreenSize): Promise<Page> {
    const page = checkPresent(currentPage);
    await setSize(size, page);
    return page;
  }

  it.each(ALL_SCREEN_SIZES(1))(
    "should load the landing page on %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize);
      writeContext("loadLanding", screenSize, i);

      await checkTitleIs("Morcus Latin Tools");
      expect(page.url()).toMatch(/\/dicts$/);
    }
  );

  it.each(ALL_SCREEN_SIZES(3))(
    "should have working tab navigation on %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize);
      writeContext("tabNav", screenSize, i);

      await openTab("About", screenSize, page);
      await checkHasText("GPL-3.0");
      await checkHasText("CC BY-SA 4.0");
    }
  );

  it.each(LARGE_ONLY(5))(
    "should load dictionary results on %s screen by typing and enter #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchTypeEnter", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("canaba", { delay: 20 });
      await page.keyboard.press("Enter");

      await checkTitleIs("canaba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(LARGE_ONLY(5))(
    "should load dictionary results on %s screen by arrows and autocomplete #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchArrowEnter", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("can", { delay: 20 });
      await checkHasText("cānăba");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      await checkTitleIs("cānăba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(ALL_SCREEN_SIZES(5))(
    "should load dictionary results on %s screen by click and autocomplete #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchClick", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("can", { delay: 20 });
      await checkHasText("cānăba");
      await (await findText("cānăba", page, "span")).click();

      await checkTitleIs("cānăba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should load about page on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/about");
      writeContext("aboutPage", screenSize, i);

      await checkHasText("GPL-3.0");
      await checkHasText("CC BY-SA 4.0");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow linkified latin words in SH %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("linkLatInSH", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("influence", { delay: 20 });
      await page.keyboard.press("Enter");

      await waitForText("cohortandum");
      await (await findText("cohortandum", page)).click();

      expect(page.url()).toContain("/dicts?q=cohortandum");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow loading entries by old id on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/dicts?q=n37007&o=2");
      writeContext("dictEntryByOldId", screenSize, i);
      await checkHasText("pondus");
      await checkHasText("a weight");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow loading LS entries by name on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/dicts?q=pondus");
      writeContext("lsEntryByName", screenSize, i);
      await checkHasText("pondus");
      await checkHasText("a weight");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow loading LS entries by new id on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/dicts/id/n37007");
      writeContext("lsEntryById", screenSize, i);
      await checkHasText("pondus");
      await checkHasText("a weight");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow loading SH entries by name on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/dicts?q=habiliment");
      writeContext("shEntryByOldId", screenSize, i);
      await checkHasText("habiliment");
      await checkHasText("garment");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow loading SH entries by new id on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/dicts/id/sh11673");
      writeContext("shEntryById", screenSize, i);
      await checkHasText("habiliment");
      await checkHasText("garment");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "allows queries from the new ID page on %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts/id/sh11673");
      writeContext("queryFromNewIdPage", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("abagio", { delay: 20 });
      await page.keyboard.press("Enter");

      await checkTitleIs("abagio | Morcus Latin Tools");
      await checkHasText("supposed etymology of adagio");
    }
  );

  it.skip.each(ALL_SCREEN_SIZES(1))(
    "allows copying id links via tooltip %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts?q=pondus");
      writeContext("copyArticleLink", screenSize, i);

      const button = await findText("pondus", page, "span", "lsSenseBullet");
      await button.click();
      const tooltip = await findText("Copy article link", page);
      await tooltip.click();

      expect(await page.evaluate(() => navigator.clipboard.readText())).toEqual(
        "Some text"
      );
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "shows works by legacy id on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/work/phi0448.phi001.perseus-lat2");
      writeContext("workById", screenSize, i);
      await waitForText("Gallia");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "shows works by legacy id and q page %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/work/phi0448.phi001.perseus-lat2?q=3");
      writeContext("workByIdAndPage", screenSize, i);
      await waitForText("Orgetorix");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "shows works by name and author on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/work/phi0448.phi001.perseus-lat2");
      writeContext("workByNameAndAuthor", screenSize, i);
      await waitForText("Gallia");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "shows works by name and author and page %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/work/caesar/de_bello_gallico?pg=3");
      writeContext("workByNameAndAuthorWithPage", screenSize, i);
      await waitForText("Orgetorix");
    }
  );
});
