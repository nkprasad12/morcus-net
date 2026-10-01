/**
 * Interaction-time SSR conformance for corpus. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import {
  describeInteractionConformance,
  clickOn,
  focusOn,
  pressKey,
  submitFormOf,
  typeIn,
} from "@/web/v2/testing/interaction_harness";
import { buildCorpusFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeInteractionConformance("corpus", {
  fixtures: buildCorpusFixtures,
  // 19 targets when this landed.
  caps: { minRuns: 14 },
  scenarios: [
    {
      fixture: "corpus-landing",
      name: "complete a lemma, then search",
      steps: [
        focusOn("#corpus-q"),
        typeIn("#corpus-q", "@l:am"),
        pressKey("ArrowDown"),
        pressKey("Enter"),
        submitFormOf("#corpus-q"),
      ],
      expectSwap: true,
    },
    {
      fixture: "corpus-results",
      name: "next page",
      steps: [clickOn('.corpus-pager a[rel="next"]')],
      expectSwap: true,
    },
  ],
});
