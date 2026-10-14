import { Router } from "express";
import { createAsyncRegistrars } from "@/web/v2/core/server/async_handler.server";
import {
  getBuildVersion,
  setVersionedCacheControl,
} from "@/web/v2/core/server/build_version.server";
import { isPartialRequest } from "@/web/v2/core/server/request_params.server";
import {
  buildLemmaShards,
  loadCorpusLemmata,
  type LemmaShards,
} from "@/web/v2/corpus/corpus_lemmata.server";
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
  /** Overrides the lemma list source (tests). */
  readonly loadLemmata?: () => Promise<readonly string[] | undefined>;
  /**
   * Versions the lemma shard URLs the page links to, so browsers can cache
   * them forever. Defaults to `getBuildVersion()`.
   */
  readonly commitId?: string;
}

export function createCorpusRoutes(options: CorpusRoutesOptions = {}): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);
  const loadAuthors = options.loadAuthors ?? loadCorpusAuthors;
  const loadLemmata = options.loadLemmata ?? loadCorpusLemmata;

  let lemmaShards: Promise<LemmaShards | undefined> | null = null;
  const loadLemmaShards = () => {
    if (lemmaShards === null) {
      lemmaShards = loadLemmata().then((lemmata) =>
        lemmata === undefined ? undefined : buildLemmaShards(lemmata)
      );
    }
    return lemmaShards;
  };

  /** Read per request: the server sets `COMMIT_ID` at startup. */
  const lemmataVersion = () => getBuildVersion(options.commitId);

  getAsync("/corpus", async (req, res) => {
    const params = parseCorpusParams(req.query);
    // The same URL answers with a full page or a partial (DESIGN §4).
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
      res.send(
        isPartial
          ? renderCorpusPartialHtml(view).toString()
          : renderCorpusPageHtml(view, lemmataVersion())
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

  // The lemmata starting with one letter, for the autocomplete (DESIGN §7.2).
  getAsync("/api/corpus/lemmata/:letter", async (req, res) => {
    const letter = req.params.letter;
    if (letter.length !== 1) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({ error: "Expected a single letter." });
      return;
    }
    const shards = await loadLemmaShards();
    if (shards === undefined) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({ error: "Corpus lemmata unavailable." });
      return;
    }
    // Without the current version, the URL outlives a corpus rebuild.
    setVersionedCacheControl(req, res, lemmataVersion());
    res.type("json").send(shards.get(letter.toLowerCase()) ?? "[]");
  });

  return router;
}
