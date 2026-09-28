import { Router } from "express";
import { createAsyncRegistrars } from "@/web/v2/core/async_handler.server";
import { isPartialRequest } from "@/web/v2/core/request_params.server";
import {
  CorpusUnavailableError,
  loadCorpusAuthors,
  parseCorpusParams,
  runCorpusSearch,
  type CorpusEngine,
} from "@/web/v2/corpus/corpus_query.server";
import {
  renderCorpusPageHtml,
  renderCorpusPartialHtml,
  renderCorpusUnavailableHtml,
} from "@/web/v2/corpus/corpus_view.server";

export interface CorpusRoutesOptions {
  /** The Rust engine; without one, `/v2/corpus` answers 503. */
  readonly engine?: CorpusEngine;
  /** Overrides the author list source (tests). */
  readonly loadAuthors?: () => Promise<readonly string[] | undefined>;
}

export function createCorpusRoutes(options: CorpusRoutesOptions = {}): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);
  const loadAuthors = options.loadAuthors ?? loadCorpusAuthors;

  getAsync("/corpus", async (req, res) => {
    const params = parseCorpusParams(req.query);
    // The same URL answers with a full page or a partial (DESIGN §4).
    res.setHeader("Vary", "X-Requested-With");
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
      res.send(
        isPartialRequest(req)
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

  return router;
}
