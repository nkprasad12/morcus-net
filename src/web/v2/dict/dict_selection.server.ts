import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  DEFAULT_DICT_KEYS,
  parseDictKeys,
} from "@/web/v2/dict/dict_selection.common";

export {
  DEFAULT_DICTS,
  DEFAULT_DICT_KEYS,
  parseDictKeys,
  parseInflectionParam,
  resolveDictParams,
} from "@/web/v2/dict/dict_selection.common";
export type { DictParamsInput } from "@/web/v2/dict/dict_selection.common";

export const DICT_COOKIE_NAME = "morcus_dicts";

/**
 * Reads a single cookie value out of a raw HTTP Cookie header.
 * Returns null when the header is absent or does not contain the named cookie.
 */
export function readCookie(
  cookieHeader: string | undefined | null,
  name: string
): string | null {
  if (!cookieHeader) return null;
  for (const c of cookieHeader.split(";")) {
    const [rawName, ...valParts] = c.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(valParts.join("="));
    }
  }
  return null;
}

/**
 * Parses dictionary selection from HTTP Cookie header string.
 */
export function parseDictsFromCookie(
  cookieHeader: string | undefined | null
): string[] | null {
  return parseDictKeys(readCookie(cookieHeader, DICT_COOKIE_NAME));
}

/**
 * Formats canonical dict keys into a cookie value.
 */
export function formatDictsCookie(dictKeys: string[]): string {
  return `${DICT_COOKIE_NAME}=${encodeURIComponent(
    dictKeys.join(";")
  )}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/**
 * Formats canonical dict keys for URL query parameter (using hyphen separator).
 */
export function formatDictsParam(dictKeys: string[]): string {
  return dictKeys.map((k) => k.replace("&", "n")).join("-");
}

/**
 * Resolves active dictionary keys based on the precedence hierarchy:
 * 1. Explicit URL parameter (`in=` or `dict=`)
 * 2. HTTP Cookie (`morcus_dicts=`)
 * 3. Default Preset (All Latin dicts except Pozo)
 *
 * If `lang` filter is specified (e.g. `lang=La`), only dictionaries matching that
 * source language (or wildcard '*') are returned.
 */
export function resolveActiveDicts(options: {
  urlParam?: string | string[] | null;
  cookieHeader?: string | null;
  lang?: string | string[] | null;
}): { dictKeys: string[]; source: "url" | "cookie" | "default" } {
  const fromUrl = parseDictKeys(options.urlParam);
  let resolvedKeys: string[];
  let source: "url" | "cookie" | "default";

  if (fromUrl && fromUrl.length > 0) {
    resolvedKeys = fromUrl;
    source = "url";
  } else {
    const fromCookie = parseDictsFromCookie(options.cookieHeader);
    if (fromCookie && fromCookie.length > 0) {
      resolvedKeys = fromCookie;
      source = "cookie";
    } else {
      resolvedKeys = [...DEFAULT_DICT_KEYS];
      source = "default";
    }
  }

  // Filter by source language if specified
  const langs = options.lang
    ? Array.isArray(options.lang)
      ? options.lang
      : [options.lang]
    : [];

  if (langs.length > 0) {
    const filtered = resolvedKeys.filter((key) => {
      const dictInfo = LatinDict.BY_KEY.get(key);
      if (!dictInfo) return false;
      const fromLang = dictInfo.languages.from;
      return fromLang === "*" || langs.includes(fromLang);
    });
    resolvedKeys = filtered;
  }

  return { dictKeys: resolvedKeys, source };
}
