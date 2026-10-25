import express, { Router, Request, Response } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { renderAboutPageHtml } from "@/web/ui/about/about.server";
import { renderLibraryPageHtml } from "@/web/ui/library/library.server";
import { asyncHandler } from "@/web/ui/core/server/async_handler.server";
import { createDictRoutes } from "@/web/ui/dict/dict_routes.server";
import { createReaderRoutes } from "@/web/ui/reader/reader_routes.server";
import { createExternalRoutes } from "@/web/ui/external/external_routes.server";
import { createApiRoutes, ApiRoutesOptions } from "@/web/ui/api_routes.server";
import { createCorpusRoutes } from "@/web/ui/corpus/corpus_routes.server";
import type { CorpusEngine } from "@/web/ui/corpus/corpus_query.server";
import { createMacronizerRoutes } from "@/web/ui/macronizer/macronizer_routes.server";
import type { MacronizerEngine } from "@/web/ui/macronizer/macronizer_engine.server";
import { getV2BuildDir } from "@/bundler/client_build_contract";
import { IMMUTABLE_CACHE_CONTROL } from "@/web/ui/core/server/build_version.server";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  telemetryMiddleware,
  v2ErrorHandler,
} from "@/web/ui/core/server/telemetry.server";

interface V2RouterOptions extends ApiRoutesOptions {
  /** The corpus query engine; `/corpus` answers 503 without one. */
  corpus?: CorpusEngine;
  /** The macronizer engine; `POST /macronizer` answers 503 without one. */
  macronizer?: MacronizerEngine;
  /**
   * Receives one `ApiCalls` row per routed request (see `telemetry.server.ts`).
   * Defaults to a no-op logger.
   */
  telemetry?: Promise<TelemetryLogger>;
}

export function createV2Router(
  fusedDict: FusedDictionary,
  options?: V2RouterOptions
): Router {
  const router = Router();
  router.use(express.json());

  // The manifest is a build artifact for the server, not a client asset.
  router.get("/assets/manifest.json", (_req: Request, res: Response) => {
    res.status(404).end();
  });

  // Serve the hashed, minified app.css / v2.js built by `src/bundler/client.rsbuild.ts`
  router.use(
    "/assets",
    express.static(getV2BuildDir(), {
      // Filenames are content-hashed, so they're safe to cache forever.
      setHeaders: (res) => {
        res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
      },
    })
  );

  // Request telemetry: after the static assets (not logged), before every
  // route that should be. `v2ErrorHandler` at the end completes the pair.
  router.use(
    telemetryMiddleware(
      options?.telemetry ?? Promise.resolve(TelemetryLogger.NoOp)
    )
  );

  // Mount vertical domain route handlers
  router.use(createDictRoutes(fusedDict));
  router.use(createReaderRoutes());
  router.use(createCorpusRoutes({ engine: options?.corpus }));
  router.use(createMacronizerRoutes({ engine: options?.macronizer }));
  router.use(createExternalRoutes());
  router.use(createApiRoutes(fusedDict, options));

  // Library Catalog route
  router.get(
    "/library",
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const html = await renderLibraryPageHtml();
        res.send(html);
      } catch (err) {
        console.error("Error rendering library catalog:", err);
        res.status(500).send("Error rendering library catalog");
      }
    })
  );

  // About page route
  router.get("/about", (_req: Request, res: Response) => {
    res.send(renderAboutPageHtml());
  });

  // Answers errors forwarded by handlers, so their telemetry row records the
  // failure. Must be last.
  router.use(v2ErrorHandler);

  return router;
}
