/**
 * Express routes for Experimental Texts (`/experimentalTexts`).
 *
 * - `GET /experimentalTexts` (no `open` query param): renders the full Author -> Works
 *   catalog page (`renderExperimentalTextsCatalogPageHtml`), which
 *   `<morcus-experimental-texts-view>` filters client-side. Other query params are
 *   ignored.
 * - `GET /experimentalTexts?open=<id>[&page=<pageId>]`: looks up `<id>` in the
 *   Experimental Texts catalog, rendering `<morcus-experimental-text-reader>`
 *   (`renderExperimentalTextReaderPageHtml`), or a 404 that links back to the catalog
 *   (`renderExperimentalTextNotFoundPageHtml`) for an unknown id.
 */

import { Router, type Request, type Response } from "express";
import type { ExperimentalTextCatalogBundle } from "@/common/experimental_texts/catalog_types";
import {
  findExperimentalTextCatalogEntry,
  getExperimentalTextsCatalogBundle,
} from "@/common/experimental_texts/catalog_loader";
import { EXPERIMENTAL_TEXTS_PATH } from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import {
  renderExperimentalTextNotFoundPageHtml,
  renderExperimentalTextReaderPageHtml,
  renderExperimentalTextsCatalogPageHtml,
} from "@/web/ui/experimental_texts/experimental_texts.server";

export interface ExperimentalTextsRouteOptions {
  /** Optional catalog bundle override (used by unit tests). */
  readonly bundle?: ExperimentalTextCatalogBundle;
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

export function createExperimentalTextsRoutes(
  options: ExperimentalTextsRouteOptions = {}
): Router {
  const router = Router();

  router.get(EXPERIMENTAL_TEXTS_PATH, (req: Request, res: Response) => {
    const bundle = options.bundle ?? getExperimentalTextsCatalogBundle();
    const openId = firstQueryString(req.query.open);

    if (openId) {
      const found = findExperimentalTextCatalogEntry(openId, bundle);
      if (!found) {
        res.status(404).send(renderExperimentalTextNotFoundPageHtml(openId));
        return;
      }

      const initialSection = firstQueryString(req.query.page);

      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(200).send(
        renderExperimentalTextReaderPageHtml({
          entry: found.entry,
          sourceMeta: found.sourceMeta,
          initialSection,
          backHref: EXPERIMENTAL_TEXTS_PATH,
        })
      );
      return;
    }

    res.status(200).send(renderExperimentalTextsCatalogPageHtml(bundle));
  });

  return router;
}
