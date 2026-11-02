/**
 * SSR fixtures for the Experimental Texts reader host
 * (`/experimentalTexts?open=...`), included by `src/web/ui/testing/ssr_fixtures.ts`.
 *
 * The host is rendered with the shared `renderExperimentalTextReaderHostHtml` (the
 * same renderer the `/experimentalTexts?open=<id>` route uses), so the conformance
 * suites check the exact markup `<morcus-experimental-text-reader>` upgrades.
 */

import type {
  ExperimentalTextCatalogEntry,
  ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import {
  buildJsDelivrBaseUrl,
  buildRawGithubBaseUrl,
} from "@/common/experimental_texts/catalog_types";
import {
  EXPERIMENTAL_TEXTS_PATH,
  renderExperimentalTextReaderHostHtml,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import type { SsrFixture } from "@/web/ui/testing/ssr_fixtures";

const PL_REPO = "nkprasad12/patrologia_latina-dev";
const PL_COMMIT = "8c651f85c1a0b2d3e4f5a6b7c8d9e0f1a2b3c4d5";
const LL_REPO = "nkprasad12/TheLatinLibrary";
const LL_COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** A pinned Patrologia Latina source, as the catalog builder derives it. */
export const FIXTURE_PL_SOURCE: ExperimentalTextSourceRepoMeta = {
  source: "patrologia_latina",
  label: "Patrologia Latina",
  repo: PL_REPO,
  commit: PL_COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(PL_REPO, PL_COMMIT),
  fallbackBaseUrl: buildJsDelivrBaseUrl(PL_REPO, PL_COMMIT),
  license: "CC BY-SA 4.0 (Open Greek and Latin)",
};

/** A TEI work from the Patrologia Latina. */
export const FIXTURE_PL_ENTRY: ExperimentalTextCatalogEntry = {
  id: "pl/stoa0022.stoa002.opp-lat1",
  source: "patrologia_latina",
  format: "tei",
  author: "Ambrose",
  title: "De Fide ad Gratianum Augustum",
  period: "ancient",
  urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
  volumeLabel: "PL 16",
  files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
  sourceUrl: `https://github.com/${PL_REPO}/blob/${PL_COMMIT}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
  license: "CC BY-SA 4.0 (Open Greek and Latin)",
  statedEdition: "Patrologia Latina, ed. J.-P. Migne, vol. 16 (1845)",
};

/** A pinned Latin Library source. */
export const FIXTURE_LL_SOURCE: ExperimentalTextSourceRepoMeta = {
  source: "thelatinlibrary",
  label: "The Latin Library",
  repo: LL_REPO,
  commit: LL_COMMIT,
  rawBaseUrl: buildRawGithubBaseUrl(LL_REPO, LL_COMMIT),
  fallbackBaseUrl: buildJsDelivrBaseUrl(LL_REPO, LL_COMMIT),
  license:
    "Public domain Latin text; HTML transcription from The Latin Library",
};

/** A Latin Library work the Library covers in part (`partialCoverage`). */
export const FIXTURE_LL_PARTIAL_ENTRY: ExperimentalTextCatalogEntry = {
  id: "ll/apicius",
  source: "thelatinlibrary",
  format: "thelatinlibrary_html",
  author: "Apicius",
  title: "De Re Coquinaria",
  period: "ancient",
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

export function buildExperimentalTextsReaderFixtures():
  | SsrFixture[]
  | Promise<SsrFixture[]> {
  return [
    {
      // `/experimentalTexts?open=pl/...`: a TEI work, fetched and parsed on the client.
      name: "experimental-texts-reader-tei",
      html: renderExperimentalTextReaderHostHtml({
        entry: FIXTURE_PL_ENTRY,
        sourceMeta: FIXTURE_PL_SOURCE,
        initialSection: "529",
        backHref: EXPERIMENTAL_TEXTS_PATH,
      }),
    },
    {
      // A Latin Library work with a partial-coverage note.
      name: "experimental-texts-reader-partial",
      html: renderExperimentalTextReaderHostHtml({
        entry: FIXTURE_LL_PARTIAL_ENTRY,
        sourceMeta: FIXTURE_LL_SOURCE,
        backHref: EXPERIMENTAL_TEXTS_PATH,
      }),
    },
  ];
}
