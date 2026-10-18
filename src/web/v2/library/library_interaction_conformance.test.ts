/**
 * Interaction-time SSR conformance for library. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeInteractionConformance } from "@/web/v2/testing/interaction_harness";
import { buildLibraryFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeInteractionConformance("library", {
  fixtures: buildLibraryFixtures,
  // 7 targets when this landed.
  caps: { minRuns: 5 },
});
