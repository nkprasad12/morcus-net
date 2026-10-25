import { Router } from "express";
import { createAsyncRegistrars } from "@/web/ui/core/server/async_handler.server";
import { setVersionedCacheControl } from "@/web/ui/core/server/build_version.server";
import {
  createInMemoryPrecompressedStore,
  precompressJson,
  sendPrecompressedJson,
  type PrecompressedJsonStore,
} from "@/web/ui/core/server/precompressed_json.server";
import { isPartialRequest } from "@/web/ui/core/server/request_params.server";
import { requestTimer } from "@/web/ui/core/server/telemetry.server";
import {
  buildLemmaShards,
  openCorpusLemmaStore,
} from "@/web/ui/corpus/corpus_lemmata.server";
import {
  CorpusUnavailableError,
  loadCorpusAuthors,
  parseCorpusParams,
  runCorpusSearch,
  type CorpusEngine,
} from "@/web/ui/corpus/corpus_query.server";
import {
  renderCorpusPageHtml,
  renderCorpusPartialHtml,
  renderCorpusUnavailableHtml,
} from "@/web/ui/corpus/corpus_view.server";
import type { CorpusParams } from "@/web/ui/corpus/corpus_params.common";
import {
  sendStaticPageOr,
  type StaticPageStore,
} from "@/web/ui/core/server/static_pages.server";

const EMPTY_JSON_ARRAY_ROW = precompressJson("[]");

/**
 * The static page key for the corpus landing (`static_pages.server.ts`): the
 * empty-query page, which still renders the settings into its tray and form.
 * `undefined` for a search.
 */
export function corpusLandingPageKey(params: CorpusParams): string | undefined {
  if (params.q.length > 0) return undefined;
  return `corpus:${params.pageSize}:${params.contextLen}:${
    params.strictMode ? "1" : "0"
  }`;
}

export interface CorpusRoutesOptions {
  /** The Rust engine; without one, `/corpus` answers 503. */
  readonly engine?: CorpusEngine;
  /** Overrides the author list source (tests). */
  readonly loadAuthors?: () => Promise<readonly string[] | undefined>;
  /** Overrides the lemma list source (tests). */
  readonly loadLemmata?: () => Promise<readonly string[] | undefined>;
  /** Pre-rendered static pages; see `static_pages.server.ts`. */
  readonly staticPages?: StaticPageStore;
}

export function createCorpusRoutes(options: CorpusRoutesOptions = {}): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);
  const loadAuthors = options.loadAuthors ?? loadCorpusAuthors;

  let lemmaStore: Promise<PrecompressedJsonStore | undefined> | null = null;
  const loadLemmaStore = (): Promise<PrecompressedJsonStore | undefined> => {
    if (lemmaStore === null) {
      if (options.loadLemmata !== undefined) {
        lemmaStore = options
          .loadLemmata()
          .then((lemmata) =>
            lemmata === undefined
              ? undefined
              : createInMemoryPrecompressedStore(buildLemmaShards(lemmata))
          );
      } else {
        lemmaStore = Promise.resolve(openCorpusLemmaStore());
      }
    }
    return lemmaStore;
  };

  getAsync("/corpus", async (req, res) => {
    const params = parseCorpusParams(req.query);
    // The same URL answers with a full page or a partial.
    const isPartial = isPartialRequest(req, res);
    const engine = options.engine;
    if (engine === undefined) {
      res.status(503).send(renderCorpusUnavailableHtml());
      return;
    }
    try {
      // The lookup runs inside the render callback so a static landing hit
      // skips it (and doesn't mark `lookupComplete`).
      await sendStaticPageOr(
        req,
        res,
        options.staticPages,
        isPartial ? undefined : corpusLandingPageKey(params),
        async () => {
          const view = await runCorpusSearch(
            params,
            engine,
            await loadAuthors()
          );
          requestTimer(res).mark("lookupComplete");
          if (isPartial) {
            const body = renderCorpusPartialHtml(view).toString();
            setVersionedCacheControl(req, res, { scope: "private" });
            return body;
          }
          return renderCorpusPageHtml(view);
        }
      );
    } catch (err: unknown) {
      if (err instanceof CorpusUnavailableError) {
        console.warn("Corpus engine unavailable:", err.message);
        res.status(503).send(renderCorpusUnavailableHtml());
        return;
      }
      console.error("Error running corpus search:", err);
      res.status(500).send("Error running corpus search");
    }
  });

  // The lemmata starting with one letter, for the autocomplete.
  getAsync("/api/corpus/lemmata/:letter", async (req, res) => {
    const letter = req.params.letter;
    if (letter.length !== 1) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ error: "Expected a single letter." });
      return;
    }
    const store = await loadLemmaStore();
    requestTimer(res).mark("lookupComplete");
    if (store === undefined) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({ error: "Corpus lemmata unavailable." });
      return;
    }
    // Without the current version, the URL outlives a corpus rebuild.
    setVersionedCacheControl(req, res);
    const row = store.get(letter.toLowerCase()) ?? EMPTY_JSON_ARRAY_ROW;
    sendPrecompressedJson(req, res, row);
  });

  return router;
}
