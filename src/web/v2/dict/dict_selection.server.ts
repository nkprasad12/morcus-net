import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  DEFAULT_DICT_KEYS,
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
 * source language (or wildcard '*') are returned.
 */
export function resolveActiveDicts(options: {
  keysFromQuery?: string[] | null;
  savedPrefs?: SavedDictPrefs;
  cookieHeader?: string | null;
  lang?: string | string[] | null;
}): { dictKeys: string[] } {
  const fromUrl = options.keysFromQuery;
  let resolvedKeys: string[];

  if (fromUrl && fromUrl.length > 0) {
    resolvedKeys = fromUrl;
  } else {
    const fromCookie =
      options.savedPrefs !== undefined
        ? options.savedPrefs.dicts
        : parseDictsFromCookie(options.cookieHeader);
    if (fromCookie && fromCookie.length > 0) {
      resolvedKeys = fromCookie;
    } else {
      resolvedKeys = [...DEFAULT_DICT_KEYS];
    }
  }

  // Filter by source language if specified
  const langs = options.lang
    ? Array.isArray(options.lang)
      ? options.lang
      : [options.lang]
    : [];

  if (langs.length > 0) {
    resolvedKeys = resolvedKeys.filter((key) => {
      const dictInfo = LatinDict.BY_KEY.get(key);
      if (!dictInfo) return false;
      const fromLang = dictInfo.languages.from;
      return fromLang === "*" || langs.includes(fromLang);
    });
  }

  return { dictKeys: resolvedKeys };
}
