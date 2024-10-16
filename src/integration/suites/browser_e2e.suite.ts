// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { mkdirSync, rmSync } from "fs";
import { assert, checkPresent } from "@/common/assert";
import {
  findText,
  openTab,
  setSize,
  type ScreenSize,
  ALL_SCREEN_SIZES,
  BROWSERS,
  LARGE_ONLY,
} from "@/integration/utils/puppeteer_utils";

export function defineBrowserE2eSuite() {
  // Just on chrome for now, but we should add firefox later.
  // It requires some extra setup steps to install the browser.
  describe.each(BROWSERS)("E2E Puppeteer tests on %s", (product) => {
    let browser: Browser | undefined = undefined;
    let currentPage: Page | undefined = undefined;
    let testName: string | undefined = undefined;
    let screenSize: ScreenSize | undefined = undefined;
    let iteration: number | undefined = undefined;

    function screenshotsDir() {
      return `puppeteer_screenshots/${product}`;
    }

    beforeAll(async () => {
      try {
        rmSync(screenshotsDir(), { recursive: true, force: true });
      } catch {}
      try {
        mkdirSync(screenshotsDir());
      } catch {}
      browser = await puppeteer.launch({ headless: true, browser: product });
      const context = browser.defaultBrowserContext();
      if (product === "chrome") {
        await context.overridePermissions(global.location.origin, [
          "clipboard-read",
          "clipboard-write",
          "clipboard-sanitized-write",
        ]);
      }
      currentPage = await checkPresent(browser).newPage();
    });

    // Firefox doesn't nicely handle re-use of the same page.
    afterEach(async () => {
      if (product === "chrome") {
        return;
      }
      await currentPage?.close();
      currentPage = await checkPresent(browser).newPage();
    });

    afterAll(async () => {
      await currentPage?.close();
      await browser?.close();
    });

    async function takeScreenshot(): Promise<void> {
      const page = checkPresent(currentPage);
      const tag = `${testName}.${screenSize}.n${iteration}.png`;
      await page.screenshot({ path: `${screenshotsDir()}/${tag}` });
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
      const results = await page.$$(`xpath/.//*[contains(text(), "${text}")]`);
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
        const results = await page.waitForSelector(
          `xpath/.//${parentType}[contains(text(), "${text}")${classString}]`,
          { timeout: 3000 }
        );
        assert(results !== null, `Failed to find text: ${text}`);
      } catch (err) {
        await takeScreenshot();
        throw err;
      }
    }

    async function awaitAndClickText(
      text: string,
      parentType: string = "*",
      className?: string
    ) {
      await waitForText(text, parentType, className);
      await (
        await findText(text, checkPresent(currentPage), parentType, className)
      ).click();
    }

    async function waitForUrlChange(old: string): Promise<string> {
      const page = checkPresent(currentPage);
      let url: string = "";
      for (let i = 0; i < 3; i++) {
        url = page.url();
        if (url !== old) {
          return url;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await takeScreenshot();
      throw new Error(`Timed out waiting for change from: ${url}`);
    }

    async function getPage(
      size: ScreenSize,
      morcusPage?: string
    ): Promise<Page> {
      const page = await getEmptyPage(size);
      await page.goto(global.location.origin + (morcusPage || ""));
      return page;
    }

    async function getEmptyPage(size: ScreenSize): Promise<Page> {
      const page = checkPresent(currentPage);
      await setSize(size, page);
      return page;
    }

    // // // // // // // // //
    // General / Navigation //
    // // // // // // // // //

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

    it.each(ALL_SCREEN_SIZES(1))(
      "should load about page on %s screen #%s",
      async (screenSize, i) => {
        await getPage(screenSize, "/about");
        writeContext("aboutPage", screenSize, i);

        await checkHasText("GPL-3.0");
        await checkHasText("CC BY-SA 4.0");
      }
    );

    // // // // // // // // //
    // Dictionary - Search  //
    // // // // // // // // //

    it.each(LARGE_ONLY(5))(
      "should load dictionary results on %s screen by typing and enter #%s",
      async (screenSize, i) => {
        const page = await getPage(screenSize, "/dicts");
        writeContext("dictSearchTypeEnter", screenSize, i);

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("canaba", { delay: 20 });
        await page.keyboard.press("Enter");

        await waitForText("hovel");
        await checkTitleIs("canaba | Morcus Latin Tools");
      }
    );

    it.each(LARGE_ONLY(5))(
      "should load dictionary results on %s screen by arrows and autocomplete #%s",
      async (screenSize, i) => {
        const page = await getPage(screenSize, "/dicts");
        writeContext("dictSearchArrowEnter", screenSize, i);

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("can", { delay: 20 });
        await waitForText("cānăba");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        await waitForText("hovel");
        await checkTitleIs("cānăba | Morcus Latin Tools");
      }
    );

    it.each(ALL_SCREEN_SIZES(5))(
      "should load dictionary results on %s screen by click and autocomplete #%s",
      async (screenSize, i) => {
        const page = await getPage(screenSize, "/dicts");
        writeContext("dictSearchClick", screenSize, i);

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("can", { delay: 20 });
        await awaitAndClickText("cānăba", "span");

        await waitForText("hovel");
        await checkTitleIs("cānăba | Morcus Latin Tools");
      }
    );

    // // // // // // // //
    // Dictionary - Main //
    // // // // // // // //

    it.each(ALL_SCREEN_SIZES(1))(
      "should allow linkified latin words in SH %s screen #%s",
      async (screenSize, i) => {
        const page = await getPage(screenSize, "/dicts");
        writeContext("linkLatInSH", screenSize, i);

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("influence", { delay: 20 });
        await page.keyboard.press("Enter");

        await waitForText("cohortandum");
        const oldUrl = page.url();
        await (await findText("cohortandum", page)).click();

        // The lemma form of cohortandum
        await waitForText("cŏ-hortor");
        if (product === "firefox") {
          console.warn(
            "Skipping URL check on Firefox because it doesn't work. This should be investigated later."
          );
          return;
        }
        const url = await waitForUrlChange(oldUrl);
        expect(url).toContain("/dicts?q=cohortandum");
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

        await waitForText("supposed etymology of adagio");
        await checkTitleIs("abagio | Morcus Latin Tools");
      }
    );

    it.each(ALL_SCREEN_SIZES(1))(
      "allows copying id links via tooltip %s screen #%s",
      async (screenSize, i) => {
        const page = await getPage(screenSize, "/dicts?q=pondus");
        writeContext("copyArticleLink", screenSize, i);

        const button = await findText("pondus", page, "span", "lsSenseBullet");
        await button.click();
        const tooltip = await findText("Copy article link", page);
        await tooltip.click();

        expect(
          await page.evaluate(() => navigator.clipboard.readText())
        ).toEqual(`${global.location.origin}/dicts/id/n37007`);
      }
    );

    // // // // //
    // Library  //
    // // // // //

    it.each(ALL_SCREEN_SIZES(1))(
      "shows library options on %s screen",
      async (screenSize, i) => {
        await getPage(screenSize, "/library");
        writeContext("libraryListsWorks", screenSize, i);

        await awaitAndClickText("Gallico");
        // This assumes that the info tab is the first one shown.
        // This is the editor.
        await waitForText("T. Rice Holmes");
      }
    );

    // // // // //
    // Reader   //
    // // // // //

    it.each(ALL_SCREEN_SIZES(1))(
      "shows works by name and author on %s screen #%s",
      async (screenSize, i) => {
        await getPage(screenSize, "/work/caesar/de_bello_gallico");
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

    it.each(ALL_SCREEN_SIZES(1))(
      "handles clicky vocab on %s screen #%s",
      async (screenSize, i) => {
        await getPage(screenSize, "/work/caesar/de_bello_gallico");
        writeContext("workByNameAndAuthor", screenSize, i);
        await awaitAndClickText("divisa");

        // This is part of the entry for `divido`.
        await waitForText("To force asunder");
      }
    );
  });
}
