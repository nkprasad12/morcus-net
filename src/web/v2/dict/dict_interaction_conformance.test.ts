/**
 * Interaction-time SSR conformance for dict. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import {
  describeInteractionConformance,
  focusOn,
  pressKey,
  submitFormOf,
  typeIn,
} from "@/web/v2/testing/interaction_harness";
import { buildDictFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeInteractionConformance("dict", {
  fixtures: buildDictFixtures,
  // 35 targets when this landed.
  caps: { minRuns: 25 },
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
  ],
});
