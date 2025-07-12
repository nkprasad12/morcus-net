import { checkPresent } from "@/common/assert";
import { repeatedTest } from "@/integration/utils/playwright_utils";
import { test, expect, type ViewportSize, type Page } from "@playwright/test";

test.beforeEach(async ({ context, browserName }) => {
  if (browserName === "chromium") {
    // Firefox seems to have these permission by default.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }
});

let currentBrowserName: string | undefined = undefined;

test.beforeEach(({ browserName }) => {
  currentBrowserName = browserName;
});

function skipIfWebkit(reason: string) {
  test.skip(checkPresent(currentBrowserName === "webkit"), reason);
}

async function goToTab(
  tabName: string,
  page: Page,
  isMobile: boolean,
  viewport: ViewportSize | null
) {
  if (isMobile || checkPresent(viewport?.width) < 400) {
    // Click into the hamburger menu
    await page.getByLabel("site pages").click();
  }
  await page.locator(`button:text("${tabName}")`).nth(0).click();
}

test.describe("general navigation", () => {
  test("should load the landing page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Morcus Latin Tools");
    await expect(page).toHaveURL(/\/dicts$/);
  });

  test("has working tab navigation", async ({ page, isMobile, viewport }) => {
    await page.goto("/");
    await goToTab("About", page, isMobile, viewport);

    await expect(page.getByText("GPL-3.0")).toBeVisible();
    await expect(page.getByText("CC BY-SA 4.0")).toBeVisible();
  });

  test("should load about page", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByText("GPL-3.0")).toBeVisible();
    await expect(page.getByText("CC BY-SA 4.0")).toBeVisible();
  });
});

test.describe("dictionary search", () => {
  repeatedTest("loads results by typing and enter", 5, async ({ page }) => {
    await page.goto("/dicts");

    await page.locator(`[aria-label="Dictionary search box"]`).click();
    await page.keyboard.type("canaba", { delay: 20 });
    await page.keyboard.press("Enter");

    await expect(page.getByText("a hovel, hut").nth(0)).toBeVisible();
    await expect(page).toHaveTitle("canaba | Morcus Latin Tools");
  });

  repeatedTest("loads results by arrow nav", 5, async ({ page }) => {
    await page.goto("/dicts");

    await page.locator(`[aria-label="Dictionary search box"]`).click();
    await page.keyboard.type("can", { delay: 20 });
    await expect(page.getByText("cānăba").nth(0)).toBeVisible();

    // TODO: If we enable Pozo by default, we need an extra Arrow down here.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page.getByText("a hovel, hut").nth(0)).toBeVisible();
    await expect(page).toHaveTitle("cānăba | Morcus Latin Tools");
  });

  repeatedTest("loads results by autocomplete click", 5, async ({ page }) => {
    await page.goto("/dicts");
    await page.locator(`[aria-label="Dictionary search box"]`).click();
    await page.keyboard.type("can", { delay: 20 });

    await page.getByText("cānăba").nth(0).click();

    await expect(page.getByText("a hovel, hut").nth(0)).toBeVisible();
    await expect(page).toHaveTitle("cānăba | Morcus Latin Tools");
  });
});

