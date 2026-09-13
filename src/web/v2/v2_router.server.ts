import express, { Router, Request, Response, NextFunction } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  renderDictErrorHtml,
  renderDictPageHtml,
  renderDictResultsHtml,
  resolveActiveDicts,
  resolveDictParams,
  parseInflectionParam,
  readCookie,
  formatDictsCookie,
  hasGreek,
} from "@/web/v2/dict/dict.server";
import type { DictParamsInput } from "@/web/v2/dict/dict_selection.common";
import { renderAboutPageHtml } from "@/web/v2/about/about.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import {
  renderReaderPageHtml,
  renderReaderContentHtml,
} from "@/web/v2/reader/reader.server";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/v2/reader/reader_loader.server";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { GitHub } from "@/web/utils/github";
import { trimRawQuery } from "@/common/text_cleaning";
import {
  getV2Completions,
  getV2DictChunks,
  cleanCompletionQuery,
} from "@/web/v2/dict/dict_completions.server";
import type { ReportApiRequest } from "@/web/api_routes";
import * as path from "path";
import * as he from "he";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

const V2_ASSETS_DIR = path.resolve(process.cwd(), "build/v2");
// Filenames are content-hashed by esbuild, so they're safe to cache forever.
const V2_ASSETS_CACHE_CONTROL = "public, max-age=311040000, immutable";

export interface V2RouterOptions {
  reportHandler?: (request: ReportApiRequest) => Promise<void>;
  githubToken?: string;
}

type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Adapts an async route handler to the signature Express actually expects.
 *
 * Express 4 ignores a handler's return value, so a rejection escapes as an unhandled
 * rejection — which Node terminates the process over. This is not only about `await`:
 * marking a handler `async` also turns *synchronous* throws into rejections, so it
 * silently forfeits the sync-throw handling Express does provide. Forwarding to `next`
 * restores both.
 */
function asyncHandler(
  handler: AsyncRouteHandler
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function toStringOrArray(val: unknown): string | string[] | undefined {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && val.every((item) => typeof item === "string")) {
    return val;
  }
  return undefined;
}

/**
 * Collects the competing dictionary parameters out of a request query.
 * `d` is a scalar bitmask by construction; if it somehow repeats, the last value wins, matching
 * how browsers treat repeated scalar controls.
 */
function dictParamsFromQuery(req: Request): DictParamsInput {
  const rawD = toStringOrArray(req.query.d);
  const bitmaskParam = Array.isArray(rawD)
    ? rawD[rawD.length - 1] ?? null
    : rawD ?? null;
  return {
    dictParam: toStringOrArray(req.query.dict),
    bitmaskParam,
    inParam: toStringOrArray(req.query.in),
  };
}

