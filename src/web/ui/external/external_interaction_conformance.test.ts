/**
 * Interaction-time SSR conformance for external. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeInteractionConformance } from "@/web/ui/testing/interaction_harness";
import { buildExternalFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeInteractionConformance("external", {
  fixtures: buildExternalFixtures,
  // 4 targets when this landed.
  caps: { minRuns: 3 },
});
