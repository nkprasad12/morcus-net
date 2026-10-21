import { test } from "@playwright/test";
import { v2VisualScenario } from "@/integration/utils/visual_helper";

test.describe("UI V2 Visual Regression Suite", () => {
  // 1. Dictionary Landing View
  v2VisualScenario("dicts-landing", {
    path: "/dicts",
    waitFor: ".landing-container",
  });

  // 2. Dictionary Search Results View (gladius: concise entry with outlines & inflections)
  v2VisualScenario("dicts-results-gladius", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
  });

  // 3. Dictionary Embedded View (used in Reader sidebar)
  v2VisualScenario("dicts-embedded", {
    path: "/dicts?q=gladius&embedded=1",
    waitFor: ".dict-card",
  });

  // 4. Reader Default Passage View
  v2VisualScenario("reader-passage", {
    path: "/work/caesar/de_bello_gallico/1.1",
    waitFor: ".reader-passage",
  });

  // 5. Reader Companion Panel Translation View. The name predates the removal
  // of the `?view=parallel` mode; renaming it would rename its baselines.
  v2VisualScenario("reader-parallel", {
    path: "/work/sallust/catalina1",
    waitFor: ".reader-passage",
    action: async (page) => {
      const tab = page.locator("#panel-tab-translation");
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForSelector(".reader-translation-content", {
          state: "visible",
        });
      }
    },
  });

  // 5b. Reader Companion Panel Notes View: a real passage with its notes open.
  // The note marker is a plain `#note-*` link, so this opens the Notes view
  // via `:target` without JS and via the panel controller with it.
  v2VisualScenario("reader-notes", {
    path: "/work/cicero/cum_populo_gratias_egi",
    waitFor: ".reader-passage",
    action: async (page) => {
      const ref = page.locator("a.reader-note-ref").first();
      // On short viewports (MobileSafari) the first marker can sit under the
      // fixed bottom companion bar, which would take a coordinate click and
      // time the test out. Only then, dispatch the click on the link itself:
      // following it is the same (`:target` without JS, the panel with it).
      // Elsewhere keep the real click, whose hover state is in the baselines.
      const clickable = await ref
        .click({ trial: true, timeout: 2000 })
        .then(() => true)
        .catch(() => false);
      if (clickable) await ref.click();
      else await ref.dispatchEvent("click");
      await page.waitForSelector("#note-n1", { state: "visible" });
    },
  });

  // 6. Library Browse Catalog
  v2VisualScenario("library-landing", {
    path: "/library",
    waitFor: ".library-grid",
  });

  // 7. About Page (masking #debugging commit SHA so tests remain stable across git commits)
  v2VisualScenario("about-page", {
    path: "/about",
    waitFor: ".about-article",
    mask: ["#debugging"],
  });

  // 8. Subsection Match Note (abbatissa: single match resolved to the entry
  // blurb, short entry with no tools bar, plus a subsection inflection table)
  v2VisualScenario("dicts-subsection-note", {
    path: "/dicts?q=abbatissa",
    waitFor: ".subsection-note",
  });

  // 9. Corpus Landing View
  v2VisualScenario("corpus-landing", {
    path: "/corpus",
    waitFor: ".corpus-welcome-card",
  });

  // 10. Corpus Search Results View (Roma: multi-work results with marks and pager)
  v2VisualScenario("corpus-results", {
    path: "/corpus?q=Roma",
    waitFor: ".corpus-result-list",
    mask: ["[data-volatile]"],
  });

  // 11. Corpus Zero-Results View
  v2VisualScenario("corpus-zero-results", {
    path: "/corpus?q=xyznonexistentword",
    waitFor: ".corpus-results",
    mask: ["[data-volatile]"],
  });

  // 12. Dictionary Settings Dialog (modal dialog in JS, full-screen :target overlay in No-JS)
  v2VisualScenario("dicts-settings-dialog", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    action: async (page) => {
      await page.locator("#dict-settings-btn").click();
      await page.waitForSelector("dialog#dict-settings", { state: "visible" });
    },
  });

  // 13. Dictionary Guest Mode (link settings differ from saved cookie)
  v2VisualScenario("dicts-guest-mode", {
    path: "/dicts?q=gladius&d=2",
    cookies: [{ name: "morcus_d", value: "1" }],
    waitFor: ".guest-chip",
  });

  // 14. Dictionary Results Filtered to One Lexicon via Settings (GAF only)
  v2VisualScenario("dicts-single-dict", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    action: async (page) => {
      await page.locator("#dict-settings-btn").click();
      const dialog = page.locator("dialog#dict-settings");
      await dialog.waitFor({ state: "visible" });
      const checkboxes = dialog.locator(".dict-checkbox");
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        const box = checkboxes.nth(i);
        if ((await box.getAttribute("value")) !== "GAF") {
          await box.uncheck();
        } else {
          await box.check();
        }
      }
      await dialog.locator(".dict-settings-done").click();
      await dialog.waitFor({ state: "hidden" });
      await page.locator("#dict-L-S").waitFor({ state: "detached" });
      await page.locator("#dict-GAF").waitFor({ state: "visible" });
    },
  });

  // 15. Dictionary Entry Abbreviation Popover (#abbr-popover anchored to .lsHover)
  v2VisualScenario("dicts-abbr-popover", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    jsModes: ["js"],
    action: async (page) => {
      await page.locator(".lsHover").first().click();
      await page.waitForSelector("#abbr-popover", { state: "visible" });
    },
  });

  // ==========================================================================
  // Dark Mode Curated Token Samples (High-Density Views)
  // ==========================================================================

  // 16. Dark Mode Sample - Dictionary Results View (cards, chips, tags, tables)
  v2VisualScenario("dicts-results-gladius", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    jsModes: ["js"],
    themes: ["dark"],
  });

  // 17. Dark Mode Sample - Reader Passage View (reading canvas, active words, sticky bar)
  v2VisualScenario("reader-passage", {
    path: "/work/caesar/de_bello_gallico/1.1",
    waitFor: ".reader-passage",
    jsModes: ["js"],
    themes: ["dark"],
  });

  // 18. Dark Mode Sample - Corpus Results View (cards, chips, mark highlights, pager)
  v2VisualScenario("corpus-results", {
    path: "/corpus?q=Roma",
    waitFor: ".corpus-result-list",
    mask: ["[data-volatile]"],
    jsModes: ["js"],
    themes: ["dark"],
  });

  // 19. Dark Mode Sample - Dictionary Settings Dialog
  v2VisualScenario("dicts-settings-dialog", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    action: async (page) => {
      await page.locator("#dict-settings-btn").click();
      await page.waitForSelector("dialog#dict-settings", { state: "visible" });
    },
    jsModes: ["js"],
    themes: ["dark"],
  });

  // The app-bar Appearance menu, open over a dictionary result (JS-only).
  v2VisualScenario("appearance-menu", {
    path: "/dicts?q=gladius",
    waitFor: ".dict-card",
    action: async (page) => {
      await page.locator("#appearance-btn").click();
      await page.waitForSelector("#appearance-popover", { state: "visible" });
    },
    jsModes: ["js"],
    themes: ["light", "dark"],
  });

  // The reader settings dialog, with its "Text appearance" link (JS-only).
  v2VisualScenario("reader-settings", {
    path: "/work/caesar/de_bello_gallico/1.1",
    waitFor: ".reader-passage",
    action: async (page) => {
      await page.locator("#reader-settings-btn").click();
      await page.waitForSelector("#reader-settings-popover", {
        state: "visible",
      });
    },
    jsModes: ["js"],
  });
});
