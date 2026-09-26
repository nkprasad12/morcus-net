import { Router } from "express";

import { scrapeUrlText } from "@/web/scraping/scraper";
import { createAsyncRegistrars } from "@/web/v2/core/async_handler.server";
import {
  renderExternalLandingPageHtml,
  renderExternalLocalPageHtml,
  renderExternalReaderPageHtml,
} from "@/web/v2/external/external.server";
import {
  ScrapeCache,
  describeScrapeFailure,
  type Scraper,
} from "@/web/v2/external/external_scrape.server";
import {
  buildExternalReaderUrl,
  parseExternalReaderParams,
} from "@/web/v2/external/external_url.common";

/** The route path inside the `/v2` router. */
const ROUTE = "/externalReader";

export interface ExternalRoutesOptions {
  /** Replaces the network scraper, for tests. */
  scrape?: Scraper;
}

export function createExternalRoutes(
  options: ExternalRoutesOptions = {}
): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);
  const cache = new ScrapeCache({ scrape: options.scrape ?? scrapeUrlText });

  getAsync(ROUTE, async (req, res) => {
    const queryIndex = req.originalUrl.indexOf("?");
    const search = queryIndex < 0 ? "" : req.originalUrl.slice(queryIndex);
    const params = parseExternalReaderParams(search);

    // No text chosen yet: the import form.
    if (!params.url && !params.local) {
      res.send(renderExternalLandingPageHtml({ lines: params.lines }));
      return;
    }

    // One canonical URL per text (trimmed, default `lines` dropped, no stray
    // params), so shared links and the scrape cache agree.
    const canonical = buildExternalReaderUrl({
      url: params.url,
      local: params.local,
      lines: params.lines,
      q: params.q,
    });
    if (search !== canonical.slice(canonical.indexOf("?"))) {
      res.redirect(302, canonical);
      return;
    }

    // Texts saved in the visitor's browser: `<morcus-external-loader>` reads
    // and renders them there, so nothing about the text reaches the server
    // beyond its storage key.
    if (!params.url) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.send(
        renderExternalLocalPageHtml({
          localKey: params.local ?? "",
          lines: params.lines ?? "keep",
          query: params.q ?? "",
        })
      );
      return;
    }

    // Imports are other sites' content under our origin: keep them out of
    // search indexes.
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    let text: string;
    try {
      text = await cache.get(params.url);
    } catch (err) {
      const failure = describeScrapeFailure(err);
      if (failure.status >= 500 || failure.status === 422) {
        console.warn("External reader import failed:", err);
      }
      res.status(failure.status).send(
        renderExternalLandingPageHtml({
          url: params.url,
          lines: params.lines,
          error: failure.message,
        })
      );
      return;
    }

    res.send(
      renderExternalReaderPageHtml({
        sourceUrl: params.url,
        text,
        lines: params.lines ?? "keep",
        query: params.q ?? "",
      })
    );
  });

  return router;
}
