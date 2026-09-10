import { test, expect, type Page } from "@playwright/test";

export interface V2VisualScenarioOptions {
  /** Relative URL path to test, e.g. "/v2/dicts" */
  path: string;
  /** Optional selector to wait for before taking the screenshot */
  waitFor?: string;
  /** JavaScript modes to test. Defaults to ["js", "nojs"] */
  jsModes?: ("js" | "nojs")[];
  /** Themes to test. Defaults to ["light", "dark"] */
  themes?: ("light" | "dark")[];
  /** Whether to capture the full page or just viewport. Defaults to true */
  fullPage?: boolean;
  /** Optional selectors of dynamic elements to mask during snapshot */
  mask?: string[];
  /** Optional custom interaction (e.g. opening a drawer or clicking a toggle) before screenshot */
  action?: (page: Page) => Promise<void>;
}

/**
 * Declares a multi-dimensional visual regression scenario across JS/NoJS and Light/Dark modes.
 * Browser (Chromium / Firefox) and Viewport (Desktop / Mobile) are handled by Playwright projects.
 */
export function v2VisualScenario(
  scenarioName: string,
  options: V2VisualScenarioOptions
) {
  const jsModes = options.jsModes ?? ["js", "nojs"];
  const themes = options.themes ?? ["light", "dark"];
  const fullPage = options.fullPage ?? true;

  for (const js of jsModes) {
    for (const theme of themes) {
      test(`${scenarioName} [${js}] [${theme}]`, async ({ browser }) => {
        const isDark = theme === "dark";
        const context = await browser.newContext({
          javaScriptEnabled: js === "js",
          colorScheme: theme,
        });

        const page = await context.newPage();

        if (js === "js") {
          await page.addInitScript((dark) => {
            try {
              localStorage.setItem(
                "GlobalSettings",
                JSON.stringify({ darkMode: dark })
              );
            } catch {}
            document.documentElement.setAttribute(
              "data-theme",
              dark ? "dark" : "light"
            );
          }, isDark);
        }

        try {
          await page.goto(options.path);
          if (options.waitFor) {
            await page.waitForSelector(options.waitFor, { state: "visible" });
          }
          if (options.action) {
            await options.action(page);
          }

          const maskLocators = options.mask
            ? options.mask.map((selector) => page.locator(selector))
            : undefined;

          await expect(page).toHaveScreenshot(
            `${scenarioName}-${js}-${theme}.png`,
            {
              fullPage,
              animations: "disabled",
              mask: maskLocators,
            }
          );
        } finally {
          await context.close();
        }
      });
    }
  }
}
