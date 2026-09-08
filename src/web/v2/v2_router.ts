import express, { Router, Request, Response } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  renderDictPageHtml,
  renderDictResultsHtml,
} from "@/web/v2/dict/dict.server";
import { renderAboutPageHtml } from "@/web/v2/about/about.server";
import { renderReaderPageHtml } from "@/web/v2/reader/reader.server";
import { GitHub } from "@/web/utils/github";
import type { ReportApiRequest } from "@/web/api_routes";
import * as path from "path";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

const V2_ASSETS_DIR = path.resolve(process.cwd(), "build/v2");
// Filenames are content-hashed by esbuild, so they're safe to cache forever.
const V2_ASSETS_CACHE_CONTROL = "public, max-age=311040000, immutable";

export interface V2RouterOptions {
  reportHandler?: (request: ReportApiRequest) => Promise<void>;
  githubToken?: string;
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
    express.static(V2_ASSETS_DIR, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", V2_ASSETS_CACHE_CONTROL);
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
            `<div class="v2-no-results"><p>An error occurred searching for "${query}".</p></div>`
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
      res.redirect("/v2/dicts");
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
            `<div class="v2-no-results"><p>An error occurred retrieving ID "${id}".</p></div>`
          );
        return;
      }
      res.status(500).send(renderDictPageHtml({ query: id, isIdSearch: true }));
    }
  });

  // Reader prototype route: demonstrates two-panel reader with embedded dictionary
  router.get("/reader", async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!query) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderReaderPageHtml());
      return;
    }

    try {
      const results = await fusedDict.getEntry({
        query,
        dicts: ALL_LATIN_DICTS,
        mode: 1, // Search by keys and inflected forms
      });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderReaderPageHtml({ query, results }));
    } catch (err) {
      console.error("Error retrieving reader dictionary entry:", err);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderReaderPageHtml({ query }));
    }
  });

  // About page route
  router.get("/about", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderAboutPageHtml());
  });

  // Issue and feedback reporting endpoint
  router.post("/api/report", async (req: Request, res: Response) => {
    const reportText =
      typeof req.body?.reportText === "string"
        ? req.body.reportText.trim()
        : "";
    if (!reportText) {
      res.status(400).json({ error: "reportText is required" });
      return;
    }

    const reportRequest: ReportApiRequest = {
      reportText,
      commit: process.env.COMMIT_ID ?? "undefined",
      url: typeof req.body?.url === "string" ? req.body.url : undefined,
      userAgent: req.headers["user-agent"],
    };

    try {
      if (options?.reportHandler) {
        await options.reportHandler(reportRequest);
      } else {
        const token = options?.githubToken ?? process.env.GITHUB_TOKEN;
        if (token) {
          await GitHub.reportIssue(reportRequest, token);
        } else {
          console.log(GitHub.createIssueBody(reportRequest));
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error submitting report:", err);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  return router;
}
