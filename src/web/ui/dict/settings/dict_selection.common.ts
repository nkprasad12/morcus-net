import { LatinDict, LatinDictInfo } from "@/common/dictionaries/latin_dicts";
import {
  SAVE_PARAM,
  decodeDictBitmask,
  formatDictsCookie,
  formatInflectedCookie,
  mergeDictKeysForSave,
  parseDictsFromCookie,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import { readCookie } from "@/web/ui/core/state/cookies.common";

export {
  SAVE_PARAM,
  formatDictsCookie,
  formatInflectedCookie,
  mergeDictKeysForSave,
  parseDictsFromCookie,
};

const INFLECTED_COOKIE_NAME = "morcus_inflected";

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
 * Resolves a dictionary key or V1 URL-safe key (`LnS`/`SnH`/`RnA`) to its canonical LatinDictInfo.
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
    (d) => d.key.toLowerCase() === lower || d.key.toLowerCase() === unaliased
  );
}

/**
 * Normalizes a URL dictionary parameter into canonical LatinDict keys.
 * Supports:
 * - Hyphen, semicolon, or comma separated strings: "LnS-GAF", "L&S,GAF", "L&S;GAF"
 * - Array of strings (e.g. from repeated `dict=L%26S&dict=GAF` query params)
 * - V1 URL-safe mapping of 'n' <-> '&' (e.g. "LnS" -> "L&S", "SnH" -> "S&H", "RnA" -> "R&A")
 *
 * Deliberately does NOT interpret base36 bitmasks. Every short alphanumeric token is a valid
 * base36 integer, so guessing here silently mangled real keys: "GAF" parsed as 21111, whose bits
 * select six unrelated dictionaries. Bitmasks arrive only via `?d=` and are decoded by
 * `decodeDictBitmask`.
 */
export function parseDictKeys(
  raw: string | string[] | undefined | null
): string[] | null {
  if (!raw) return null;

  // Delimiters are split per entry, not just for scalars: `getAll` and repeated query params both
  // hand us an array whose entries may still be delimited lists (`?dict=LnS,GAF`).
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
 * to the stored cookie preference.
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
interface DictViewState {
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

function toLangList(
  lang: string | readonly string[] | null | undefined
): string[] {
  if (!lang) return [];
  const rawList = typeof lang === "string" ? [lang] : lang;
  return rawList.flatMap((item) => item.split(/[-,]/)).filter(Boolean);
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
