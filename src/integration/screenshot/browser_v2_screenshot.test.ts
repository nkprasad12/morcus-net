import { test } from "@playwright/test";
import { v2VisualScenario } from "@/integration/utils/v2_visual_helper";

test.describe("UI V2 Visual Regression Suite", () => {
  // 1. Dictionary Landing View
  v2VisualScenario("v2-dicts-landing", {
    path: "/v2/dicts",
    waitFor: ".landing-container",
  });

  // 2. Dictionary Search Results View (gladius: concise entry with outlines & inflections)
  v2VisualScenario("v2-dicts-results-gladius", {
    path: "/v2/dicts?q=gladius",
    waitFor: ".dict-card",
  });

  // 3. Dictionary Embedded View (used in Reader sidebar)
  v2VisualScenario("v2-dicts-embedded", {
    path: "/v2/dicts?q=gladius&embedded=1",
    waitFor: ".dict-card",
  });

  // 4. Reader Default Passage View
  v2VisualScenario("v2-reader-passage", {
    path: "/v2/reader",
    waitFor: ".reader-passage",
  });

  // 5. Reader Companion Panel Translation View
  v2VisualScenario("v2-reader-parallel", {
    path: "/v2/reader/sallust/catalina1",
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
  v2VisualScenario("v2-reader-notes", {
    path: "/v2/reader/cicero/cum_populo_gratias_egi",
    waitFor: ".reader-passage",
    action: async (page) => {
      await page.locator("a.reader-note-ref").first().click();
      await page.waitForSelector("#note-n1", { state: "visible" });
    },
  });

  // 6. Library Browse Catalog
  v2VisualScenario("v2-library-landing", {
    path: "/v2/library",
    waitFor: ".library-grid",
  });

  // 7. About Page (masking #debugging commit SHA so tests remain stable across git commits)
  v2VisualScenario("v2-about-page", {
    path: "/v2/about",
    waitFor: ".about-article",
    mask: ["#debugging"],
  });

  // 8. Subsection Match Note (abbatissa: single match resolved to the entry
  // blurb, short entry with no tools bar, plus a subsection inflection table)
  v2VisualScenario("v2-dicts-subsection-note", {
    path: "/v2/dicts?q=abbatissa",
    waitFor: ".subsection-note",
  });

  // 9. Corpus Landing View
  v2VisualScenario("v2-corpus-landing", {
    path: "/v2/corpus",
    waitFor: ".corpus-welcome-card",
  });

  // 10. Corpus Search Results View (Roma: multi-work results with marks and pager)
  v2VisualScenario("v2-corpus-results", {
    path: "/v2/corpus?q=Roma",
    waitFor: ".corpus-result-list",
    mask: ["[data-volatile]"],
  });

  // 11. Corpus Zero-Results View
  v2VisualScenario("v2-corpus-zero-results", {
    path: "/v2/corpus?q=xyznonexistentword",
    waitFor: ".corpus-results",
    mask: ["[data-volatile]"],
  });

  // ==========================================================================
  // Dark Mode Curated Token Samples (High-Density Views)
  // ==========================================================================

  // 12. Dark Mode Sample - Dictionary Results View (cards, chips, tags, tables)
  v2VisualScenario("v2-dicts-results-gladius", {
    path: "/v2/dicts?q=gladius",
    waitFor: ".dict-card",
    jsModes: ["js"],
    themes: ["dark"],
  });

  // 13. Dark Mode Sample - Reader Passage View (reading canvas, active words, sticky bar)
  v2VisualScenario("v2-reader-passage", {
    path: "/v2/reader",
    waitFor: ".reader-passage",
    jsModes: ["js"],
    themes: ["dark"],
  });

  // 14. Dark Mode Sample - Corpus Results View (cards, chips, mark highlights, pager)
  v2VisualScenario("v2-corpus-results", {
    path: "/v2/corpus?q=Roma",
    waitFor: ".corpus-result-list",
    mask: ["[data-volatile]"],
    jsModes: ["js"],
    themes: ["dark"],
  });
});

