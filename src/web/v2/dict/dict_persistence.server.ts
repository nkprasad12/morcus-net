import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import {
  SAVE_PARAM,
  formatDictsCookie,
  formatInflectedCookie,
  readSavedDictPrefs,
  type SavedDictPrefs,
} from "@/web/v2/dict/dict_selection.common";

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

export interface DictPersistenceInput {
  /** The request URL as received (`req.originalUrl`): path plus query string. */
  readonly originalUrl: string;
  readonly cookieHeader: string | undefined;
  readonly savedPrefs?: SavedDictPrefs;
  /** Value of the `Sec-Fetch-Site` request header, if sent by the browser. */
  readonly secFetchSite?: string;
  readonly isPartial: boolean;
  /** Reader iframe or `lang=`-filtered lookups: show a narrowed view, never persist. */
  readonly isScopedView: boolean;
  /** Dictionary keys from the URL (`dict` > `d` > `in`), before any `lang` filtering. */
  readonly keysFromQuery: string[] | null;
  /** Inflection from the URL (`o`), or undefined when absent. */
  readonly oParam: boolean | undefined;
}

export interface DictPersistencePlan {
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
 * - **Partial or scoped requests** never write anything.
 * - **`save=1`** writes the URL's dictionaries and inflection (whichever are present, unless the
 *   request is `Sec-Fetch-Site: cross-site`), then redirects to the canonical URL (`d=<bitmask>`,
 *   single `o=1|0`) minus `save`. The marker therefore lives for exactly one request, so a reload
 *   doesn't re-apply it, Back skips it, and copying the URL can't carry it.
 * - **Otherwise**, the cookies the request already carries are re-sent with their **own** values
 *   (never the URL's) and a fresh `Max-Age`. A JS save writes via `document.cookie`, which Safari's
 *   ITP caps at 7 days; this re-issues it as an HTTP cookie on every full page load.
 */
export function planDictPersistence(
  input: DictPersistenceInput
): DictPersistencePlan {
  if (input.isPartial || input.isScopedView) return { cookies: [] };

  const url = new URL(input.originalUrl, "http://localhost");
  if (hasSaveMarker(url.searchParams)) {
    const cookies: string[] = [];
    if (input.secFetchSite !== "cross-site") {
      if (input.keysFromQuery && input.keysFromQuery.length > 0) {
        cookies.push(formatDictsCookie(input.keysFromQuery));
      }
      if (input.oParam !== undefined) {
        cookies.push(formatInflectedCookie(input.oParam));
      }
    }
    if (input.keysFromQuery && input.keysFromQuery.length > 0) {
      url.searchParams.set("d", encodeDictBitmask(input.keysFromQuery));
      url.searchParams.delete("dict");
      url.searchParams.delete("in");
    }
    if (input.oParam !== undefined) {
      url.searchParams.set("o", input.oParam ? "1" : "0");
    }
    url.searchParams.delete(SAVE_PARAM);
    return { cookies, redirectTo: url.pathname + url.search };
  }

  const prefs = input.savedPrefs ?? readSavedDictPrefs(input.cookieHeader);
  const cookies: string[] = [];
  if (prefs.dicts) cookies.push(formatDictsCookie(prefs.dicts));
  if (prefs.inflected !== undefined) {
    cookies.push(formatInflectedCookie(prefs.inflected));
  }
  return { cookies };
}

/** Every query parameter that carries dictionary content settings (or the save marker). */
const SETTINGS_PARAMS = ["d", "dict", "in", "o", SAVE_PARAM] as const;

/**
 * The same page with every settings parameter removed, so the server falls back to the user's
 * cookies. This is guest mode's **Restore saved** link: a plain GET, so it works without JS.
 */
export function ownSettingsHref(originalUrl: string): string {
  const url = new URL(originalUrl, "http://localhost");
  for (const name of SETTINGS_PARAMS) url.searchParams.delete(name);
  return url.pathname + url.search;
}
