import { test } from "@playwright/test";
import { v2VisualScenario } from "@/integration/utils/v2_visual_helper";

test.describe("UI V2 Visual Regression Suite", () => {
  // 1. Dictionary Landing View
  v2VisualScenario("v2-dicts-landing", {
    path: "/v2/dicts",
    waitFor: ".v2-landing-container",
  });

  // 2. Dictionary Search Results View (gladius: concise entry with outlines & inflections)
  v2VisualScenario("v2-dicts-results-gladius", {
    path: "/v2/dicts?q=gladius",
    waitFor: ".v2-dict-card",
  });

  // 3. Dictionary Embedded View (used in Reader sidebar)
  v2VisualScenario("v2-dicts-embedded", {
    path: "/v2/dicts?q=gladius&embedded=1",
    waitFor: ".v2-dict-card",
  });

  // 4. Reader Default Passage View
  v2VisualScenario("v2-reader-passage", {
    path: "/v2/reader",
    waitFor: ".v2-reader-passage",
  });

  // 5. Reader Parallel Translation View
  v2VisualScenario("v2-reader-parallel", {
    path: "/v2/reader/sallust/catalina1?view=parallel",
    waitFor: ".v2-reader-parallel-content",
  });

  // 6. Library Browse Catalog
  v2VisualScenario("v2-library-landing", {
    path: "/v2/library",
    waitFor: ".v2-library-grid",
  });

  // 7. About Page (masking #debugging commit SHA so tests remain stable across git commits)
  v2VisualScenario("v2-about-page", {
    path: "/v2/about",
    waitFor: ".v2-about-article",
    mask: ["#debugging"],
  });
});
