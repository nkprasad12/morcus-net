/**
 * SSR & progressive-enhancement conformance for reader. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/v2/testing/ssr_conformance_harness";
import { buildReaderFixtures } from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describeSsrConformance("reader", {
  fixtures: buildReaderFixtures,
  // When this landed: 4 instances, 136-182 sweep activations, 124 after a bundle failure.
  floors: {
    sweptInstances: 3,
    sweepActivations: 95,
    bundleFailureActivations: 86,
  },
});
