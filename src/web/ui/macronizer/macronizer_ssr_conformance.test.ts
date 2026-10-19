/**
 * SSR & progressive-enhancement conformance for macronizer. The harness, and
 * what it checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/ui/testing/ssr_conformance_harness";
import { buildMacronizerFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeSsrConformance("macronizer", {
  fixtures: buildMacronizerFixtures,
  floors: {
    sweptInstances: 4,
    sweepActivations: 100,
    bundleFailureActivations: 100,
  },
});
