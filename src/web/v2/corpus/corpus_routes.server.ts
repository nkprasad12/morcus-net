import { Router } from "express";
import { createAsyncRegistrars } from "@/web/v2/core/async_handler.server";
import { isPartialRequest } from "@/web/v2/core/request_params.server";
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

/** A versioned shard URL (`?v=<commit>`) never changes its response. */
const VERSIONED_LEMMATA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface CorpusRoutesOptions {
  /** The Rust engine; without one, `/v2/corpus` answers 503. */
  readonly engine?: CorpusEngine;
  /** Overrides the author list source (tests). */
  readonly loadAuthors?: () => Promise<readonly string[] | undefined>;
  /** Overrides the lemma list source (tests). */
  readonly loadLemmata?: () => Promise<readonly string[] | undefined>;
  /**
   * Versions the lemma shard URLs the page links to, so browsers can cache
   * them forever. Defaults to `process.env.COMMIT_ID`.
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
  const lemmataVersion = (): string | undefined => {
    const commit = (options.commitId ?? process.env.COMMIT_ID)?.trim();
    return commit ? commit : undefined;
  };

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
    // Without a version, the URL outlives a corpus rebuild: revalidate.
    const versioned = typeof req.query.v === "string" && req.query.v !== "";
    res.setHeader(
      "Cache-Control",
      versioned ? VERSIONED_LEMMATA_CACHE_CONTROL : "no-cache"
    );
    res.type("json").send(shards.get(letter.toLowerCase()) ?? "[]");
  });

  return router;
}
