/**
 * Interaction-time SSR conformance for reader. The harness, and what it
 * checks, is described in `testing/interaction_harness.ts`.
 *
 * @jest-environment jsdom
 */

import {
  clickOn,
  describeInteractionConformance,
} from "@/web/ui/testing/interaction_harness";
import { buildReaderFixtures } from "@/web/ui/testing/ssr_fixtures";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describeInteractionConformance("reader", {
  fixtures: buildReaderFixtures,
  // 6 targets when this landed.
  caps: { minRuns: 4 },
  // Page turns: `swapSlots` on `/work/...`, plus the translation fetch
  // when the Translation tab is open.
  scenarios: [
    {
      fixture: "reader-sallust-translation",
      name: "next page from the sticky bar",
      steps: [clickOn("#pager-next")],
      expectSwap: true,
    },
    {
      fixture: "reader-sallust-translation",
      name: "next page from the continuation card",
      steps: [clickOn(".reader-continuation-actions a.next-card")],
      expectSwap: true,
    },
    {
      fixture: "reader-caesar-last-page",
      name: "previous page from the sticky bar",
      steps: [clickOn("#pager-prev")],
      expectSwap: true,
    },
    {
      fixture: "reader-caesar-last-page",
      name: "jump to a page from the TOC",
      steps: [
        clickOn("#reader-toc-btn"),
        clickOn('.reader-toc-item[data-page-id="1.1"]'),
      ],
      expectSwap: true,
    },
    {
      fixture: "reader-sallust-translation",
      name: "turn the page with the Translation tab open",
      steps: [clickOn("#panel-tab-translation"), clickOn("#pager-next")],
      expectSwap: true,
    },
    {
      fixture: "reader-sallust-translation",
      name: "jump from the TOC with the Translation tab open",
      steps: [
        clickOn("#panel-tab-translation"),
        clickOn("#reader-toc-btn"),
        clickOn('.reader-toc-item[data-page-id="2"]'),
      ],
      expectSwap: true,
    },
  ],
});
