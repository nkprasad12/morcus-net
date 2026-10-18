import type { Request } from "express";
import { toStringOrArray } from "@/web/v2/core/server/request_params.server";
import { DEFAULT_DICT_KEYS } from "@/web/v2/dict/settings/dict_bitmask.common";
import {
  filterKeysByLang,
  parseDictsFromCookie,
  type DictParamsInput,
  type SavedDictPrefs,
} from "@/web/v2/dict/settings/dict_selection.common";

/**
 * Collects competing dictionary parameters out of a request query (`d`, `dict`, `in`).
 * `d` is a scalar bitmask by construction; if it repeats, the last value wins.
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