test.describe("dictionary main entries", () => {
  test("should allow linkified latin words in SH", async ({ page }) => {
    await page.goto("/dicts/id/sh13535");

    await page.getByText("cohortandum").click();

    // The lemma form of cohortandum
    await expect(page.getByText("cŏ-hortor").nth(0)).toBeVisible();
    await expect(page).toHaveURL(/\/dicts\?q=cohortandum/);
  });

  test("should allow loading entries by old id", async ({ page }) => {
    await page.goto("/dicts?q=n37007&o=2");
    await expect(page.getByText("pondus").nth(0)).toBeVisible();
    await expect(page.getByText("a weight").nth(0)).toBeVisible();
  });

  test("should allow loading LS entries by name, all dicts", async ({
    page,
  }) => {
    await page.goto("/dicts?q=pondus");
    await expect(page.getByText("pondus").nth(0)).toBeVisible();
    await expect(page.getByText("a weight").nth(0)).toBeVisible();
  });

  test("should allow loading LS entries by name, some dicts, old format", async ({
    page,
  }) => {
    await page.goto("/dicts?q=pondus&in=LnS,SnH");
    await expect(page.getByText("pondus").nth(0)).toBeVisible();
    await expect(page.getByText("a weight").nth(0)).toBeVisible();
  });

  test("should allow loading LS entries by name, some dicts, new format", async ({
    page,
  }) => {
    await page.goto("/dicts?q=pondus&in=LnS-SnH");
    await expect(page.getByText("pondus").nth(0)).toBeVisible();
    await expect(page.getByText("a weight").nth(0)).toBeVisible();
  });

  test("should allow loading LS entries by new id", async ({ page }) => {
    await page.goto("/dicts/id/n37007");
    await expect(page.getByText("pondus").nth(0)).toBeVisible();
    await expect(page.getByText("a weight").nth(0)).toBeVisible();
  });

  test("should allow loading Gaffiot entries by name", async ({ page }) => {
    await page.goto("/dicts?q=abiegineus");
    await expect(page.getByText("ăbĭegnĭus").nth(0)).toBeVisible();
    await expect(page.getByText("abiegnus").nth(0)).toBeVisible();
  });

  test("should allow loading Gaffiot entries by new id", async ({ page }) => {
    await page.goto("/dicts/id/gaf-abiegineus");
    await expect(page.getByText("ăbĭegnĭus").nth(0)).toBeVisible();
    await expect(page.getByText("abiegnus").nth(0)).toBeVisible();
  });

  test("should allow loading SH entries by name", async ({ page }) => {
    await page.goto("/dicts?q=habiliment");
    await expect(page.getByText("habiliment").nth(0)).toBeVisible();
    await expect(page.getByText("garment").nth(0)).toBeVisible();
  });

  test("should allow loading SH entries by new id", async ({ page }) => {
    await page.goto("/dicts/id/sh11673");
    await expect(page.getByText("habiliment").nth(0)).toBeVisible();
    await expect(page.getByText("garment").nth(0)).toBeVisible();
  });

  test("allows navigating via outline", async ({ page }) => {
    await page.goto("/dicts/id/n20077");
    await page
      .getByText("O. Gladiatorial t. t., of a wounded combatant", {
        exact: true,
      })
      .click();
    await expect(page.getByText("he is hit")).toBeInViewport();
  });

  test("allows queries from the new ID page", async ({ page }) => {
    await page.goto("/dicts/id/sh11673");

    await page.locator(`[aria-label="Dictionary search box"]`).click();
    await page.keyboard.type("ăbăgĭō", { delay: 20 });
    await page.keyboard.press("Enter");

    await expect(
      page.getByText("supposed etymology of adagio").nth(0)
    ).toBeVisible();
    expect(page).toHaveTitle("ăbăgĭō | Morcus Latin Tools");
  });

  test("allows copying id links via tooltip", async ({ page }) => {
    skipIfWebkit("page.evaluate doesn't yet work on Webkit.");
    await page.goto("/dicts?q=abemito");

    await page.locator('[class="lsSenseBullet"]').getByText("ăbemĭto").click();
    await page.getByText("Copy article link").click();

    expect(await page.evaluate(() => navigator.clipboard.readText())).toEqual(
      `${process.env.BASE_URL}/dicts/id/n64`
    );
  });
});

test.describe("library landing", () => {
  test("shows library options", async ({ page }) => {
    await page.goto("/library");
    await page.getByText("Gallico").click();
    // This assumes that the info tab is the first one shown.
    // This is the editor.
    await expect(page.getByText("T. Rice Holmes")).toBeVisible();
  });
});

