import { Router } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  renderDictErrorHtml,
  renderDictPageHtml,
  renderDictResultsHtml,
  parseDictScale,
} from "@/web/ui/dict/dict_page.server";
import {
  resolveDictParams,
  parseInflectionParam,
  resolveInflection,
  isGuestView,
  readSavedDictPrefs,
  type SavedDictPrefs,
} from "@/web/ui/dict/settings/dict_selection.common";
import {
  resolveActiveDicts,
  dictParamsFromQuery,
} from "@/web/ui/dict/settings/dict_selection.server";
import { hasGreek } from "@/web/ui/dict/search/dict_greek.common";
import {
  cleanDictQuery,
  FOCUS_PARAM,
  parseFocusLang,
} from "@/web/ui/dict/search/dict_params.common";
import {
  ownSettingsHref,
  planDictPersistence,
} from "@/web/ui/dict/settings/dict_persistence.server";
import { createAsyncRegistrars } from "@/web/ui/core/server/async_handler.server";
import {
  isPartialRequest,
  isEmbeddedRequest,
  toStringOrArray,
} from "@/web/ui/core/server/request_params.server";
import { requestTimer } from "@/web/ui/core/server/telemetry.server";
import {
  sendStaticPageOr,
  type StaticPageStore,
} from "@/web/ui/core/server/static_pages.server";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

/** The request state that reaches an empty dictionary page's HTML. */
export interface DictLandingState {
  readonly dictKeys: readonly string[];
  readonly isInflected: boolean;
  readonly isEmbedded: boolean;
  /** `/` renders the same page plus its address-bar script (`servedAtRoot`). */
  readonly servedAtRoot: boolean;
}

/**
 * The static page key for an empty dictionary page (`static_pages.server.ts`),
 * from the resolved state. Pages with a `lang=` scope, a `scale=`, guest
 * settings or cookies to set are never static; the route checks those before
 * calling this.
 */
export function dictLandingPageKey(state: DictLandingState): string {
  const bitmask = encodeDictBitmask(state.dictKeys);
  const o = state.isInflected ? "1" : "0";
  const embedded = state.isEmbedded ? "1" : "0";
  return `dict:${bitmask}:${o}:${embedded}${state.servedAtRoot ? ":root" : ""}`;
}

/**
 * Renders the empty dictionary page for `state`: what `/`, `/dicts` and
 * `/dicts?embedded=1` serve in the plain case. Shared with the build step
 * (`static_pages_seed.server.ts`) so the seed is what the route renders.
 */
export function renderDictLandingPage(state: DictLandingState): string {
  return renderDictPageHtml({
    query: "",
    embedded: state.isEmbedded,
    queriedDicts: [...state.dictKeys],
    isInflected: state.isInflected,
    // An embedded view is a scoped view (see `isScopedView` below).
    scoped: state.isEmbedded,
    servedAtRoot: state.servedAtRoot,
  });
}

/** The landing state of a visitor with no dictionary cookie. */
export function defaultDictLandingState(
  view: Pick<DictLandingState, "isEmbedded" | "servedAtRoot">
): DictLandingState {
  const savedPrefs = readSavedDictPrefs(undefined);
  return {
    dictKeys: resolveActiveDicts({ savedPrefs }).dictKeys,
    isInflected: resolveInflection(undefined, savedPrefs),
    ...view,
  };
}

interface DictRoutesOptions {
  staticPages?: StaticPageStore;
}

function extractCleanQuery(raw: string | string[] | undefined): string {
  if (typeof raw === "string") {
    return cleanDictQuery(raw);
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const cleaned = cleanDictQuery(item);
      if (cleaned.length > 0) return cleaned;
    }
  }
  return "";
}

