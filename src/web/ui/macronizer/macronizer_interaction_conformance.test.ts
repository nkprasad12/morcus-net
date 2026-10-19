/**
 * Interaction-time SSR conformance for macronizer. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import {
  clickOn,
  describeInteractionConformance,
  focusOn,
  pressKey,
  submitFormOf,
  typeIn,
} from "@/web/ui/testing/interaction_harness";
import { CANNED_MACRONIZER_TEXT } from "@/web/ui/testing/fake_macronizer_engine";
import { buildMacronizerFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeInteractionConformance("macronizer", {
  fixtures: buildMacronizerFixtures,
  caps: {
    minRuns: 15,
    overrides: {
      "macronizer-results": {
        max: 35,
        reason:
          "Fixture exercises every word tier (0..5) and numeral card in one passage, so each card's radio/checkbox group has its own wN/mN name.",
      },
      "macronizer-applied": {
        max: 35,
        reason:
          "Same multi-tier passage after Apply, with pre-checked radio and edited vowel states.",
      },
    },
  },
  scenarios: [
    {
      fixture: "macronizer-landing",
      name: "enter Latin text and submit for partial swap",
      steps: [
        focusOn("#mac-text"),
        typeIn("#mac-text", CANNED_MACRONIZER_TEXT),
        submitFormOf("#mac-text"),
      ],
      expectSwap: true,
    },
    {
      fixture: "macronizer-results",
      name: "click word without focus, keyboard card navigation, keep & advance, plain word vowel override",
      steps: [
        clickOn("#t1"),
        pressKey("ArrowDown"),
        pressKey("Escape"),
        pressKey("Enter"),
        clickOn('.mac-plain[data-w="0"]'),
        clickOn('#w-plain [data-plain-vowels] input[type="checkbox"]'),
        clickOn("#mac-copy-btn"),
      ],
    },
  ],
});
