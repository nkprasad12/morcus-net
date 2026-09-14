import express, { Router, Request, Response } from "express";
import * as path from "path";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { renderAboutPageHtml } from "@/web/v2/about/about.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { asyncHandler } from "@/web/v2/core/async_handler.server";
import { createDictRoutes } from "@/web/v2/dict/dict.server";
import { createReaderRoutes } from "@/web/v2/reader/reader.server";
import { createApiRoutes, ApiRoutesOptions } from "@/web/v2/api_routes.server";

const V2_ASSETS_DIR = path.resolve(process.cwd(), "build/v2");
// Filenames are content-hashed by esbuild, so they're safe to cache forever.
const V2_ASSETS_CACHE_CONTROL = "public, max-age=311040000, immutable";

export type V2RouterOptions = ApiRoutesOptions;

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
    express.static(V2_ASSETS_DIR, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", V2_ASSETS_CACHE_CONTROL);
      },
    })
  );

  // Mount vertical domain route handlers
  router.use(createDictRoutes(fusedDict));
  router.use(createReaderRoutes());
  router.use(createApiRoutes(fusedDict, options));

  // Library Catalog route
  router.get(
    "/library",
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
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
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderAboutPageHtml());
  });

  return router;
}
