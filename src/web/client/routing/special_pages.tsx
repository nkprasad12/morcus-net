/**
 * For extra pages (beyond the reader and dictionary) that are large in size.
 * Putting it in one file allows us to lazy-load them in one chunk rather than
 * having to split each one separately.
 */

import { Macronizer } from "@/web/client/pages/macron";
import { CorpusQueryPage } from "@/web/client/pages/corpus/corpus_view";

export const HEAVY_PAGES = {
  Macronizer,
  CorpusQueryPage,
} as const;
