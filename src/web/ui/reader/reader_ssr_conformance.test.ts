/**
 * SSR & progressive-enhancement conformance for reader. The harness, and what it
 * checks, is described in `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import { renderReaderContentHtml } from "@/web/ui/reader/reader.server";
import { describeSsrConformance } from "@/web/ui/testing/ssr_conformance_harness";
import { buildReaderFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeSsrConformance("reader", {
  fixtures: async () => [
    ...(await buildReaderFixtures()),
    {
      name: "reader-jump-miss",
      html: await renderReaderContentHtml({
        workId: "caesar/de_bello_gallico",
        pageId: "1.2",
        jumpMiss: "999",
      }),
    },
  ],
  // When this landed: 4 instances, 136-182 sweep activations, 124 after a bundle failure.
  floors: {
    sweptInstances: 3,
    sweepActivations: 95,
    bundleFailureActivations: 86,
  },
});
