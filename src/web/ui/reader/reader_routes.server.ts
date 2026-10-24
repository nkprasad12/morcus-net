import { Router, type Request, type Response } from "express";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import {
  findReaderWork,
  renderReaderPageHtml,
  renderReaderPartialHtml,
  renderReaderTranslationHtml,
} from "@/web/ui/reader/reader.server";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/ui/reader/reader_loader.server";
import { createAsyncRegistrars } from "@/web/ui/core/server/async_handler.server";
import { renderNotFoundPageHtml } from "@/web/ui/library/not_found.server";
import { isPartialRequest } from "@/web/ui/core/server/request_params.server";
import { setVersionedCacheControl } from "@/web/ui/core/server/build_version.server";
import { requestTimer } from "@/web/ui/core/server/telemetry.server";
import { getFirstHighlightSectionId } from "@/web/ui/reader/reader_highlight.common";

function redirectReaderJump(
  res: Response,
  work: V2PreprocessedWork,
  jump: string,
  query: string,
  matchText: string = "",
  currentPageId?: string
): void {
  const resolved = resolvePageInWork(work, jump);
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (matchText) params.set("matchText", matchText);
  if (!resolved.matched) {
    params.set("jumpMiss", jump);
    const basePath = `/work/${work.urlAuthor}/${work.urlName}${
      currentPageId ? `/${encodeURIComponent(currentPageId)}` : ""
    }`;
    res.redirect(302, `${basePath}?${params.toString()}#reader-toc-drawer`);
    return;
  }
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const pageId = Array.isArray(resolved.page.id)
    ? resolved.page.id.join(".")
    : resolved.page.id;
  const cleanJump = jump
    .replace(/^(book|liber|chapter|caput|section|elegy|poem|carmen)\s+/i, "")
    .trim();
  const hash =
    cleanJump && cleanJump !== pageId && !pageId.startsWith(cleanJump + ".")
      ? `#sec-${cleanJump}`
      : "";
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
    jumpMiss?: string;
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
        jumpMiss: options.jumpMiss,
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
          jumpMiss: options.jumpMiss,
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
    const jumpMiss =
      typeof req.query.jumpMiss === "string" ? req.query.jumpMiss.trim() : "";
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
      redirectReaderJump(res, work, jumpTarget, query, matchText, pageId);
      return;
    }

    if (pageId && !resolvePageInWork(work, pageId).matched) {
      res.status(404).send(
        renderNotFoundPageHtml({
          workSlug: `${author}/${name}/${pageId}`,
        })
      );
      return;
    }

    await sendReaderPassage(req, res, {
      work,
      pageId,
      query,
      matchText,
      jumpMiss,
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

  return router;
}
