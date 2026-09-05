import express, { Router, Request, Response } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  renderDictPageHtml,
  renderDictResultsHtml,
} from "@/web/pe/server/dict_ssr";
import { renderAboutPageHtml } from "@/web/pe/server/about_ssr";
import * as path from "path";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

const PE_ASSETS_DIR = path.resolve(process.cwd(), "build/pe");
// Filenames are content-hashed by esbuild, so they're safe to cache forever.
const PE_ASSETS_CACHE_CONTROL = "public, max-age=311040000, immutable";

export function createPeRouter(fusedDict: FusedDictionary): Router {
  const router = Router();

  // Root redirect to dictionary
  router.get("/", (_req: Request, res: Response) => {
    res.redirect("/pe/dicts");
  });

  // The manifest is a build artifact for the server, not a client asset.
  router.get("/assets/manifest.json", (_req: Request, res: Response) => {
    res.status(404).end();
  });

  // Serve the hashed, minified pe.css / pe.js built by `src/bundler/pe.esbuild.ts`
  router.use(
    "/assets",
    express.static(PE_ASSETS_DIR, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", PE_ASSETS_CACHE_CONTROL);
      },
    })
  );

  // Autocomplete endpoint for live search suggestions
  router.get("/api/completions", async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) {
      res.json([]);
      return;
    }

    try {
      const completionsResult = await fusedDict.getCompletions({
        query,
        dicts: ALL_LATIN_DICTS,
      });
      // Deduplicate and flatten suggestions across dictionaries
      const set = new Set<string>();
      for (const key of Object.keys(completionsResult)) {
        for (const item of completionsResult[key] || []) {
          set.add(item);
        }
      }
      res.json(Array.from(set).slice(0, 10));
    } catch (err) {
      console.error("Error in completions:", err);
      res.json([]);
    }
  });

  // Main dictionary route: handles both full SSR (HTML page) and AJAX partials
  router.get("/dicts", async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";

    if (!query) {
      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderDictResultsHtml(""));
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderDictPageHtml({ query: "" }));
      return;
    }

    try {
      const results = await fusedDict.getEntry({
        query,
        dicts: ALL_LATIN_DICTS,
        mode: 1, // Search by keys and inflected forms
      });

      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderDictResultsHtml(query, results));
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderDictPageHtml({ query, results }));
    } catch (err) {
      console.error("Error retrieving dictionary entry:", err);
      if (isPartial) {
        res
          .status(500)
          .send(
            `<div class="pe-no-results"><p>An error occurred searching for "${query}".</p></div>`
          );
        return;
      }
      res.status(500).send(renderDictPageHtml({ query }));
    }
  });

  // ID-based dictionary lookup route
  router.get("/dicts/id/:id", async (req: Request, res: Response) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";

    if (!id) {
      res.redirect("/pe/dicts");
      return;
    }

    try {
      const results = await fusedDict.getEntry({
        query: id,
        dicts: ALL_LATIN_DICTS,
        mode: 2, // Search by ID
      });

      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderDictResultsHtml(id, results));
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderDictPageHtml({ query: id, results, isIdSearch: true }));
    } catch (err) {
      console.error("Error retrieving dictionary entry by ID:", err);
      if (isPartial) {
        res
          .status(500)
          .send(
            `<div class="pe-no-results"><p>An error occurred retrieving ID "${id}".</p></div>`
          );
        return;
      }
      res.status(500).send(renderDictPageHtml({ query: id, isIdSearch: true }));
    }
  });

  // About page route
  router.get("/about", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderAboutPageHtml());
  });

  return router;
}
