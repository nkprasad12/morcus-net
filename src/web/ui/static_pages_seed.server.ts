/**
 * The static pages the build pre-renders into `build/pages.db`; see
 * `core/server/static_pages.server.ts` for how they are served.
 *
 * Each seed pairs a route's key with the route's own renderer, called with
 * the state that key stands for, so a seed is byte-for-byte what the route
 * would render. `static_pages_seed.test.ts` checks that against the routes.
 */

import { ABOUT_PAGE_KEY, LIBRARY_PAGE_KEY } from "@/web/ui/app_router.server";
import { renderAboutPageHtml } from "@/web/ui/about/about.server";
import {
  corpusLandingPageKey,
  type CorpusRoutesOptions,
} from "@/web/ui/corpus/corpus_routes.server";
import {
  loadCorpusAuthors,
  parseCorpusParams,
  runCorpusSearch,
  type CorpusEngine,
} from "@/web/ui/corpus/corpus_query.server";
import { renderCorpusPageHtml } from "@/web/ui/corpus/corpus_view.server";
import {
  saveStaticPagesDb,
  staticPagesDbPath,
  staticPagesEpoch,
} from "@/web/ui/core/server/static_pages.server";
import {
  defaultDictLandingState,
  dictLandingPageKey,
  renderDictLandingPage,
} from "@/web/ui/dict/dict_routes.server";
import { EXTERNAL_LANDING_PAGE_KEY } from "@/web/ui/external/external_routes.server";
import { renderExternalLandingPageHtml } from "@/web/ui/external/external.server";
import { renderLibraryPageHtml } from "@/web/ui/library/library.server";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { MACRONIZER_PAGE_KEY } from "@/web/ui/macronizer/macronizer_routes.server";
import { renderMacronizerPage } from "@/web/ui/macronizer/macronizer_view.server";

export interface StaticPageSeed {
  readonly key: string;
  readonly render: () => string | Promise<string>;
}

/** The corpus landing never queries the engine; this one proves it. */
const NO_CORPUS_ENGINE: CorpusEngine = {
  runQuery: () => {
    throw new Error("The corpus landing page must not run a query.");
  },
};

interface SeedOptions {
  /** Overrides the corpus author list source (tests). */
  readonly loadAuthors?: CorpusRoutesOptions["loadAuthors"];
}

/** Every seeded page, in no particular order. */
export function staticPageSeeds(options: SeedOptions = {}): StaticPageSeed[] {
  const loadAuthors = options.loadAuthors ?? loadCorpusAuthors;
  const corpusParams = parseCorpusParams({});
  const dictViews = [
    { isEmbedded: false, servedAtRoot: true },
    { isEmbedded: false, servedAtRoot: false },
    { isEmbedded: true, servedAtRoot: false },
  ];
  const corpusKey = corpusLandingPageKey(corpusParams);
  if (corpusKey === undefined) {
    throw new Error("Default corpus params must describe the landing page.");
  }
  return [
    { key: ABOUT_PAGE_KEY, render: renderAboutPageHtml },
    { key: LIBRARY_PAGE_KEY, render: renderLibraryPageHtml },
    { key: MACRONIZER_PAGE_KEY, render: () => renderMacronizerPage() },
    {
      key: EXTERNAL_LANDING_PAGE_KEY,
      render: () => renderExternalLandingPageHtml(),
    },
    {
      key: corpusKey,
      render: async () =>
        renderCorpusPageHtml(
          await runCorpusSearch(
            corpusParams,
            NO_CORPUS_ENGINE,
            await loadAuthors()
          )
        ),
    },
    ...dictViews.map((view) => {
      const state = defaultDictLandingState(view);
      return {
        key: dictLandingPageKey(state),
        render: () => renderDictLandingPage(state),
      };
    }),
  ];
}

/** Renders every seed: key -> HTML. */
export async function renderStaticPages(
  options: SeedOptions = {}
): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  for (const seed of staticPageSeeds(options)) {
    if (pages.has(seed.key)) {
      throw new Error(`Duplicate static page key: ${seed.key}`);
    }
    pages.set(seed.key, await seed.render());
  }
  return pages;
}

/**
 * Fails the build if an input a seeded page depends on is missing. The
 * renderers degrade quietly (an empty library, a corpus page with no author
 * list), which is right for a running server and wrong for a build artifact.
 */
async function checkSeedInputs(): Promise<void> {
  const summaries = await getV2LibrarySummaries();
  if (summaries.length === 0) {
    throw new Error(
      "Static pages: the library is empty; build the library DB first."
    );
  }
  if ((await loadCorpusAuthors()) === undefined) {
    throw new Error(
      "Static pages: the corpus author list is missing; build the corpus first."
    );
  }
}

/**
 * Pre-renders and pre-compresses the static pages into `destination`. Runs
 * last in the production build: it needs the library DB, the corpus author
 * list, the client bundle's manifest and the commit id, and the epoch it
 * records must be the one the server computes at startup.
 */
export async function buildStaticPagesDb(
  destination: string = staticPagesDbPath()
): Promise<void> {
  const epoch = staticPagesEpoch();
  if (epoch === undefined) {
    throw new Error(
      "Static pages need a build version (COMMIT_ID) and a built client bundle (manifest.json)."
    );
  }
  await checkSeedInputs();
  const start = performance.now();
  const pages = await renderStaticPages();
  saveStaticPagesDb(destination, epoch, pages);
  console.log(
    `Saved ${pages.size} static pages to ${destination} in ${Math.round(
      performance.now() - start
    )} ms (epoch ${epoch}).`
  );
}
