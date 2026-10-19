/**
 * SSR & progressive-enhancement conformance for dict. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { describeSsrConformance } from "@/web/ui/testing/ssr_conformance_harness";
import { buildDictFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeSsrConformance("dict", {
  fixtures: buildDictFixtures,
  // When this landed: 17 instances, 246-342 sweep activations, 284 after a bundle failure.
  floors: {
    sweptInstances: 12,
    sweepActivations: 172,
    bundleFailureActivations: 198,
  },
});
