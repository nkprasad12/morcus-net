/**
 * A small Experimental Texts catalog for the slice's tests and SSR fixtures:
 * fixture data, not the real catalog, but shaped like the builder's output.
 * It covers both sources, all three periods, an author with several works, a
 * partial-coverage entry, and upstream author spellings normalized the way
 * the catalog builder normalizes them (`Augustinus` is shown as Augustine,
 * with its other names kept in `authorAliases`).
 */

import type {
  ExperimentalTextCatalogBundle,
  ExperimentalTextCatalogEntry,
} from "@/common/experimental_texts/catalog_types";
import {
  PATROLOGIA_LATINA_LICENSE,
  THE_LATIN_LIBRARY_LICENSE,
  sortExperimentalTextCatalogEntries,
} from "@/common/experimental_texts/catalog_types";
import { normalizeExperimentalTextCatalogEntries } from "@/common/experimental_texts/catalog_normalizer";
import {
  FIXTURE_LL_SOURCE,
  FIXTURE_PL_SOURCE,
} from "@/web/ui/experimental_texts/experimental_texts_reader_fixtures";

function plEntry(
  stoa: string,
  author: string,
  title: string,
  period: ExperimentalTextCatalogEntry["period"],
  volume: number
): ExperimentalTextCatalogEntry {
  const [authorId, workId] = stoa.split(".");
  const file = `data/${authorId}/${workId}/${stoa}.opp-lat1.xml`;
  return {
    id: `pl/${stoa}.opp-lat1`,
    source: "patrologia_latina",
    format: "tei",
    author,
    title,
    period,
    urn: `urn:cts:latinLit:${stoa}.opp-lat1`,
    volumeLabel: `PL ${volume}`,
    files: [file],
    sourceUrl: `https://github.com/${FIXTURE_PL_SOURCE.repo}/blob/${FIXTURE_PL_SOURCE.commit}/${file}`,
    license: PATROLOGIA_LATINA_LICENSE,
    statedEdition: `J.-P. Migne, Patrologia Latina, vol. ${volume}`,
  };
}

/** Upstream spellings, before normalization. */
const RAW_ENTRIES: readonly ExperimentalTextCatalogEntry[] = [
  plEntry(
    "stoa0022.stoa002",
    "Ambrosius",
    "De Fide Ad Gratianum Augustum Libri Quinque",
    "ancient",
    16
  ),
  plEntry(
    "stoa0022.stoa001",
    "Ambrosius",
    "De Officiis Ministrorum Libri Tres",
    "ancient",
    16
  ),
  plEntry(
    "stoa0040.stoa006",
    "Augustinus",
    "De Doctrina Christiana Libri Quattuor",
    "ancient",
    34
  ),
  plEntry(
    "stoa0159.stoa004",
    "Isidorus Hispaliensis",
    "Sententiarum Libri Tres",
    "medieval",
    83
  ),
  {
    id: "ll/abbo-passio-sancti-edmundi",
    source: "thelatinlibrary",
    format: "thelatinlibrary_html",
    author: "Abbo of Fleury",
    title: "Passio Sancti Edmundi",
    period: "medieval",
    files: ["raw/abbo.html"],
    sourceUrl: "https://www.thelatinlibrary.com/abbo.html",
    license: THE_LATIN_LIBRARY_LICENSE,
    statedEdition: null,
  },
  {
    id: "ll/apicius-de-re-coquinaria",
    source: "thelatinlibrary",
    format: "thelatinlibrary_html",
    author: "Apicius",
    title: "De Re Coquinaria (with Excerpta a Vinidario)",
    period: "ancient",
    files: ["raw/apicius/apicius1.html", "raw/apicius/apicius11.html"],
    sourceUrl: "https://www.thelatinlibrary.com/apicius/apicius1.html",
    license: THE_LATIN_LIBRARY_LICENSE,
    statedEdition: null,
    partialCoverage: {
      libraryWorkId: "phi2003.phi001.perseus-lat1",
      libraryUrl: "/work/apicius/de_re_coquinaria",
      libraryAuthor: "Apicius",
      libraryTitle: "De Re Coquinaria",
      message:
        "Books 1–10 are in the Library; this text also includes the Excerpta a Vinidario.",
    },
  },
  {
    id: "ll/erasmus-querela-pacis",
    source: "thelatinlibrary",
    format: "thelatinlibrary_html",
    author: "Erasmus",
    title: "Querela Pacis",
    period: "neolatin",
    files: ["raw/erasmus/querela.html"],
    sourceUrl: "https://www.thelatinlibrary.com/erasmus/querela.html",
    license: THE_LATIN_LIBRARY_LICENSE,
    statedEdition: null,
  },
];

export const EXPERIMENTAL_TEXTS_TEST_CATALOG: ExperimentalTextCatalogBundle = {
  version: 1,
  generatedAt: "2026-10-31T00:00:00.000Z",
  sources: {
    patrologia_latina: FIXTURE_PL_SOURCE,
    thelatinlibrary: FIXTURE_LL_SOURCE,
  },
  entries: sortExperimentalTextCatalogEntries(
    normalizeExperimentalTextCatalogEntries(RAW_ENTRIES)
  ),
};