export function createDictRoutes(
  fusedDict: FusedDictionary,
  options: DictRoutesOptions = {}
): Router {
  const router = Router();
  const { getAsync } = createAsyncRegistrars(router);
  const staticPages = options.staticPages;

  // The site root serves the empty dictionary page itself, saving a redirect round trip. Only
  // this page lives at `/`: its search and settings forms submit to `/dicts`, and the page
  // rewrites the address bar to `/dicts`, so nothing anyone links to or bookmarks is under `/`
  // (except a No-JS bookmark of the empty page, i.e. of the site). That keeps `/` free for a
  // future landing page. The query is ignored (it's only ever tracking params like `fbclid`),
  // which also keeps the URL-driven selection, persistence and guest logic of `/dicts` out of it.
  getAsync("/", async (req, res) => {
    const savedPrefs = readSavedDictPrefs(req.headers.cookie);
    const state: DictLandingState = {
      dictKeys: resolveActiveDicts({ savedPrefs }).dictKeys,
      isInflected: resolveInflection(undefined, savedPrefs),
      isEmbedded: false,
      servedAtRoot: true,
    };
    await sendStaticPageOr(
      req,
      res,
      staticPages,
      dictLandingPageKey(state),
      () => renderDictLandingPage(state)
    );
  });

  // Main dictionary route: handles both full SSR (HTML page) and AJAX partials
  getAsync("/dicts", async (req, res) => {
    const query = extractCleanQuery(toStringOrArray(req.query.q));
    const isPartial = isPartialRequest(req, res);
    const isEmbedded = isEmbeddedRequest(req);

    // Legacy V1 compatibility: `/dicts?q=<id>&o=2` was V1's article ID lookup URL.
    if (req.query.o === "2" && query && !isPartial) {
      res.redirect(`/dicts/id/${encodeURIComponent(query)}`);
      return;
    }

    const dictScale = parseDictScale(req.query.scale);
    // Presentation only (result order and collapsed cards): never part of the dictionary
    // selection, persistence or guest comparison below.
    const focusLang = parseFocusLang(req.query[FOCUS_PARAM]);

    // Resolve dictionary selection based on precedence:
    // Query ('dict' checkboxes > 'd' bitmask > legacy 'in') > Cookie ('morcus_d')
    // > Default (All Latin except Pozo)
    const keysFromQuery = resolveDictParams(dictParamsFromQuery(req));
    const langParam = toStringOrArray(req.query.lang);
    const cookieHeader = req.headers.cookie;
    const savedPrefs = readSavedDictPrefs(cookieHeader);

    // Resolve inflection mode: o=0 (exact headwords, mode: 0) vs o=1 (inflected forms, mode: 1,
    // default). No-JS forms pair a hidden "0" with a checkbox "1", so a checked box arrives as
    // ["0", "1"]; parseInflectionParam owns that shape.
    const oParam = parseInflectionParam(toStringOrArray(req.query.o));
    const isInflected = resolveInflection(oParam, savedPrefs);

    const { dictKeys } = resolveActiveDicts({
      keysFromQuery,
      savedPrefs,
      lang: langParam,
    });

    // Scoped views (the reader's dictionary iframe, or any `lang=`-filtered lookup) show the
    // dictionaries in their `lang` scope and an inflection forced by the lookup. Saving from one
    // merges only the in-scope dictionaries into the preference and never writes inflection.
    // Keyed on both signals so the reader is covered even if it stops sending `lang`.
    const isScopedView = isEmbedded || langParam !== undefined;

    // A selection in the URL is view state only: a shared link must not overwrite the
    // recipient's preferences. Cookies are written only for an explicit `save=1`, which then
    // redirects to drop the marker. See `dict_persistence.server.ts`.
    const persistence = planDictPersistence({
      originalUrl: req.originalUrl,
      cookieHeader,
      savedPrefs,
      secFetchSite: req.get("Sec-Fetch-Site"),
      isPartial,
      isScopedView,
      lang: langParam,
      keysFromQuery,
      oParam,
    });
    if (persistence.cookies.length > 0) {
      res.setHeader("Set-Cookie", persistence.cookies);
    }
    if (persistence.redirectTo !== undefined) {
      res.setHeader("Cache-Control", "no-store");
      res.redirect(303, persistence.redirectTo);
      return;
    }

    // Guest mode (full pages only): a link's settings that differ from the user's saved ones are
    // shown read-only, with a way back. A scoped view compares only what it shows and could save:
    // the in-scope dictionaries resolved from the cookie, and never inflection (the lookup forces it).
    const guestPrefs: SavedDictPrefs = isScopedView
      ? {
          dicts:
            savedPrefs.dicts &&
            resolveActiveDicts({ savedPrefs, lang: langParam }).dictKeys,
          inflected: undefined,
        }
      : savedPrefs;
    const isGuest = isGuestView({ dictKeys, isInflected }, guestPrefs);
    const canSaveInflection = !isScopedView && !isGuest;
    const pagePersistence = {
      scoped: isScopedView,
      lang: langParam,
      guest:
        !isPartial && isGuest
          ? {
              returnHref: ownSettingsHref(req.originalUrl, {
                keepInflection: isScopedView,
              }),
            }
          : undefined,
    };

    if (!query) {
      if (isPartial) {
        res.send(
          renderDictResultsHtml("", undefined, {
            queriedDicts: dictKeys,
            isInflected,
            isEmbedded,
            canSaveInflection,
          })
        );
        return;
      }
      // Static only in the plain case: no `lang=` scope (it narrows the settings dialog), no
      // `scale=` (an inline style), not a guest view (its return link carries this URL), and
      // no cookie being set (never without a redirect today, but it must not be cached).
      const plainLanding: DictLandingState | undefined =
        langParam === undefined &&
        dictScale === undefined &&
        pagePersistence.guest === undefined &&
        persistence.cookies.length === 0
          ? { dictKeys, isInflected, isEmbedded, servedAtRoot: false }
          : undefined;
      await sendStaticPageOr(
        req,
        res,
        staticPages,
        plainLanding && dictLandingPageKey(plainLanding),
        () =>
          plainLanding
            ? renderDictLandingPage(plainLanding)
            : renderDictPageHtml({
                query: "",
                embedded: isEmbedded,
                queriedDicts: dictKeys,
                isInflected,
                scale: dictScale,
                ...pagePersistence,
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
            canSaveInflection,
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
          ...pagePersistence,
        })
      );
      return;
    }

    try {
      const timer = requestTimer(res);
      const results = await fusedDict.getEntry(
        {
          query,
          dicts: dictKeys,
          mode: isInflected ? 1 : 0, // 1: inflected forms, 0: exact headwords
        },
        timer.serverExtras()
      );
      timer.mark("lookupComplete");

      if (isPartial) {
        res.send(
          renderDictResultsHtml(query, results, {
            queriedDicts: dictKeys,
            isInflected,
            isEmbedded,
            canSaveInflection,
            focusLang,
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
          focusLang,
          ...pagePersistence,
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
          isInflected,
          scale: dictScale,
          ...pagePersistence,
        })
      );
    }
  });

  // ID-based dictionary lookup route
  getAsync("/dicts/id/:id", async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    const isPartial = isPartialRequest(req, res);
    const isEmbedded = isEmbeddedRequest(req);

    const dictScale = parseDictScale(req.query.scale);

    if (!id) {
      res.redirect("/dicts");
      return;
    }

    // A query on an article path means the user searched from that page before
    // the client normalised the URL. Honour the search, not the stale id.
    const searchQuery = extractCleanQuery(toStringOrArray(req.query.q));
    if (searchQuery && !isPartial) {
      const url = new URL(req.originalUrl, "http://localhost");
      res.redirect(`/dicts${url.search}`);
      return;
    }

    const keysFromQuery = resolveDictParams(dictParamsFromQuery(req));
    const langParam = toStringOrArray(req.query.lang);
    const savedPrefs = readSavedDictPrefs(req.headers.cookie);
    const oParam = parseInflectionParam(toStringOrArray(req.query.o));
    const isInflected = resolveInflection(oParam, savedPrefs);
    const { dictKeys } = resolveActiveDicts({
      keysFromQuery,
      savedPrefs,
      lang: langParam,
    });
    const isScopedView = isEmbedded || langParam !== undefined;

    try {
      const timer = requestTimer(res);
      const results = await fusedDict.getEntry(
        {
          query: id,
          dicts: ALL_LATIN_DICTS,
          mode: 2, // Search by ID
        },
        timer.serverExtras()
      );
      timer.mark("lookupComplete");

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
          queriedDicts: dictKeys,
          isInflected,
          scoped: isScopedView,
          lang: langParam,
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
          queriedDicts: dictKeys,
          isInflected,
          scoped: isScopedView,
          lang: langParam,
          scale: dictScale,
        })
      );
    }
  });

  return router;
}
