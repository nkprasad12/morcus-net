import { LatinDict, LatinDictInfo } from "@/common/dictionaries/latin_dicts";
import {
  DEFAULT_DICT_KEYS,
  decodeDictBitmask,
  decodeStoredDictBitmask,
  encodeDictBitmask,
} from "@/web/v2/dict/settings/dict_bitmask.common";
import { formatCookie, readCookie } from "@/web/v2/core/state/cookies.common";

export { DEFAULT_DICT_KEYS };

/**
 * The dictionary preference cookie. It holds the same base36 bitmask as `?d=` (one canonical
 * encoding). Renamed from `morcus_dicts`, which held a `;`-joined key list, so that old values are
 * simply ignored rather than misread as a bitmask.
 */
export const DICT_COOKIE_NAME = "morcus_d";
export const INFLECTED_COOKIE_NAME = "morcus_inflected";

/**
 * The query parameter (and the No-JS Apply button's `name`) marking an explicit "save these as my
 * preferences". Only the server acts on it; see `dict_persistence.server.ts`.
 */
export const SAVE_PARAM = "save";

/**
 * Formats canonical dict keys into a cookie value (the `?d=` bitmask).
 */
export function formatDictsCookie(dictKeys: string[]): string {
  return formatCookie(DICT_COOKIE_NAME, encodeDictBitmask(dictKeys));
}

/**
 * Formats inflection mode into a cookie value.
 */
export function formatInflectedCookie(isInflected: boolean): string {
  return formatCookie(INFLECTED_COOKIE_NAME, isInflected ? "1" : "0");
}

/**
 * Parses dictionary selection from HTTP Cookie header string. Anything that isn't a canonical
 * bitmask is ignored.
 */
export function parseDictsFromCookie(
  cookieHeader: string | undefined | null
): string[] | null {
  return decodeStoredDictBitmask(readCookie(cookieHeader, DICT_COOKIE_NAME));
}

/**
 * The user's saved dictionary preferences decoded once from the HTTP Cookie header.
 */
export interface SavedDictPrefs {
  readonly dicts: string[] | null;
  readonly inflected: boolean | undefined;
}

/**
 * Reads and validates both dictionary preference cookies in a single pass.
 */
export function readSavedDictPrefs(
  cookieHeader: string | undefined | null
): SavedDictPrefs {
  const dicts = parseDictsFromCookie(cookieHeader);
  const rawInflected = readCookie(cookieHeader, INFLECTED_COOKIE_NAME);
  const inflected =
    rawInflected === "1" ? true : rawInflected === "0" ? false : undefined;
  return { dicts, inflected };
}

function toSavedDictPrefs(
  cookieOrPrefs: string | SavedDictPrefs | undefined | null
): SavedDictPrefs {
  if (typeof cookieOrPrefs === "object" && cookieOrPrefs !== null) {
    return cookieOrPrefs;
  }
  return readSavedDictPrefs(cookieOrPrefs);
}

/**
 * Resolves a dictionary key or alias to its canonical LatinDictInfo, handling case-insensitivity,
 * URL-safe `LnS`/`SnH`/`RnA` forms, display names, and legacy short names.
 */
export function findDictInfo(key: string): LatinDictInfo | undefined {
  const trimmed = key.trim();
  if (!trimmed) return undefined;
  const direct = LatinDict.BY_KEY.get(trimmed);
  if (direct) return direct;
  const lower = trimmed.toLowerCase();
  const unaliased = trimmed
    .replace(/([a-zA-Z])n([a-zA-Z])/g, "$1&$2")
    .toLowerCase();
  return LatinDict.AVAILABLE.find(
    (d) =>
      d.key.toLowerCase() === lower ||
      d.key.toLowerCase() === unaliased ||
      d.displayName.toLowerCase() === lower ||
      (lower === "ls" && d.key === "L&S") ||
      (lower === "sh" && d.key === "S&H") ||
      ((lower === "ra" || lower === "riddle_arnold") && d.key === "R&A") ||
      (lower === "gaffiot" && d.key === "GAF") ||
      (lower === "georges" && d.key === "GRG") ||
      (lower === "pozo" && d.key === "EGL") ||
      (lower === "gesner" && d.key === "GES") ||
      (lower === "forcellini" && d.key === "FOR") ||
      (lower === "numeral" && d.key === "NUM")
  );
}

