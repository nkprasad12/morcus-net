/**
 * SSR & progressive-enhancement conformance for library. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/v2/testing/ssr_conformance_harness";
import { buildLibraryFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeSsrConformance("library", {
  fixtures: buildLibraryFixtures,
  // When this landed: 3 instances, 41 sweep activations, 59 after a bundle failure.
  floors: {
    sweptInstances: 2,
    sweepActivations: 28,
    bundleFailureActivations: 41,
  },
});
