import express, { Router, Request, Response } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { renderAboutPageHtml } from "@/web/v2/about/about.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { asyncHandler } from "@/web/v2/core/async_handler.server";
import { createDictRoutes } from "@/web/v2/dict/dict.server";
import { createReaderRoutes } from "@/web/v2/reader/reader.server";
import { createExternalRoutes } from "@/web/v2/external/external_routes.server";
import { createApiRoutes, ApiRoutesOptions } from "@/web/v2/api_routes.server";
import { createCorpusRoutes } from "@/web/v2/corpus/corpus_routes.server";
import type { CorpusEngine } from "@/web/v2/corpus/corpus_query.server";
import { createMacronizerRoutes } from "@/web/v2/macronizer/macronizer_routes.server";
import type { MacronizerEngine } from "@/web/v2/macronizer/macronizer_engine.server";
import { getV2BuildDir } from "@/bundler/v2_build_contract";
import { IMMUTABLE_CACHE_CONTROL } from "@/web/v2/core/build_version.server";

export interface V2RouterOptions extends ApiRoutesOptions {
  /** The corpus query engine; `/v2/corpus` answers 503 without one. */
  corpus?: CorpusEngine;
  /** The macronizer engine; `POST /v2/macronizer` answers 503 without one. */
  macronizer?: MacronizerEngine;
}

export function createV2Router(
  fusedDict: FusedDictionary,
  options?: V2RouterOptions
): Router {
  const router = Router();
  router.use(express.json());

  // Root redirect to dictionary
  router.get("/", (_req: Request, res: Response) => {
    res.redirect("/v2/dicts");
  });

  // The manifest is a build artifact for the server, not a client asset.
  router.get("/assets/manifest.json", (_req: Request, res: Response) => {
    res.status(404).end();
  });

  // Serve the hashed, minified v2.css / v2.js built by `src/bundler/v2.rsbuild.ts`
  router.use(
    "/assets",
    express.static(getV2BuildDir(), {
      // Filenames are content-hashed, so they're safe to cache forever.
      setHeaders: (res) => {
        res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
      },
    })
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

  return router;
}
