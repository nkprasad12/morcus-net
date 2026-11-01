/**
 * SSR fixture builder for the Open Texts client-side reader host (`/opentexts?open=...`).
 *
 * Owned exclusively by **C6 (`otreader`)** in Phase 2 so C5 and C6 never
 * collide on `src/web/ui/testing/ssr_fixtures.ts`.
 *
 * The host is rendered with the shared `renderOpenTextReaderHostHtml` (the
 * same renderer C5's `/opentexts?open=<id>` route uses), so the conformance
 * suites check the exact markup `<morcus-open-text-reader>` upgrades.
 */

import type {
  OpenTextCatalogEntry,
  OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
} from "@/common/open_texts/catalog_types";
import {
  OPEN_TEXTS_PATH,
  renderOpenTextReaderHostHtml,
} from "@/web/ui/open_texts/open_texts_contract.common";
import type { SsrFixture } from "@/web/ui/testing/ssr_fixtures";

const PL_REPO = "nkprasad12/patrologia_latina-dev";
const PL_COMMIT = "8c651f85c1a0b2d3e4f5a6b7c8d9e0f1a2b3c4d5";
const LL_REPO = "nkprasad12/TheLatinLibrary";
const LL_COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** A pinned Patrologia Latina source, as the catalog builder derives it. */
export const FIXTURE_PL_SOURCE: OpenTextSourceRepoMeta = {
  source: "patrologia_latina",
  label: "Patrologia Latina",
  repo: PL_REPO,
  commit: PL_COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(PL_REPO, PL_COMMIT),
  fallbackBaseUrl: buildJsDelivrBaseUrl(PL_REPO, PL_COMMIT),
  license: "CC BY-SA 4.0 (Open Greek and Latin)",
};

/** A TEI work from the Patrologia Latina. */
export const FIXTURE_PL_ENTRY: OpenTextCatalogEntry = {
  id: "pl/stoa0022.stoa002.opp-lat1",
  source: "patrologia_latina",
  format: "tei",
  author: "Ambrose",
  title: "De Fide ad Gratianum Augustum",
  period: "patristic",
  urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
  volumeLabel: "PL 16",
  files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
  sourceUrl: `https://github.com/${PL_REPO}/blob/${PL_COMMIT}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
  license: "CC BY-SA 4.0 (Open Greek and Latin)",
  statedEdition: "Patrologia Latina, ed. J.-P. Migne, vol. 16 (1845)",
};

/** A pinned Latin Library source. */
export const FIXTURE_LL_SOURCE: OpenTextSourceRepoMeta = {
  source: "thelatinlibrary",
  label: "The Latin Library",
  repo: LL_REPO,
  commit: LL_COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(LL_REPO, LL_COMMIT),
  fallbackBaseUrl: buildJsDelivrBaseUrl(LL_REPO, LL_COMMIT),
  license:
    "Public domain Latin text; HTML transcription from The Latin Library",
};

/** A Latin Library work the Library covers in part (Decision #19). */
export const FIXTURE_LL_PARTIAL_ENTRY: OpenTextCatalogEntry = {
  id: "ll/apicius",
  source: "thelatinlibrary",
  format: "thelatinlibrary_html",
  author: "Apicius",
  title: "De Re Coquinaria",
  period: "late_antique",
  files: ["raw/apicius/apicius1.html", "raw/apicius/apicius2.html"],
  sourceUrl: "https://www.thelatinlibrary.com/apicius.html",
  license:
    "Public domain Latin text; HTML transcription from The Latin Library",
  statedEdition: null,
  partialCoverage: {
    libraryWorkId: "phi2003.phi001.perseus-lat1",
    libraryUrl: "/work/apicius/de_re_coquinaria",
    libraryAuthor: "Apicius",
    libraryTitle: "De Re Coquinaria",
    message: "Book 1 is in the Morcus Library.",
  },
};

export function buildOpenTextsReaderFixtures():
  | SsrFixture[]
  | Promise<SsrFixture[]> {
  return [
    {
      // `/opentexts?open=pl/...`: a TEI work, fetched and parsed on the client.
      name: "open-texts-reader-tei",
      html: renderOpenTextReaderHostHtml({
        entry: FIXTURE_PL_ENTRY,
        sourceMeta: FIXTURE_PL_SOURCE,
        initialSection: "529",
        backHref: OPEN_TEXTS_PATH,
      }),
    },
    {
      // A Latin Library work with a partial-coverage note.
      name: "open-texts-reader-partial",
      html: renderOpenTextReaderHostHtml({
        entry: FIXTURE_LL_PARTIAL_ENTRY,
        sourceMeta: FIXTURE_LL_SOURCE,
        backHref: OPEN_TEXTS_PATH,
      }),
    },
  ];
}
