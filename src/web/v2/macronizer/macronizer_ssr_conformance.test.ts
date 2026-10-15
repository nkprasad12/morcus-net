/**
 * SSR & progressive-enhancement conformance for macronizer. The harness, and
 * what it checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/v2/testing/ssr_conformance_harness";
import { buildMacronizerFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeSsrConformance("macronizer", {
  fixtures: buildMacronizerFixtures,
  floors: {
    sweptInstances: 4,
    sweepActivations: 100,
    bundleFailureActivations: 100,
  },
});
