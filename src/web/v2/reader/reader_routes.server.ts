import { Router, Response } from "express";
import type { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import {
  renderReaderPageHtml,
  renderReaderPartialHtml,
} from "@/web/v2/reader/reader.server";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/v2/reader/reader_loader.server";
import { createAsyncRegistrars } from "@/web/v2/core/async_handler.server";
import { renderNotFoundPageHtml } from "@/web/v2/library/not_found.server";
import { isPartialRequest } from "@/web/v2/core/request_params.server";
import { getFirstHighlightSectionId } from "@/web/v2/reader/reader_highlight.common";
import * as he from "he";

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
    `/v2/reader/${work.urlAuthor}/${work.urlName}/${pageId}${qStr}${hash}`
  );
}

async function sendReaderPassage(
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
      res.send(
        await renderReaderPartialHtml({
          work: options.work,
          pageId: options.pageId,
          query: options.query,
          matchText: options.matchText,
        })
      );
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
  // Lazy-loading translation partial endpoint: /v2/reader/:author/:name/:page/translation
  getAsync("/reader/:author/:name/:page/translation", async (req, res) => {
    const author = req.params.author;
    const name = req.params.name;
    const pageParam = req.params.page;

    const work =
      (await getV2Work(`${author}/${name}`)) ||
      (await getV2Work(`${author}_${name}`));

    if (!work || !work.hasTranslation) {
      res.status(404).send("Translation not found");
      return;
    }

    const resolved = resolvePageInWork(work, pageParam);
    const page = resolved.page;
    if (!page || !page.translationHtml) {
      res.status(404).send("Translation not found");
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      `
<div class="reader-translation-content">
  <header class="reader-translation-header">
    <span class="reader-translation-credit">Translated by ${he.escape(
      work.translator ?? "Unknown"
    )}</span>
  </header>
  <div class="reader-translation-body">
    ${page.translationHtml}
  </div>
</div>
        `.trim()
    );
  });

  // Human-readable reader route: /v2/reader/:author/:name/:page?
  getAsync("/reader/:author/:name/:page?", async (req, res) => {
    const author = req.params.author;
    const name = req.params.name;
    const pageId = req.params.page;
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const matchText =
      typeof req.query.matchText === "string" ? req.query.matchText.trim() : "";
    const jump =
      typeof req.query.jump === "string" ? req.query.jump.trim() : "";
    const isPartial = isPartialRequest(req);

    const work =
      (await getV2Work(`${author}/${name}`)) ||
      (await getV2Work(`${author}_${name}`));

    if (!work) {
      res.status(404).send(
        renderNotFoundPageHtml({
          workSlug: `${author}/${name}`,
        })
      );
      return;
    }

    // A `matchText` link without a page redirects like a jump, so the URL is
    // canonical and the `#sec-` hash scrolls No-JS readers to the match.
    const jumpTarget =
      jump || (pageId ? undefined : getFirstHighlightSectionId(matchText));
    if (jumpTarget) {
      redirectReaderJump(res, work, jumpTarget, query, matchText);
      return;
    }

    await sendReaderPassage(res, {
      work,
      pageId,
      query,
      matchText,
      isPartial,
      logMessage: "Error rendering reader work:",
      errorMessage: "Error rendering reader passage",
    });
  });

  // General reader route: handles jumps, legacy query parameters, and default work
  getAsync("/reader", async (req, res) => {
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
    const isPartial = isPartialRequest(req);

    const work =
      (await getV2Work(workId)) ||
      (await getV2Work("caesar_de_bello_gallico")) ||
      (await getV2Work("phi0448.phi001.perseus-lat2"));

    if (!work) {
      res.redirect(302, "/v2/library");
      return;
    }

    const jumpTarget =
      jump || (pageId ? undefined : getFirstHighlightSectionId(matchText));
    if (jumpTarget) {
      redirectReaderJump(res, work, jumpTarget, query, matchText);
      return;
    }

    await sendReaderPassage(res, {
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
