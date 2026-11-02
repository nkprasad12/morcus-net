/**
 * SSR fixtures for the Experimental Texts catalog (`/experimentalTexts`), included
 * by `src/web/ui/testing/ssr_fixtures.ts`.
 */

import { EXPERIMENTAL_TEXTS_TEST_CATALOG } from "@/web/ui/experimental_texts/experimental_texts_test_catalog";
import { renderExperimentalTextsCatalogPageHtml } from "@/web/ui/experimental_texts/experimental_texts.server";
import type { SsrFixture } from "@/web/ui/testing/ssr_fixtures";

export function buildExperimentalTextsCatalogFixtures(): SsrFixture[] {
  // Filtering is client-side (`<morcus-experimental-texts-view>`), so the server
  // renders one catalog state: the full list.
  return [
    {
      name: "experimental-texts-catalog",
      html: renderExperimentalTextsCatalogPageHtml(
        EXPERIMENTAL_TEXTS_TEST_CATALOG
      ),
    },
  ];
}
