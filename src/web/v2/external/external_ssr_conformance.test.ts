/**
 * SSR & progressive-enhancement conformance for external. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/v2/testing/ssr_conformance_harness";
import { buildExternalFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeSsrConformance("external", {
  fixtures: buildExternalFixtures,
  // When this landed: 1 instance, 27 sweep activations, 21 after a bundle failure.
  floors: {
    sweptInstances: 1,
    sweepActivations: 18,
    bundleFailureActivations: 14,
  },
});
