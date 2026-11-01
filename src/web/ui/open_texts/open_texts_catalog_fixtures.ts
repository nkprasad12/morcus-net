/**
 * SSR fixture builder for the Open Texts catalog listing (`/opentexts`).
 *
 * Owned exclusively by **C5 (`catalog`)** in Phase 2 so C5 and C6 never
 * collide on `src/web/ui/testing/ssr_fixtures.ts`.
 */

import { SEED_OPEN_TEXTS_CATALOG_BUNDLE } from "@/common/open_texts/catalog_loader";
import { renderOpenTextsCatalogPageHtml } from "@/web/ui/open_texts/open_texts.server";
import type { SsrFixture } from "@/web/ui/testing/ssr_fixtures";

export function buildOpenTextsCatalogFixtures(): SsrFixture[] {
  // Filtering is client-side (`<morcus-open-texts-view>`), so the server
  // renders one catalog state: the full list.
  return [
    {
      name: "open-texts-catalog",
      html: renderOpenTextsCatalogPageHtml(SEED_OPEN_TEXTS_CATALOG_BUNDLE),
    },
  ];
}
