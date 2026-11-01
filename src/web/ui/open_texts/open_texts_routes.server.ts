/**
 * Express routes for the Open Texts vertical slice (`/opentexts`).
 *
 * - `GET /opentexts` (no `open` query param): renders the full Author -> Works
 *   catalog page (`renderOpenTextsCatalogPageHtml`), which
 *   `<morcus-open-texts-view>` filters client-side. Filter query params
 *   (`q`, `source`, `period`, `author`) are ignored.
 * - `GET /opentexts?open=<id>[&page=<sectionId>]`: looks up `<id>` in the
 *   Open Texts catalog bundle, returning 404 (`renderNotFoundPageHtml`) if
 *   unknown or rendering `<morcus-open-text-reader>` (`renderOpenTextReaderPageHtml`).
 */

import { Router, type Request, type Response } from "express";
import type { OpenTextCatalogBundle } from "@/common/open_texts/catalog_types";
import {
  findOpenTextCatalogEntry,
  getOpenTextsCatalogBundle,
} from "@/common/open_texts/catalog_loader";
import { OPEN_TEXTS_PATH } from "@/web/ui/open_texts/open_texts_contract.common";
import {
  renderOpenTextReaderPageHtml,
  renderOpenTextsCatalogPageHtml,
} from "@/web/ui/open_texts/open_texts.server";
import { renderNotFoundPageHtml } from "@/web/ui/library/not_found.server";

export interface OpenTextsRouteOptions {
  /** Optional catalog bundle override (used by unit tests). */
  readonly bundle?: OpenTextCatalogBundle;
}

function firstQueryString(val: unknown): string | undefined {
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(val) && typeof val[0] === "string") {
    const trimmed = val[0].trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function createOpenTextsRoutes(
  options: OpenTextsRouteOptions = {}
): Router {
  const router = Router();

  router.get(OPEN_TEXTS_PATH, (req: Request, res: Response) => {
    const bundle = options.bundle ?? getOpenTextsCatalogBundle();
    const openId = firstQueryString(req.query.open);

    if (openId) {
      const found = findOpenTextCatalogEntry(openId, bundle);
      if (!found) {
        res.status(404).send(renderNotFoundPageHtml({ workSlug: openId }));
        return;
      }

      const initialSection =
        firstQueryString(req.query.page) ?? firstQueryString(req.query.section);

      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(200).send(
        renderOpenTextReaderPageHtml({
          entry: found.entry,
          sourceMeta: found.sourceMeta,
          initialSection,
          backHref: OPEN_TEXTS_PATH,
        })
      );
      return;
    }

    res.status(200).send(renderOpenTextsCatalogPageHtml(bundle));
  });

  return router;
}
