import {
  DEFAULT_DICT_KEYS,
  filterKeysByLang,
  parseDictsFromCookie,
  type SavedDictPrefs,
} from "@/web/v2/dict/dict_selection.common";

export {
  DEFAULT_DICT_KEYS,
  DICT_COOKIE_NAME,
  INFLECTED_COOKIE_NAME,
  findDictInfo,
  parseDictKeys,
  parseInflectionParam,
  resolveInflection,
  isGuestView,
  parseDictsFromCookie,
  readSavedDictPrefs,
  formatDictsCookie,
  formatInflectedCookie,
  resolveDictParams,
  filterDictsByLang,
  filterKeysByLang,
  mergeDictKeysForSave,
} from "@/web/v2/dict/dict_selection.common";
export type {
  DictParamsInput,
  SavedDictPrefs,
} from "@/web/v2/dict/dict_selection.common";
export { readCookie } from "@/web/v2/core/cookies.common";

export {
  toStringOrArray,
  readDictParam,
  readDictParam as dictParamsFromQuery,
} from "@/web/v2/core/request_params.server";

/**
 * Resolves active dictionary keys based on the precedence hierarchy:
 * 1. Keys already resolved from the query string by `resolveDictParams`
 * 2. HTTP Cookie (`morcus_d=`, the `?d=` bitmask)
 * 3. Default Preset (All Latin dicts except Pozo)
 *
 * Callers pass `keysFromQuery` pre-parsed rather than a raw parameter: the query may carry several
 * competing dictionary parameters (`dict`, `d`, `in`) whose precedence only the caller can apply.
 *
 * If `lang` filter is specified (e.g. `lang=La`), only dictionaries matching that
 * source language (or wildcard '*') are returned. If the user's cookie has only out-of-scope
 * dictionaries (e.g. `S&H` only on standalone `/v2/dicts`), a scoped lookup falls back to the
 * in-scope defaults rather than querying zero dictionaries.
 */
export function resolveActiveDicts(options: {
  keysFromQuery?: string[] | null;
  savedPrefs?: SavedDictPrefs;
  cookieHeader?: string | null;
  lang?: string | string[] | null;
}): { dictKeys: string[] } {
  const fromUrl = options.keysFromQuery;
  const hasLang = Boolean(options.lang && options.lang.length > 0);

  if (fromUrl && fromUrl.length > 0) {
    return {
      dictKeys: hasLang ? filterKeysByLang(fromUrl, options.lang) : fromUrl,
    };
  }

  const fromCookie =
    options.savedPrefs !== undefined
      ? options.savedPrefs.dicts
      : parseDictsFromCookie(options.cookieHeader);
  if (fromCookie && fromCookie.length > 0) {
    const filtered = hasLang
      ? filterKeysByLang(fromCookie, options.lang)
      : fromCookie;
    if (filtered.length > 0) {
      return { dictKeys: filtered };
    }
  }

  const defaults = [...DEFAULT_DICT_KEYS];
  return {
    dictKeys: hasLang ? filterKeysByLang(defaults, options.lang) : defaults,
  };
}
