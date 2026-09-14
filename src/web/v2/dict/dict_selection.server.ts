import type { Request } from "express";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  DEFAULT_DICT_KEYS,
  parseDictsFromCookie,
} from "@/web/v2/dict/dict_selection.common";
import type { DictParamsInput } from "@/web/v2/dict/dict_selection.common";

export {
  DEFAULT_DICTS,
  DEFAULT_DICT_KEYS,
  DICT_COOKIE_NAME,
  INFLECTED_COOKIE_NAME,
  parseDictKeys,
  parseInflectionParam,
  parseDictsFromCookie,
  formatDictsCookie,
  formatInflectedCookie,
  resolveDictParams,
} from "@/web/v2/dict/dict_selection.common";
export type { DictParamsInput } from "@/web/v2/dict/dict_selection.common";
export { readCookie } from "@/web/v2/core/cookies.common";

export function toStringOrArray(val: unknown): string | string[] | undefined {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && val.every((item) => typeof item === "string")) {
    return val;
  }
  return undefined;
}

/**
 * Collects the competing dictionary parameters out of a request query.
 * `d` is a scalar bitmask by construction; if it somehow repeats, the last value wins, matching
 * how browsers treat repeated scalar controls.
 */
export function dictParamsFromQuery(req: Request): DictParamsInput {
  const rawD = toStringOrArray(req.query.d);
  const bitmaskParam = Array.isArray(rawD)
    ? rawD[rawD.length - 1] ?? null
    : rawD ?? null;
  return {
    dictParam: toStringOrArray(req.query.dict),
    bitmaskParam,
    inParam: toStringOrArray(req.query.in),
  };
}

/**
 * Formats canonical dict keys for URL query parameter (using hyphen separator).
 */
export function formatDictsParam(dictKeys: string[]): string {
  return dictKeys.map((k) => k.replace("&", "n")).join("-");
}

/**
 * Resolves active dictionary keys based on the precedence hierarchy:
 * 1. Keys already resolved from the query string by `resolveDictParams`
 * 2. HTTP Cookie (`morcus_dicts=`)
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
  cookieHeader?: string | null;
  lang?: string | string[] | null;
}): { dictKeys: string[]; source: "url" | "cookie" | "default" } {
  const fromUrl = options.keysFromQuery;
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
