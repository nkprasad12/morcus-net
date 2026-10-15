import { test, expect, type Page } from "@playwright/test";
import { disableSmoothScroll } from "@/integration/utils/playwright_utils";

/**
 * Library and reader journeys that only V1's browser suite used to cover
 * (GRADUATION.md §4, "Port V1-Only CUJs to V2 E2E"). Each test drives a real
 * browser because the behaviour depends on something jsdom cannot show:
 * persistence across full navigations, real history, layout and scrolling,
 * or the clipboard.
 */

const DBG = "/work/caesar/de_bello_gallico";
const JUVENAL = "/work/juvenal/saturae";

const passage = (page: Page) => page.locator("#reader-passage");

/** Opens the table-of-contents drawer from the sticky bar. */
async function openToc(page: Page): Promise<void> {
  await page.locator("#reader-toc-btn").click();
  await expect(page.locator("#reader-toc-search-input")).toBeVisible();
}

test.describe("UI V2 library", () => {
  test("filtering narrows the cards, and a card opens the reader", async ({
    page,
  }) => {
    await page.goto("/library");
    const dbgCard = page.locator(`a.work-card[data-reader-url="${DBG}"]`);
    const juvenalCard = page.locator(
      `a.work-card[data-reader-url="${JUVENAL}"]`
    );
    await expect(dbgCard).toBeVisible();
    await expect(juvenalCard).toBeVisible();

    await page.locator("#library-search-input").fill("caesar gallico");
    await expect(juvenalCard).toBeHidden();
    await expect(dbgCard).toBeVisible();

    await dbgCard.click();
    await expect(page).toHaveURL(new RegExp(`${DBG}(/1\\.1)?$`));
    await expect(passage(page)).toContainText("Gallia est omnis divisa");
  });
});

test.describe("UI V2 reader", () => {
  test("restores the saved spot from the library after a page turn and a TOC jump", async ({
    page,
  }) => {
    await page.goto(DBG);
    await expect(passage(page)).toContainText("Gallia est omnis");

    // Page turn with the pager arrow.
    await page.locator("#pager-next").click();
    await expect(passage(page)).toContainText("Orgetorix");

    await page.goto("/library");
    await page.locator(`a.work-card[data-reader-url="${DBG}"]`).click();
    await expect(passage(page)).toContainText("Orgetorix");

    // Quick navigation through a TOC link. Chapter 90 exists only in Book 7.
    await openToc(page);
    await page
      .locator(".reader-toc-summary", { hasText: "Book 7" })
      .first()
      .click();
    await page.locator(`a.reader-toc-item[data-page-id="7.90"]`).click();
    await expect(passage(page)).toContainText("Aeduos");

    await page.goto("/library");
    await page.locator(`a.work-card[data-reader-url="${DBG}"]`).click();
    await expect(passage(page)).toContainText("Aeduos");
  });

  test("opening a work without a section, or by legacy ?id=, keeps Back on the library", async ({
    page,
  }) => {
    await page.goto("/library");

    await page.goto(DBG);
    await expect(passage(page)).toContainText("Gallia est omnis");
    await page.goBack();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator("#library-search-input")).toBeVisible();

    // The legacy V1 form redirects server-side, so it adds no history entry.
    await page.goto(`${DBG}?id=1.3`);
    await expect(page).toHaveURL(new RegExp(`${DBG}/1\\.3$`));
    await expect(passage(page)).toContainText("Orgetorix");
    await page.goBack();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("a line deep link scrolls the line into view", async ({ page }) => {
    await page.goto(`${JUVENAL}?id=1.2.161`);
    await expect(page).toHaveURL(
      new RegExp(`${JUVENAL}/1\\.2#sec-1\\.2\\.161$`)
    );
    await expect(passage(page).getByText("Britannos")).toBeInViewport();
  });

  test("the TOC jump field goes to a line on the current page", async ({
    page,
  }) => {
    await page.goto(`${JUVENAL}/1.2`);
    await disableSmoothScroll(page);
    const line = passage(page).getByText("Britannos");
    await expect(line).toBeVisible();
    await expect(line).not.toBeInViewport();

    await openToc(page);
    await page.locator("#reader-toc-search-input").fill("1.2.161");
    await page.keyboard.press("Enter");

    // A jump within the current page scrolls in place and closes the TOC;
    // like the gutter anchors, it leaves the URL alone (`reader_view.client`).
    await expect(page.locator("#reader-toc-search-input")).toBeHidden();
    await expect(line).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`${JUVENAL}/1\\.2$`));
  });

  test("the TOC jump field works without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${DBG}/1.1`);
    // Without JS the drawer opens via its `:target` link.
    await page.locator("#reader-toc-btn").click();
    const input = page.locator("#reader-toc-search-input");
    await expect(input).toBeVisible();
    await input.fill("7.90");
    await input.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${DBG}/7\\.90`));
    await expect(passage(page)).toContainText("Aeduos");
    await context.close();
  });

  test("translations load on demand and follow page turns", async ({
    page,
  }) => {
    await page.goto("/work/sallust/catalina1/1");
    await page.locator("#panel-tab-translation").click();
    const translation = page.locator("#panel-view-translation");
    await expect(translation).toContainText("government");

    await page.locator("#pager-next").click();
    await expect(translation).toContainText("Cyrus");
  });

  test("clicking a word in the passage shows its dictionary entry", async ({
    page,
  }) => {
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    await passage(page)
      .locator(".lat-word", { hasText: /^divisa$/ })
      .first()
      .click();

    await expect(page.locator("aside.reader-dict-panel")).not.toHaveClass(
      /\bdrawer-minimized\b/
    );
    // Part of the Lewis & Short entry for `divido`.
    await expect(
      page.frameLocator("#dict-frame").getByText("To force asunder", {
        exact: true,
      })
    ).toBeVisible();
  });

  test("copying across verse lines gives one line per verse", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium lets the page read the clipboard back."
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${JUVENAL}/1.1`);
    const first = passage(page).locator("#sec-1\\.1\\.1 .reader-line");
    const second = passage(page).locator("#sec-1\\.1\\.2 .reader-line");
    await expect(first).toContainText("Semper ego auditor");

    const copied = await page.evaluate(
      async ([from, to]) => {
        const range = document.createRange();
        range.setStartBefore(from!);
        range.setEndAfter(to!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        return navigator.clipboard.readText();
      },
      [await first.elementHandle(), await second.elementHandle()]
    );
    expect(copied.trim()).toBe(
      "Semper ego auditor tantum? numquamne reponam\n" +
        "vexatus totiens rauci Theseide Cordi?"
    );
  });
});

test.describe("UI V2 dictionary autocomplete", () => {
  test("arrow keys pick a suggestion and Enter searches it", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const input = page.locator("#dict-q");
    await input.click();
    await page.keyboard.type("can", { delay: 30 });

    const target = page.locator(".suggestion-item", { hasText: "cānăba" });
    await expect(target).toBeVisible();
    // Arrow down until the suggestion is the active option.
    const count = await page.locator(".suggestion-item").count();
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("ArrowDown");
      if ((await target.getAttribute("aria-selected")) === "true") break;
    }
    await expect(target).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/dicts\?q=c%C4%81n%C4%83ba/);
    await expect(page.getByText("a hovel, hut").first()).toBeVisible();
  });
});
