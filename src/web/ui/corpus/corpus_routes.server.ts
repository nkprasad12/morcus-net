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

const EMPTY_JSON_ARRAY_ROW = precompressJson("[]");

export interface CorpusRoutesOptions {
  /** The Rust engine; without one, `/corpus` answers 503. */
  readonly engine?: CorpusEngine;
  /** Overrides the author list source (tests). */
  readonly loadAuthors?: () => Promise<readonly string[] | undefined>;
  /** Overrides the lemma list source (tests). */
  readonly loadLemmata?: () => Promise<readonly string[] | undefined>;
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
    if (options.engine === undefined) {
      res.status(503).send(renderCorpusUnavailableHtml(params.q));
      return;
    }
    try {
      const view = await runCorpusSearch(
        params,
        options.engine,
        await loadAuthors()
      );
      requestTimer(res).mark("lookupComplete");
      res.send(
        isPartial
          ? renderCorpusPartialHtml(view).toString()
          : renderCorpusPageHtml(view)
      );
    } catch (err: unknown) {
      if (err instanceof CorpusUnavailableError) {
        console.warn("Corpus engine unavailable:", err.message);
        res.status(503).send(renderCorpusUnavailableHtml(params.q));
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
