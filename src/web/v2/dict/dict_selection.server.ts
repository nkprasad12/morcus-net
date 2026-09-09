import { LatinDict, LatinDictInfo } from "@/common/dictionaries/latin_dicts";

export const DICT_COOKIE_NAME = "morcus_dicts";

/** Default dictionary selection: all available Latin dictionaries except Pozo (matches V1 default). */
export const DEFAULT_DICTS: LatinDictInfo[] = LatinDict.AVAILABLE.filter(
  (d) => d !== LatinDict.Pozo
);

export const DEFAULT_DICT_KEYS: string[] = DEFAULT_DICTS.map((d) => d.key);

/**
 * Normalizes URL dictionary parameter into canonical LatinDict keys.
 * Supports:
 * - Hyphen, semicolon, or comma separated strings: "ls-gaffiot", "L&S,GAF", "L&S;GAF"
 * - Array of strings (e.g. from repeated `dict=ls&dict=gaffiot` query params)
 * - Safe mapping of 'n' <-> '&' (e.g. "LnS" <-> "L&S", "SnH" <-> "S&H")
 */
export function parseDictKeys(
  raw: string | string[] | undefined | null
): string[] | null {
  if (!raw) return null;

  const rawList: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
    ? raw.includes(";")
      ? raw.split(";")
      : raw.includes(",")
      ? raw.split(",")
      : raw.includes("-")
      ? raw.split("-")
      : [raw]
    : [];

  const parsedKeys: string[] = [];
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    // Map URL safe representations 'LnS' / 'SnH' or 'RnA' back to '&'
    const unaliased = trimmed.replace(/([a-zA-Z])n([a-zA-Z])/g, "$1&$2");
    // Find matching dict in LatinDict.AVAILABLE by key (case-insensitive or exact)
    const match = LatinDict.AVAILABLE.find(
      (d) =>
        d.key.toLowerCase() === trimmed.toLowerCase() ||
        d.key.toLowerCase() === unaliased.toLowerCase() ||
        (trimmed.toLowerCase() === "ls" && d.key === "L&S") ||
        (trimmed.toLowerCase() === "sh" && d.key === "S&H") ||
        (trimmed.toLowerCase() === "gaffiot" && d.key === "GAF") ||
        (trimmed.toLowerCase() === "georges" && d.key === "GRG") ||
        (trimmed.toLowerCase() === "pozo" && d.key === "EGL") ||
        (trimmed.toLowerCase() === "gesner" && d.key === "GES") ||
        (trimmed.toLowerCase() === "forcellini" && d.key === "FOR") ||
        (trimmed.toLowerCase() === "riddle_arnold" && d.key === "R&A") ||
        (trimmed.toLowerCase() === "numeral" && d.key === "NUM")
    );
    if (match && !parsedKeys.includes(match.key)) {
      parsedKeys.push(match.key);
    }
  }

  return parsedKeys.length > 0 ? parsedKeys : null;
}

/**
 * Parses dictionary selection from HTTP Cookie header string.
 */
export function parseDictsFromCookie(
  cookieHeader: string | undefined | null
): string[] | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const [name, ...valParts] = c.trim().split("=");
    if (name === DICT_COOKIE_NAME) {
      const val = decodeURIComponent(valParts.join("="));
      return parseDictKeys(val);
    }
  }
  return null;
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