/**
 * Normalizes a URL dictionary parameter into canonical LatinDict keys.
 * Supports:
 * - Hyphen, semicolon, or comma separated strings: "ls-gaffiot", "L&S,GAF", "L&S;GAF"
 * - Array of strings (e.g. from repeated `dict=ls&dict=gaffiot` query params)
 * - Safe mapping of 'n' <-> '&' (e.g. "LnS" <-> "L&S", "SnH" <-> "S&H")
 *
 * Deliberately does NOT interpret base36 bitmasks. Every short alphanumeric token is a valid
 * base36 integer, so guessing here silently mangled real keys: "GAF" parsed as 21111, whose bits
 * select six unrelated dictionaries, and "ls" parsed as 784, selecting S&H and NUM. Bitmasks
 * arrive only via `?d=` and are decoded by `decodeDictBitmask`.
 */
export function parseDictKeys(
  raw: string | string[] | undefined | null
): string[] | null {
  if (!raw) return null;

  // Delimiters are split per entry, not just for scalars: `getAll` and repeated query params both
  // hand us an array whose entries may still be delimited lists (`?dict=ls,gaffiot`).
  // No canonical key or alias contains ';', ',' or '-', so this split is always safe.
  const rawList: string[] = (Array.isArray(raw) ? raw : [raw]).flatMap((item) =>
    item.split(/[;,-]/)
  );

  const parsedKeys: string[] = [];
  for (const item of rawList) {
    const match = findDictInfo(item);
    if (match && !parsedKeys.includes(match.key)) {
      parsedKeys.push(match.key);
    }
  }

  return parsedKeys.length > 0 ? parsedKeys : null;
}

/**
 * Resolves inflection mode from URL query parameter(s).
 *
 * Handles scalar strings ("1" | "0" | "true" | "false") as well as the multi-value arrays produced
 * by No-JS HTML forms: the search bar pairs a hidden `o=0` with a checkbox `o=1`, so a checked box
 * submits `o=0&o=1`, which Express parses as `["0", "1"]`.
 *
 * Returns undefined when the parameter is absent or unrecognized, signalling callers to fall back
 * to their stored preference (cookie on the server, localStorage on the client).
 */
export function parseInflectionParam(
  raw: string | string[] | undefined | null
): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return undefined;
    // The checkbox only submits when checked, so its presence anywhere wins over the hidden default.
    if (raw.includes("1") || raw.includes("true")) return true;
    if (raw.includes("0") || raw.includes("false")) return false;
    return undefined;
  }
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

/**
 * The single defaulting rule for inflection: an explicit URL value wins, then the cookie, and
 * inflected search is on unless the cookie says `"0"`. Only the server resolves this; the client
 * adopts the rendered result.
 */
export function resolveInflection(
  oParam: boolean | undefined,
  cookieHeaderOrPrefs: string | SavedDictPrefs | undefined | null
): boolean {
  if (oParam !== undefined) return oParam;
  const prefs = toSavedDictPrefs(cookieHeaderOrPrefs);
  return prefs.inflected !== false;
}

/** The dictionary content settings a page is showing. */
export interface DictViewState {
  readonly dictKeys: readonly string[];
  readonly isInflected: boolean;
}

/**
 * Whether the page is in guest mode: its settings (from the URL, typically a shared link) disagree
 * with a preference the user has actually saved. Each setting is compared only when its cookie
 * holds a valid value, so a user with no saved preferences is never a guest: there's nothing of
 * theirs to protect or return to.
 */
export function isGuestView(
  view: DictViewState,
  cookieHeaderOrPrefs: string | SavedDictPrefs | undefined | null
): boolean {
  const prefs = toSavedDictPrefs(cookieHeaderOrPrefs);
  if (prefs.dicts !== null) {
    const shown = new Set(view.dictKeys);
    const sameSet =
      prefs.dicts.length === shown.size &&
      prefs.dicts.every((k) => shown.has(k));
    if (!sameSet) return true;
  }
  if (prefs.inflected !== undefined) {
    if (prefs.inflected !== view.isInflected) return true;
  }
  return false;
}

