/**
 * SSR & progressive-enhancement conformance for corpus. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/ui/testing/ssr_conformance_harness";
import { buildCorpusFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeSsrConformance("corpus", {
  fixtures: buildCorpusFixtures,
  // When this landed: 4 instances, 98 sweep activations, 98 after a bundle failure.
  floors: {
    sweptInstances: 3,
    sweepActivations: 68,
    bundleFailureActivations: 68,
  },
});
