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
import { setVersionedCacheControl } from "@/web/ui/core/server/build_version.server";
import {
  isPartialRequest,
  isEmbeddedRequest,
  toStringOrArray,
} from "@/web/ui/core/server/request_params.server";
import { requestTimer } from "@/web/ui/core/server/telemetry.server";
import {
  compressStaticPageAsync,
  sendStaticPageOr,
  type StaticPageLookup,
} from "@/web/ui/core/server/static_pages.server";
import type { PrecompressedRow } from "@/web/ui/core/server/precompressed_json.server";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";
import type {
  LatestPost,
  LatestPostSource,
} from "@/web/ui/whats_new/whats_new.server";

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
export function renderDictLandingPage(
  state: DictLandingState,
  latestPost?: LatestPost | null
): string {
  return renderDictPageHtml({
    query: "",
    embedded: state.isEmbedded,
    queriedDicts: [...state.dictKeys],
    isInflected: state.isInflected,
    // An embedded view is a scoped view (see `isScopedView` below).
    scoped: state.isEmbedded,
    servedAtRoot: state.servedAtRoot,
    latestPost,
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

/** A {@link StaticPageLookup} whose What's New overlay builds in the background. */
export interface DictLandingOverrides extends StaticPageLookup {
  /** Resolves once the latest overlay build (if any) has landed or failed. */
  settled(): Promise<void>;
}

/**
 * Wraps `staticPages` with a 2-entry in-memory override for the default
 * non-embedded dictionary landing pages (`/` and `/dicts`) whenever
 * `latestPost` has an active release announcement (`static_pages.server.ts`).
 *
 * When the active post changes, the two pages are rendered and then
 * compressed on libuv's thread pool (`compressStaticPageAsync`), so the event
 * loop never blocks on Brotli. Until a build lands, lookups keep returning
 * what the overlay already holds (the previous post's pages, or the
 * underlying `staticPages` row). When no post is active (`current()` is
 * `null`), the overlay is cleared at once and lookups fall straight through.
 */
export function withDictLandingOverrides(
  staticPages: StaticPageLookup,
  latestPost: LatestPostSource
): DictLandingOverrides;
export function withDictLandingOverrides(
  staticPages: StaticPageLookup,
  latestPost?: LatestPostSource
): StaticPageLookup;
export function withDictLandingOverrides(
  staticPages: StaticPageLookup,
  latestPost?: LatestPostSource
): StaticPageLookup {
  if (latestPost === undefined) return staticPages;
  const rootState = defaultDictLandingState({
    isEmbedded: false,
    servedAtRoot: true,
  });
  const dictsState = defaultDictLandingState({
    isEmbedded: false,
    servedAtRoot: false,
  });
  const rootKey = dictLandingPageKey(rootState);
  const dictsKey = dictLandingPageKey(dictsState);
  const overrides = new Map<string, PrecompressedRow>();
  // The post the overlay holds or is being built for; `null` for none.
  let wantedKey: string | null = null;
  let pending: Promise<void> = Promise.resolve();

  const sync = (post: LatestPost | null) => {
    const nextKey = post?.description
      ? `${post.date}\n${post.description}\n${post.url}`
      : null;
    if (nextKey === wantedKey) return;
    wantedKey = nextKey;
    if (post === null || nextKey === null) {
      overrides.clear();
      return;
    }
    const rootHtml = renderDictLandingPage(rootState, post);
    const dictsHtml = renderDictLandingPage(dictsState, post);
    pending = Promise.all([
      compressStaticPageAsync(rootHtml),
      compressStaticPageAsync(dictsHtml),
    ]).then(
      ([root, dicts]) => {
        // A newer post (or none) superseded this build while it ran.
        if (wantedKey !== nextKey) return;
        overrides.set(rootKey, root);
        overrides.set(dictsKey, dicts);
      },
      (err: unknown) => {
        console.warn(
          `What's New: compressing the landing overlay failed: ${String(err)}`
        );
        // Retry on the next lookup.
        if (wantedKey === nextKey) wantedKey = null;
      }
    );
  };

  latestPost.onChange?.((post) => {
    // No store loaded (dev, or before `pages.db` opens): nothing to overlay.
    // The first lookup after the store opens builds it instead.
    if (
      staticPages.get(rootKey) === undefined &&
      staticPages.get(dictsKey) === undefined
    ) {
      wantedKey = null;
      overrides.clear();
      return;
    }
    sync(post);
  });

  const lookup: DictLandingOverrides = {
    get(key: string): PrecompressedRow | undefined {
      const base = staticPages.get(key);
      if (base === undefined) return undefined;
      if (key === rootKey || key === dictsKey) {
        sync(latestPost.current());
        return overrides.get(key) ?? base;
      }
      return base;
    },
    settled: () => pending,
  };
  return lookup;
}

interface DictRoutesOptions {
  staticPages?: StaticPageLookup;
  latestPost?: LatestPostSource;
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
  const latestPost = options.latestPost;
  const staticPages =
    options.staticPages &&
    withDictLandingOverrides(options.staticPages, latestPost);

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
      () => renderDictLandingPage(state, latestPost?.current())
    );
  });

  // Main dictionary route: handles both full SSR (HTML page) and AJAX partials
  getAsync("/dicts", async (req, res) => {
    const query = extractCleanQuery(toStringOrArray(req.query.q));
    const isPartial = isPartialRequest(req, res);
    // The fetch URL is the partial's whole contract. Full pages keep the
    // header sniffing: iframe links inside entries don't carry the flag.
    const isEmbedded = isPartial
      ? req.query.embedded === "1"
      : isEmbeddedRequest(req);

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
    // A partial never reads the cookie, so it cannot depend on it: missing or
    // malformed `d` / `o` fall through to the defaults, not to saved prefs.
    const cookieHeader = isPartial ? undefined : req.headers.cookie;
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
    // Partials never offer the save shortcut. Load-bearing: with the cookie
    // blanked, `isGuest` is always false on a partial, so without `!isPartial`
    // every partial would *grant* `save=1`, including to guests.
    const canSaveInflection = !isPartial && !isScopedView && !isGuest;
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
        const body = renderDictResultsHtml("", undefined, {
          queriedDicts: dictKeys,
          isInflected,
          isEmbedded,
          canSaveInflection,
        });
        setVersionedCacheControl(req, res, { scope: "private" });
        res.send(body);
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
        () => {
          const activePost = latestPost?.current();
          return plainLanding
            ? renderDictLandingPage(plainLanding, activePost)
            : renderDictPageHtml({
                query: "",
                embedded: isEmbedded,
                queriedDicts: dictKeys,
                isInflected,
                scale: dictScale,
                ...pagePersistence,
                latestPost: activePost,
              });
        }
      );
      return;
    }

    if (hasGreek(query)) {
      if (isPartial) {
        const body = renderDictResultsHtml(query, undefined, {
          queriedDicts: dictKeys,
          isInflected,
          isEmbedded,
          canSaveInflection,
        });
        setVersionedCacheControl(req, res, { scope: "private" });
        res.send(body);
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
        const body = renderDictResultsHtml(query, results, {
          queriedDicts: dictKeys,
          isInflected,
          isEmbedded,
          canSaveInflection,
          focusLang,
        });
        setVersionedCacheControl(req, res, { scope: "private" });
        res.send(body);
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
    // The fetch URL is the partial's whole contract. Full pages keep the
    // header sniffing: iframe links inside entries don't carry the flag.
    const isEmbedded = isPartial
      ? req.query.embedded === "1"
      : isEmbeddedRequest(req);

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
    // A partial never reads the cookie, so it cannot depend on it: missing or
    // malformed `d` / `o` fall through to the defaults, not to saved prefs.
    const cookieHeader = isPartial ? undefined : req.headers.cookie;
    const savedPrefs = readSavedDictPrefs(cookieHeader);
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
        const body = renderDictResultsHtml(id, results, { isEmbedded });
        setVersionedCacheControl(req, res, { scope: "private" });
        res.send(body);
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
