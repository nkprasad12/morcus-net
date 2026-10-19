/**
 * Interaction-time SSR conformance for dict. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import {
  clickOn,
  describeInteractionConformance,
  focusOn,
  hoverOn,
  pressKey,
  submitFormOf,
  typeIn,
} from "@/web/ui/testing/interaction_harness";
import { buildDictFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeInteractionConformance("dict", {
  fixtures: buildDictFixtures,
  // 35 targets when this landed; 20 once the settings moved into a dialog, whose
  // controls Tier 1 skips while it's closed (the "change settings" scenario covers them).
  caps: { minRuns: 14 },
  scenarios: [
    {
      fixture: "dict-landing",
      name: "pick a suggestion",
      steps: [
        focusOn("#dict-q"),
        typeIn("#dict-q", "am"),
        pressKey("ArrowDown"),
        pressKey("Enter"),
      ],
      expectSwap: true,
    },
    {
      fixture: "dict-results",
      name: "search again",
      steps: [
        focusOn("#dict-q"),
        typeIn("#dict-q", "amor"),
        submitFormOf("#dict-q"),
      ],
      expectSwap: true,
    },
    {
      fixture: "dict-results",
      name: "change settings",
      steps: [
        clickOn("#dict-settings-btn"),
        clickOn(".dict-checkbox:not(:checked)"),
        clickOn(".dict-settings-done"),
      ],
      expectSwap: true,
    },
    {
      // A hovered word becomes a link (`linkifyHoveredWord` in `entry_links.client.ts`);
      // nothing else in the page may change, and the link must be a usable No-JS control.
      fixture: "dict-results",
      name: "hover a word, then look it up",
      steps: [hoverOn(".lat-word"), clickOn(".lat-word")],
      expectSwap: true,
    },
    {
      fixture: "dict-landing",
      name: "change settings on landing page",
      steps: [
        clickOn("#dict-settings-btn"),
        clickOn(".dict-checkbox:not(:checked)"),
        clickOn(".dict-settings-done"),
      ],
    },
  ],
});
