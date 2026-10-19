import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { encodeDictBitmask } from "@/web/v2/dict/settings/dict_bitmask.common";
import {
  SAVE_PARAM,
  filterDictsByLang,
  formatDictsCookie,
  formatInflectedCookie,
  mergeDictKeysForSave,
  readSavedDictPrefs,
  type SavedDictPrefs,
} from "@/web/v2/dict/settings/dict_selection.common";

/**
 * When the dictionary route writes preference cookies.
 *
 * > **URL = ephemeral view state. Cookie = durable preference. The save marker = promote this view
 * > into a preference.**
 *
 * The server can't tell "the user just ticked boxes in our UI" from "someone pasted a URL" by
 * looking at `dict=` / `d=` / `o=`: both arrive the same way. So it never infers intent from them.
 * Persistence happens only when the request carries `save=1`, which only the settings popover's
 * No-JS **Done** button (and the zero-results "Enable inflected search" action) submits. The route
 * then 303s to the canonical URL without the marker, so a copied URL can't carry persistence intent.
 */

interface DictPersistenceInput {
  /** The request URL as received (`req.originalUrl`): path plus query string. */
  readonly originalUrl: string;
  readonly cookieHeader: string | undefined;
  readonly savedPrefs?: SavedDictPrefs;
  /** Value of the `Sec-Fetch-Site` request header, if sent by the browser. */
  readonly secFetchSite?: string;
  readonly isPartial: boolean;
  /**
   * Reader iframe or `lang=`-filtered lookup. Its passive loads never write cookies; a save
   * merges only the in-scope dictionaries (see `lang`) and never writes inflection, which the
   * lookup forces.
   */
  readonly isScopedView: boolean;
  /** The request's `lang=` scope: which dictionaries a save may change. */
  readonly lang?: string | string[];
  /** Dictionary keys from the URL (`dict` > `d` > `in`), before any `lang` filtering. */
  readonly keysFromQuery: string[] | null;
  /** Inflection from the URL (`o`), or undefined when absent. */
  readonly oParam: boolean | undefined;
}

interface DictPersistencePlan {
  /** `Set-Cookie` values to send. */
  readonly cookies: string[];
  /** When set, respond `303 See Other` to this URL instead of rendering. */
  readonly redirectTo?: string;
}

function hasSaveMarker(params: URLSearchParams): boolean {
  return params.getAll(SAVE_PARAM).includes("1");
}

/**
 * Decides which cookies to write and whether to redirect. This is a pure function of the request.
 *
 * - **Partial requests** never write anything.
 * - **`save=1`** (unless the request is `Sec-Fetch-Site: cross-site`) writes the URL's
 *   dictionaries, merged into the saved ones so that only those in the `lang` scope change
 *   (`mergeDictKeysForSave`), and, outside scoped views, the URL's inflection. It then redirects
 *   minus `save`, so the marker lives for exactly one request: a reload doesn't re-apply it,
 *   Back skips it, and copying the URL can't carry it. A standalone view redirects to its
 *   canonical URL (`d=<bitmask>`, single `o=1|0`). A scoped view drops the dictionary
 *   parameters instead, so the new cookie (filtered by `lang`) is the only source and the page
 *   never lands in guest mode against what was just saved.
 * - **Scoped views without `save=1`** never write anything: every reader word click is one of
 *   these.
 * - **Otherwise**, the cookies the request already carries are re-sent with their **own** values
 *   (never the URL's) and a fresh `Max-Age`. A JS save writes via `document.cookie`, which Safari's
 *   ITP caps at 7 days; this re-issues it as an HTTP cookie on every full page load.
 */
export function planDictPersistence(
  input: DictPersistenceInput
): DictPersistencePlan {
  if (input.isPartial) return { cookies: [] };

  const url = new URL(input.originalUrl, "http://localhost");
  const prefs = input.savedPrefs ?? readSavedDictPrefs(input.cookieHeader);
  if (hasSaveMarker(url.searchParams)) {
    const keys =
      input.keysFromQuery && input.keysFromQuery.length > 0
        ? input.keysFromQuery
        : null;
    const cookies: string[] = [];
    if (input.secFetchSite !== "cross-site") {
      if (keys) {
        const inScopeKeys = filterDictsByLang(
          LatinDict.AVAILABLE,
          input.lang
        ).map((d) => d.key);
        cookies.push(
          formatDictsCookie(
            mergeDictKeysForSave(keys, inScopeKeys, prefs.dicts)
          )
        );
      }
      if (!input.isScopedView && input.oParam !== undefined) {
        cookies.push(formatInflectedCookie(input.oParam));
      }
    }
    if (input.isScopedView) {
      url.searchParams.delete("d");
      url.searchParams.delete("dict");
      url.searchParams.delete("in");
    } else if (keys) {
      url.searchParams.set("d", encodeDictBitmask(keys));
      url.searchParams.delete("dict");
      url.searchParams.delete("in");
    }
    if (input.oParam !== undefined) {
      url.searchParams.set("o", input.oParam ? "1" : "0");
    }
    url.searchParams.delete(SAVE_PARAM);
    return { cookies, redirectTo: url.pathname + url.search };
  }

  if (input.isScopedView) return { cookies: [] };

  const cookies: string[] = [];
  if (prefs.dicts) cookies.push(formatDictsCookie(prefs.dicts));
  if (prefs.inflected !== undefined) {
    cookies.push(formatInflectedCookie(prefs.inflected));
  }
  return { cookies };
}

export {
  SETTINGS_PARAMS,
  ownSettingsHref,
} from "@/web/v2/dict/settings/dict_settings_href.common";