export function createV2Router(
  fusedDict: FusedDictionary,
  options?: V2RouterOptions
): Router {
  const router = Router();
  router.use(express.json());

  // Register async routes through these rather than `router.get`/`router.post`
  // directly, so no handler can reintroduce the unhandled-rejection crash path.
  const getAsync = (path: string, handler: AsyncRouteHandler) =>
    router.get(path, asyncHandler(handler));
  const postAsync = (path: string, handler: AsyncRouteHandler) =>
    router.post(path, asyncHandler(handler));

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
  getAsync("/api/completions", async (req, res) => {
    const rawPrefix =
      typeof req.query.prefix === "string" ? req.query.prefix : "";
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const effectiveQuery = rawPrefix || rawQuery;
    const { query, isSuffix } = cleanCompletionQuery(effectiveQuery);

    const keysFromQuery = resolveDictParams(dictParamsFromQuery(req));
    const langParam = toStringOrArray(req.query.lang);
    const rawLimit =
      typeof req.query.limit === "string" ? req.query.limit : undefined;
    const limitParam = rawLimit ? parseInt(rawLimit, 10) : NaN;
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 50000)
        : 25;

    const { dictKeys } = resolveActiveDicts({
      keysFromQuery,
      cookieHeader: req.headers.cookie,
      lang: langParam,
    });

    const activeDicts = dictKeys.length > 0 ? dictKeys : ALL_LATIN_DICTS;

    // Suffix searches (-arum, -ibus): dynamic clustered completions
    if (isSuffix) {
      try {
        const items = await getV2Completions(fusedDict, {
          rawQuery: query,
          activeDictKeys: activeDicts,
          limit,
        });
        res.json(items);
      } catch (err) {
        console.error("Error in suffix completions:", err);
        res.json([]);
      }
      return;
    }

    // Prefix searches: return dictionary-keyed chunk with aggressive HTTP cache
    try {
      const chunks = await getV2DictChunks(fusedDict, {
        rawPrefix: query,
        activeDictKeys: keysFromQuery ? activeDicts : undefined,
      });
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=604800"
      );
      res.json(chunks);
    } catch (err) {
      console.error("Error in completions chunk:", err);
      res.json({});
    }
  });

  // Main dictionary route: handles both full SSR (HTML page) and AJAX partials
  getAsync("/dicts", async (req, res) => {
    const query =
      typeof req.query.q === "string" ? trimRawQuery(req.query.q) : "";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";
    const isEmbedded =
      req.query.embedded === "1" ||
      req.headers["sec-fetch-dest"] === "iframe" ||
      req.headers.referer?.includes("embedded=1") === true;

    // Resolve dictionary selection based on precedence:
    // Query ('dict' checkboxes > 'd' bitmask > legacy 'in') > Cookie ('morcus_dicts')
    // > Default (All Latin except Pozo)
    const keysFromQuery = resolveDictParams(dictParamsFromQuery(req));
    const langParam = toStringOrArray(req.query.lang);
    const cookieHeader = req.headers.cookie;

    // Resolve inflection mode: o=0 (exact headwords, mode: 0) vs o=1 (inflected forms, mode: 1,
    // default). No-JS forms pair a hidden "0" with a checkbox "1", so a checked box arrives as
    // ["0", "1"]; parseInflectionParam owns that shape.
    const oParam = parseInflectionParam(toStringOrArray(req.query.o));
    const isInflected =
      oParam ?? readCookie(cookieHeader, "morcus_inflected") !== "0";

    const { dictKeys, source } = resolveActiveDicts({
      keysFromQuery,
      cookieHeader,
      lang: langParam,
    });

    // Persist explicit choices from full page form submissions so No-JS users keep them across
    // sessions. The two cookies are written independently: a submission may legitimately change
    // the inflection toggle while its dictionaries still resolve from the existing cookie.
    // `langParam` requests are scoped views (e.g. the embedded reader iframe) and never persist.
    if (!isPartial && !langParam) {
      const cookies: string[] = [];
      if (source === "url" && dictKeys.length > 0) {
        cookies.push(formatDictsCookie(dictKeys));
      }
      if (oParam !== undefined) {
        cookies.push(
          `morcus_inflected=${
            oParam ? "1" : "0"
          }; Path=/; Max-Age=31536000; SameSite=Lax`
        );
      }
      if (cookies.length > 0) {
        res.setHeader("Set-Cookie", cookies);
      }
    }

    if (!query) {
      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderDictResultsHtml("", undefined, dictKeys, isInflected));
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        renderDictPageHtml({
          query: "",
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
        })
      );
      return;
    }

    if (hasGreek(query)) {
      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(
          renderDictResultsHtml(query, undefined, dictKeys, isInflected)
        );
        return;
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        renderDictPageHtml({
          query,
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
        })
      );
      return;
    }

    try {
      const results = await fusedDict.getEntry({
        query,
        dicts: dictKeys,
        mode: isInflected ? 1 : 0, // 1: inflected forms, 0: exact headwords
      });

      if (isPartial) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderDictResultsHtml(query, results, dictKeys, isInflected));
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        renderDictPageHtml({
          query,
          results,
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
        })
      );
    } catch (err) {
      console.error("Error retrieving dictionary entry:", err);
      if (isPartial) {
        res.status(500).send(renderDictErrorHtml(query));
        return;
      }
      res.status(500).send(
        renderDictPageHtml({
          query,
          embedded: isEmbedded,
          queriedDicts: dictKeys,
        })
      );
    }
  });

  // ID-based dictionary lookup route
  getAsync("/dicts/id/:id", async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";
    const isEmbedded =
      req.query.embedded === "1" ||
      req.headers["sec-fetch-dest"] === "iframe" ||
      req.headers.referer?.includes("embedded=1") === true;

    if (!id) {
      res.redirect("/v2/dicts");
      return;
    }

    // A query on an article path means the user searched from that page before
    // the client normalised the URL. Honour the search, not the stale id.
    const searchQuery = typeof req.query.q === "string" ? req.query.q : "";
    if (searchQuery && !isPartial) {
      res.redirect(`/v2/dicts?${new URLSearchParams({ q: searchQuery })}`);
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
      res.send(
        renderDictPageHtml({
          query: id,
          results,
          isIdSearch: true,
          embedded: isEmbedded,
        })
      );
    } catch (err) {
      console.error("Error retrieving dictionary entry by ID:", err);
      if (isPartial) {
        res.status(500).send(renderDictErrorHtml(id, true));
        return;
      }
      res.status(500).send(
        renderDictPageHtml({
          query: id,
          isIdSearch: true,
          embedded: isEmbedded,
        })
      );
    }
  });

  // Library Catalog route
  getAsync("/library", async (_req, res) => {
    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      const html = await renderLibraryPageHtml();
      res.send(html);
    } catch (err) {
      console.error("Error rendering library catalog:", err);
      res.status(500).send("Error rendering library catalog");
    }
  });

  // Human-readable reader route: /v2/reader/:author/:name/:page?
  getAsync("/reader/:author/:name/:page?", async (req, res) => {
    const author = req.params.author;
    const name = req.params.name;
    const pageId = req.params.page;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const view = req.query.view === "parallel" ? "parallel" : "single";
    const jump =
      typeof req.query.jump === "string" ? req.query.jump.trim() : "";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";

    const work =
      (await getV2Work(`${author}/${name}`)) ||
      (await getV2Work(`${author}_${name}`));

    if (!work) {
      res.status(404).send(
        renderPageShell({
          title: "Work Not Found - Morcus Latin Tools",
          activePage: "library",
          contentHtml: `
            <div class="v2-library-empty-state" style="margin: 4rem auto; max-width: 600px;">
              <h2 class="v2-library-empty-title">Classical Work Not Found</h2>
              <p class="v2-library-empty-desc">Could not locate classical work <em>${he.encode(
                `${author}/${name}`
              )}</em> in the library catalog.</p>
              <a href="/v2/library" class="v2-btn v2-btn-primary">Browse Full Library</a>
            </div>
          `,
        })
      );
      return;
    }

    if (jump) {
      const resolved = resolvePageInWork(work, jump);
      const params = new URLSearchParams();
      if (view === "parallel") params.set("view", "parallel");
      if (query) params.set("q", query);
      const qStr = params.toString() ? `?${params.toString()}` : "";
      res.redirect(
        302,
        `/v2/reader/${work.urlAuthor}/${work.urlName}/${resolved.page.id}${qStr}`
      );
      return;
    }

    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (isPartial) {
        res.send(
          await renderReaderContentHtml({
            work,
            pageId,
            query,
            view,
          })
        );
      } else {
        res.send(
          await renderReaderPageHtml({
            work,
            pageId,
            query,
            view,
          })
        );
      }
    } catch (err) {
      console.error("Error rendering reader work:", err);
      res.status(500).send("Error rendering reader passage");
    }
  });

  // General reader route: handles jumps, legacy query parameters, and default work
  getAsync("/reader", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const workId =
      typeof req.query.work === "string"
        ? req.query.work.trim()
        : "caesar_de_bello_gallico";
    const pageId =
      typeof req.query.id === "string"
        ? req.query.id.trim()
        : typeof req.query.pg === "string"
        ? req.query.pg.trim()
        : undefined;
    const jump =
      typeof req.query.jump === "string" ? req.query.jump.trim() : "";
    const view = req.query.view === "parallel" ? "parallel" : "single";
    const isPartial =
      req.query.format === "partial" ||
      req.headers["x-requested-with"] === "fetch";

    const work =
      (await getV2Work(workId)) ||
      (await getV2Work("caesar_de_bello_gallico")) ||
      (await getV2Work("phi0448.phi001.perseus-lat2"));

    if (!work) {
      res.redirect(302, "/v2/library");
      return;
    }

    if (jump) {
      const resolved = resolvePageInWork(work, jump);
      const params = new URLSearchParams();
      if (view === "parallel") params.set("view", "parallel");
      if (query) params.set("q", query);
      const qStr = params.toString() ? `?${params.toString()}` : "";
      res.redirect(
        302,
        `/v2/reader/${work.urlAuthor}/${work.urlName}/${resolved.page.id}${qStr}`
      );
      return;
    }

    try {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (isPartial) {
        res.send(
          await renderReaderContentHtml({
            work,
            pageId,
            query,
            view,
          })
        );
      } else {
        res.send(
          await renderReaderPageHtml({
            work,
            pageId,
            query,
            view,
          })
        );
      }
    } catch (err) {
      console.error("Error rendering reader view:", err);
      res.status(500).send("Error rendering reader view");
    }
  });

  // About page route
  router.get("/about", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderAboutPageHtml());
  });

  // Issue and feedback reporting endpoint
  postAsync("/api/report", async (req, res) => {
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
