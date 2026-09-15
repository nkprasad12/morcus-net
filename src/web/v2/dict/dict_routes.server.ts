import { Router } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  renderDictErrorHtml,
  renderDictPageHtml,
  renderDictResultsHtml,
  parseDictScale,
  resolveActiveDicts,
  resolveDictParams,
  parseInflectionParam,
  readCookie,
  formatDictsCookie,
  formatInflectedCookie,
  INFLECTED_COOKIE_NAME,
  hasGreek,
  dictParamsFromQuery,
  toStringOrArray,
} from "@/web/v2/dict/dict.server";
import { trimRawQuery } from "@/common/text_cleaning";
import { createAsyncRegistrars } from "@/web/v2/core/async_handler.server";
import {
  isPartialRequest,
  isEmbeddedRequest,
} from "@/web/v2/core/request_params.server";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

export function createDictRoutes(fusedDict: FusedDictionary): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);

  // Main dictionary route: handles both full SSR (HTML page) and AJAX partials
  getAsync("/dicts", async (req, res) => {
    const query =
      typeof req.query.q === "string" ? trimRawQuery(req.query.q) : "";
    const isPartial = isPartialRequest(req);
    const isEmbedded = isEmbeddedRequest(req);

    const dictScale = parseDictScale(req.query.scale);

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
      oParam ?? readCookie(cookieHeader, INFLECTED_COOKIE_NAME) !== "0";

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
        cookies.push(formatInflectedCookie(oParam));
      }
      if (cookies.length > 0) {
        res.setHeader("Set-Cookie", cookies);
      }
    }

    if (!query) {
      if (isPartial) {
        res.send(
          renderDictResultsHtml("", undefined, {
            queriedDicts: dictKeys,
            isInflected,
            isEmbedded,
          })
        );
        return;
      }
      res.send(
        renderDictPageHtml({
          query: "",
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
          scale: dictScale,
        })
      );
      return;
    }

    if (hasGreek(query)) {
      if (isPartial) {
        res.send(
          renderDictResultsHtml(query, undefined, {
            queriedDicts: dictKeys,
            isInflected,
            isEmbedded,
          })
        );
        return;
      }
      res.send(
        renderDictPageHtml({
          query,
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
          scale: dictScale,
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
        res.send(
          renderDictResultsHtml(query, results, {
            queriedDicts: dictKeys,
            isInflected,
            isEmbedded,
          })
        );
        return;
      }

      res.send(
        renderDictPageHtml({
          query,
          results,
          embedded: isEmbedded,
          queriedDicts: dictKeys,
          isInflected,
          scale: dictScale,
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
          scale: dictScale,
        })
      );
    }
  });

  // ID-based dictionary lookup route
  getAsync("/dicts/id/:id", async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const isPartial = isPartialRequest(req);
    const isEmbedded = isEmbeddedRequest(req);

    const dictScale = parseDictScale(req.query.scale);

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
        res.send(renderDictResultsHtml(id, results, { isEmbedded }));
        return;
      }

      res.send(
        renderDictPageHtml({
          query: id,
          results,
          isIdSearch: true,
          embedded: isEmbedded,
          scale: dictScale,
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
          scale: dictScale,
        })
      );
    }
  });

  return router;
}