function toLangList(lang: string | readonly string[] | null | undefined) {
  if (!lang) return [];
  return typeof lang === "string" ? [lang] : lang;
}

function isDictInLangScope(
  dict: LatinDictInfo,
  langs: readonly string[]
): boolean {
  return (
    langs.length === 0 ||
    dict.languages.from === "*" ||
    langs.includes(dict.languages.from)
  );
}

/**
 * The dictionaries a `lang=` scope covers: those whose source language is in `lang`, plus the
 * wildcard (`*`) ones. No `lang` means no scope, so every dictionary is returned.
 *
 * This one rule decides both which dictionaries a scoped lookup queries and which checkboxes its
 * settings dialog shows, so the two can't disagree.
 */
export function filterDictsByLang(
  dicts: readonly LatinDictInfo[],
  lang?: string | readonly string[] | null
): LatinDictInfo[] {
  const langs = toLangList(lang);
  if (langs.length === 0) return [...dicts];
  return dicts.filter((d) => isDictInLangScope(d, langs));
}

/**
 * `filterDictsByLang` for dictionary keys. Unknown keys are always dropped, scoped or not.
 */
export function filterKeysByLang(
  keys: readonly string[],
  lang?: string | readonly string[] | null
): string[] {
  const langs = toLangList(lang);
  return keys.filter((key) => {
    const dictInfo = LatinDict.BY_KEY.get(key);
    return dictInfo !== undefined && isDictInLangScope(dictInfo, langs);
  });
}

/**
 * The dictionary preference to save when the user edited only some of the dictionaries.
 *
 * A scoped settings dialog (e.g. the reader's, `lang=La`) shows only the dictionaries in its
 * scope. Saving takes `selectedKeys` for those (`inScopeKeys`) and keeps every other dictionary
 * as it was in `savedDicts` (or the default, when nothing is saved), so editing the reader's
 * Latin lexica never changes the English → Latin ones. The result is in `LatinDict.AVAILABLE`
 * order.
 */
export function mergeDictKeysForSave(
  selectedKeys: Iterable<string>,
  inScopeKeys: Iterable<string>,
  savedDicts: readonly string[] | null | undefined
): string[] {
  const selected = new Set(selectedKeys);
  const inScope = new Set(inScopeKeys);
  const base = new Set(savedDicts ?? DEFAULT_DICT_KEYS);
  return LatinDict.AVAILABLE.filter((d) =>
    inScope.has(d.key) ? selected.has(d.key) : base.has(d.key)
  ).map((d) => d.key);
}

export interface DictParamsInput {
  /** Explicit keys from `?dict=`, i.e. the No-JS form checkboxes. Highest precedence. */
  dictParam?: string | string[] | null;
  /** Base36 bitmask from `?d=`, written by the JS client when it syncs the URL. */
  bitmaskParam?: string | null;
  /** Legacy `?in=` parameter. */
  inParam?: string | string[] | null;
}

function paramLength(raw: string | string[] | undefined | null): number {
  if (Array.isArray(raw)) return raw.length;
  return raw ? 1 : 0;
}

/**
 * Resolves active dictionary keys from URL query parameters, in strict precedence order:
 * 1. Form checkboxes / explicit keys (`?dict=`)
 * 2. Base36 bitmask (`?d=`)
 * 3. Legacy parameter (`?in=`)
 *
 * The checkboxes must outrank the bitmask: in No-JS mode they are the only controls the user can
 * actually change, while any bitmask in the same submission is frozen to the previous render.
 *
 * Returns null when no dictionary parameter was supplied at all, signalling callers to fall back
 * to their stored preference.
 */
export function resolveDictParams(input: DictParamsInput): string[] | null {
  if (paramLength(input.dictParam) > 0) {
    const fromDict = parseDictKeys(input.dictParam);
    if (fromDict && fromDict.length > 0) return fromDict;
  }
  if (input.bitmaskParam) {
    const fromBitmask = decodeDictBitmask(input.bitmaskParam);
    if (fromBitmask && fromBitmask.length > 0) return fromBitmask;
  }
  if (paramLength(input.inParam) > 0) {
    const fromIn = parseDictKeys(input.inParam);
    if (fromIn && fromIn.length > 0) return fromIn;
  }
  return null;
}