test.describe("main reader", () => {
  test("shows works by name and author", async ({ page }) => {
    await page.goto("/work/caesar/de_bello_gallico");
    await expect(page.getByText("Gallia", { exact: true })).toBeVisible();
  });

  test("saves spot on page turns", async ({ page }) => {
    await page.goto("/work/caesar/de_bello_gallico");
    await expect(page.getByText("Gallia").nth(0)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Orgetorix").nth(0)).toBeVisible();

    await page.goto("/library");
    await page.getByText("Gallico").nth(0).click();

    await expect(page.getByText("Orgetorix").nth(0)).toBeVisible();
  });

  test("saves spot on quick nav", async ({ page }) => {
    await page.goto("/work/caesar/de_bello_gallico");
    await expect(page.getByText("Gallia").nth(0)).toBeVisible();
    await page.locator(`[aria-label="Outline"]`).click();
    // Chosen because there is no other Chapter 90 - otherwise we would
    // have some trouble ambiguating between all of the links.
    await page.getByText("Book 7").nth(0).click();
    await page.getByText("Chapter 90").nth(0).click();
    await expect(page.getByText("Aeduos").nth(0)).toBeVisible();

    await page.goto("/library");
    await page.getByText("Gallico").nth(0).click();

    await expect(page.getByText("Aeduos").nth(0)).toBeVisible();
  });

  test("handles missing id in works", async ({ page }) => {
    await page.goto("/library");

    await page.goto("/work/caesar/de_bello_gallico");
    await expect(page.getByText("Gallia").nth(0)).toBeVisible();
    // Make sure we replaced the URL and then can go back.
    await expect(page).toHaveURL(/\/work\/caesar\/de_bello_gallico\?id=1\.1$/);

    await page.goBack();
    await expect(page.getByText("Welcome to the library")).toBeVisible();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("shows works by name and author and page", async ({ page }) => {
    await page.goto("/library");
    await page.goto("/work/caesar/de_bello_gallico?id=1.3");
    await expect(page.getByText("Orgetorix")).toBeVisible();

    await page.goBack();
    await expect(page.getByText("Welcome to the library")).toBeVisible();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("handles clicky vocab", async ({ page }) => {
    await page.goto("/work/caesar/de_bello_gallico");
    await page.getByText("divisa").click();

    // This is part of the entry for `divido`.
    await expect(
      page.getByText("To force asunder", { exact: true })
    ).toBeVisible();
  });

  test("has working scroll to line from URL", async ({ page }) => {
    await page.goto("/work/juvenal/saturae?id=1.2.161");
    await expect(page.getByText("Britannos")).toBeInViewport();
  });

  test("has working scroll to line from UI", async ({ page }) => {
    await page.goto("/work/juvenal/saturae?id=1.2");
    await expect(page.getByText("Britannos")).toBeVisible();
    await expect(page.getByText("Britannos")).not.toBeInViewport();

    await page.locator(`[aria-label="jump to id"]`).click();
    // It should be pre-populated with `1.2`, the current ID.
    await page.keyboard.press("End");
    await page.keyboard.type(".161");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/work\/juvenal\/saturae\?id=1\.2\.161$/);
    await expect(page.getByText("Britannos")).toBeInViewport();
  });

  test("has working translations", async ({ page }) => {
    await page.goto("/work/sallust/catalina1?id=1");
    await page.getByLabel("Translation").click();
    await page.getByRole("button", { name: /Load translation/ }).click();

    await expect(page.getByText("government")).toBeVisible();
    await page.getByLabel("next section").click();
    await expect(page.getByText("Cyrus").nth(1)).toBeVisible();
  });

  test.fixme("text search has expected results", async ({ page }) => {
    await page.goto("/work/caesar/de_bello_gallico");
    await page.locator(`[aria-label="TextSearch"]`).click();
    await page.locator(`[aria-label="search this work"]`).click();
    await page.keyboard.type("est in Britanniam");
    await page.keyboard.press("Enter");

    await expect(page.getByText("diem quartum quam")).toBeVisible();
    await page.getByText("atque ex Gallia").click();

    await expect(page.getByText("Insula natura triquetra")).toBeVisible();
    await expect(page).toHaveURL(
      /\/work\/caesar\/de_bello_gallico\?pg=169&l=1$/
    );
  });

  test("reader copy paste across lines", async ({ page }) => {
    skipIfWebkit("page.evaluate doesn't yet work on Webkit.");
    await page.goto("/work/juvenal/saturae?pg=1");
    await expect(page.getByText("Semper").first()).toBeVisible();

    // TODO: Extract this out into a "select" function
    await page.evaluate(
      ([from, to]) => {
        // @ts-ignore [This executes in the browser, where `getSelection` exists]
        const selection = from.getRootNode().getSelection();
        const range = document.createRange();
        // @ts-ignore
        range.setStartBefore(from);
        // @ts-ignore
        range.setEndAfter(to);
        selection.removeAllRanges();
        selection.addRange(range);
      },
      [await page.$("text=Semper"), await page.$("text=cordi")]
    );
    // TODO: Extract this out into a "copy selection" function
    const copied = await page.evaluate(() => {
      // Copy the selected content to the clipboard
      document.execCommand("copy");
      // Obtain the content of the clipboard as a string
      return navigator.clipboard.readText();
    });
    expect(copied).toBe(
      "Semper ego auditor tantum? numquamne reponam\nvexatus totiens rauci Theseide Cordi"
    );
  });
});

test.describe("offline mode", () => {
  // Currently this doesn't work on Firefox.
  test.skip("allows S&H offline", async ({
    page,
    context,
    isMobile,
    viewport,
  }) => {
    test.setTimeout(60000);
    await page.goto("/settings");
    await page.getByText("Experiments").click();
    await page.getByLabel("Enable experimental features").click();
    await page.getByLabel("Offline mode enabled").click();
    await expect(page.getByLabel("Smith and Hall")).toBeVisible({
      timeout: 10000,
    });

    await page.getByLabel("Smith and Hall").click();
    await expect(page.getByText("You can use S&H offline.")).toBeVisible({
      timeout: 45000,
    });
    // Block any API requests to show they're being served locally.
    // Ideally we would use `context.setOffline(true)` but it doesn't seem to
    // work on Safari.
    await context.route(/.*api.*$/, (route) => route.abort());

    await goToTab("Dictionary", page, isMobile, viewport);
    await page.locator(`[aria-label="Dictionary search box"]`).click();
    await page.keyboard.type("habiliment", { delay: 20 });
    await page.keyboard.press("Enter");

    await expect(page.getByText("habiliment").nth(0)).toBeVisible();
    await expect(page.getByText("garment").nth(0)).toBeVisible();
  });
});
