import { Router, type Request, type Response } from "express";
import type { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import {
  findReaderWork,
  renderReaderPageHtml,
  renderReaderPartialHtml,
  renderReaderTranslationHtml,
} from "@/web/v2/reader/reader.server";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/v2/reader/reader_loader.server";
import { createAsyncRegistrars } from "@/web/v2/core/server/async_handler.server";
import { renderNotFoundPageHtml } from "@/web/v2/library/not_found.server";
import { isPartialRequest } from "@/web/v2/core/server/request_params.server";
import { setVersionedCacheControl } from "@/web/v2/core/server/build_version.server";
import { requestTimer } from "@/web/v2/core/server/telemetry.server";
import { getFirstHighlightSectionId } from "@/web/v2/reader/reader_highlight.common";

function redirectReaderJump(
  res: Response,
  work: V2PreprocessedWork,
  jump: string,
  query: string,
  matchText: string = ""
): void {
  const resolved = resolvePageInWork(work, jump);
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (matchText) params.set("matchText", matchText);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const pageId = Array.isArray(resolved.page.id)
    ? resolved.page.id.join(".")
    : resolved.page.id;
  const hash = jump && jump !== pageId ? `#sec-${jump}` : "";
  res.redirect(
    302,
    `/work/${work.urlAuthor}/${work.urlName}/${pageId}${qStr}${hash}`
  );
}

/**
 * Resolves legacy V1 `?id=` (section/page citation) or `?pg=` (1-based page
 * index) query parameters when `:page` is omitted from a reader route.
 */
function resolveLegacyPageJump(
  work: V2PreprocessedWork,
  req: Request,
  pageId: string | undefined
): string | undefined {
  if (pageId) return undefined;
  const rawId = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (rawId) return rawId;
  const rawPg = typeof req.query.pg === "string" ? req.query.pg.trim() : "";
  if (!rawPg) return undefined;
  if (/^\d+$/.test(rawPg) && work.pages.length > 0) {
    const pgIndex = Math.min(
      work.pages.length - 1,
      Math.max(0, Number.parseInt(rawPg, 10) - 1)
    );
    const page = work.pages[pgIndex];
    return Array.isArray(page.id) ? page.id.join(".") : page.id;
  }
  return rawPg;
}

async function sendReaderPassage(
  req: Request,
  res: Response,
  options: {
    work: V2PreprocessedWork;
    pageId?: string;
    query: string;
    matchText: string;
    isPartial: boolean;
    logMessage: string;
    errorMessage: string;
  }
): Promise<void> {
  try {
    if (options.isPartial) {
      const body = await renderReaderPartialHtml({
        work: options.work,
        pageId: options.pageId,
        query: options.query,
        matchText: options.matchText,
      });
      // Page turns fetch `?v=`; the partial depends only on the URL.
      setVersionedCacheControl(req, res, { scope: "private" });
      res.send(body);
    } else {
      res.send(
        await renderReaderPageHtml({
          work: options.work,
          pageId: options.pageId,
          query: options.query,
          matchText: options.matchText,
        })
      );
    }
  } catch (err) {
    console.error(options.logMessage, err);
    res.status(500).send(options.errorMessage);
  }
}

export function createReaderRoutes(): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);

  // TODO(reader-nojs): Zero-JS translation baseline support.
  // Lazy-loading translation partial endpoint: /work/:author/:name/:page/translation
  getAsync("/work/:author/:name/:page/translation", async (req, res) => {
    const work = await findReaderWork(req.params.author, req.params.name);
    requestTimer(res).mark("lookupComplete");
    const body = work
      ? renderReaderTranslationHtml(work, req.params.page)
      : null;
    if (body === null) {
      res.status(404).send("Translation not found");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    setVersionedCacheControl(req, res, { scope: "private" });
    res.send(body);
  });

  // Human-readable reader route: /work/:author/:name/:page?
  getAsync("/work/:author/:name/:page?", async (req, res) => {
    const author = req.params.author;
    const name = req.params.name;
    const pageId = req.params.page;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const matchText =
      typeof req.query.matchText === "string" ? req.query.matchText.trim() : "";
    const jump =
      typeof req.query.jump === "string" ? req.query.jump.trim() : "";
    const isPartial = isPartialRequest(req, res);

    const work = await findReaderWork(author, name);
    requestTimer(res).mark("lookupComplete");

    if (!work) {
      res.status(404).send(
        renderNotFoundPageHtml({
          workSlug: `${author}/${name}`,
        })
      );
      return;
    }

    // A `matchText` or legacy `?id=` / `?pg=` link without a page redirects
    // like a jump, so the URL is canonical and `#sec-` scrolls No-JS readers
    // to the match.
    const jumpTarget =
      jump ||
      resolveLegacyPageJump(work, req, pageId) ||
      (pageId ? undefined : getFirstHighlightSectionId(matchText));
    if (jumpTarget) {
      redirectReaderJump(res, work, jumpTarget, query, matchText);
      return;
    }

    await sendReaderPassage(req, res, {
      work,
      pageId,
      query,
      matchText,
      isPartial,
      logMessage: "Error rendering reader work:",
      errorMessage: "Error rendering reader passage",
    });
  });

  // Legacy V1 work ID route: /work/:workId (e.g. /work/phi0448.phi001.perseus-lat2?id=1.1.1)
  getAsync("/work/:workId", async (req, res) => {
    const workId = req.params.workId;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const matchText =
      typeof req.query.matchText === "string" ? req.query.matchText.trim() : "";
    const jump =
      typeof req.query.jump === "string" ? req.query.jump.trim() : "";

    const work = await getV2Work(workId);
    requestTimer(res).mark("lookupComplete");

    if (!work) {
      res.status(404).send(
        renderNotFoundPageHtml({
          workSlug: workId,
        })
      );
      return;
    }

    const jumpTarget =
      jump ||
      resolveLegacyPageJump(work, req, undefined) ||
      getFirstHighlightSectionId(matchText) ||
      "";
    redirectReaderJump(res, work, jumpTarget, query, matchText);
  });

  // General reader route: handles jumps, legacy query parameters, and default work
  getAsync("/work", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const matchText =
      typeof req.query.matchText === "string" ? req.query.matchText.trim() : "";
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
    const isPartial = isPartialRequest(req, res);

    const work =
      (await getV2Work(workId)) ||
      (await getV2Work("caesar_de_bello_gallico")) ||
      (await getV2Work("phi0448.phi001.perseus-lat2"));
    requestTimer(res).mark("lookupComplete");

    if (!work) {
      res.redirect(302, "/library");
      return;
    }

    const jumpTarget =
      jump || (pageId ? undefined : getFirstHighlightSectionId(matchText));
    if (jumpTarget) {
      redirectReaderJump(res, work, jumpTarget, query, matchText);
      return;
    }

    await sendReaderPassage(req, res, {
      work,
      pageId,
      query,
      matchText,
      isPartial,
      logMessage: "Error rendering reader view:",
      errorMessage: "Error rendering reader view",
    });
  });

  return router;
}
