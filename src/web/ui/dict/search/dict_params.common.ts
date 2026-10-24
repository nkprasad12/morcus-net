/**
 * Dictionary search URLs, shared by the client (`dict_search.client.ts`) and
 * the tests that need the URL the client actually shows.
 */

import { type DictLang } from "@/common/dictionaries/dictionaries";
import { trimRawQuery } from "@/common/text_cleaning";

/**
 * URL param naming the source language of an autocomplete suggestion the user
 * picked (e.g. `focus=En` for the English "ago"). Presentation only: the
 * results page lists that language's dictionaries first and collapses the rest.
 * It never affects which dictionaries are queried, and the settings and
 * persistence code ignores it. Only a suggestion pick adds it; every other
 * search drops it.
 */
export const FOCUS_PARAM = "focus";

/**
 * The concrete source languages `focus` accepts (every `DictLang` but `*`).
 * Listed here rather than imported, so this client-shared module doesn't pull
 * `dictionaries.ts` into the bundle.
 */
const FOCUS_LANGS: ReadonlySet<string> = new Set<Exclude<DictLang, "*">>([
  "La",
  "En",
  "Fr",
  "De",
  "Es",
]);

function isFocusLang(raw: string): raw is Exclude<DictLang, "*"> {
  return FOCUS_LANGS.has(raw);
}

/**
 * Parses a `focus` param value: a concrete source language (`La`, `En`, ...),
 * or undefined for anything else (absent, repeated, `*`, unknown).
 */
export function parseFocusLang(raw: unknown): DictLang | undefined {
  return typeof raw === "string" && isFocusLang(raw) ? raw : undefined;
}

/**
 * Normalizes a dictionary search query by stripping outer punctuation/whitespace
 * (`trimRawQuery`) and stripping leading or trailing homograph numbers separated by
 * whitespace (e.g. Gaffiot `"1 ab"` or `"ab 1"` -> `"ab"`), while preserving a
 * standalone number query (`"1"` -> `"1"`).
 */
export function cleanDictQuery(raw: string): string {
  const trimmed = trimRawQuery(raw);
  const stripped = trimRawQuery(trimmed.replace(/^\d+[.,;:]?\s+|\s+\d+$/g, ""));
  return stripped || trimmed;
}

interface DictSearch {
  readonly q: string;
  /** The active dictionaries, as a bitmask (`encodeDictBitmask`). */
  readonly d: string;
  /** Whether to search inflected forms (`o=1`). */
  readonly inflected: boolean;
  /**
   * The picked suggestion's source language (see {@link FOCUS_PARAM}). Absent
   * for every search that isn't a suggestion pick, which drops any earlier one.
   */
  readonly focus?: DictLang;
}

/** Sets `focus` for a suggestion pick, or drops a stale one for any other search. */
function applyFocus(params: URLSearchParams, focus: DictLang | undefined) {
  if (focus) params.set(FOCUS_PARAM, focus);
  else params.delete(FOCUS_PARAM);
}

/**
 * Writes a search into a dictionary URL's params in place: sets `q`, `d` and
 * `o`, sets or drops `focus`, and drops the legacy `dict` and `in` params.
 * Every other param (`embedded`, `scale`, `lang`) is left as it is. `lang` must
 * stay: in a `lang=` view `d` is the narrowed selection, and a `d` without the
 * `lang` that narrowed it would offer, and save, every dictionary as if it were
 * the user's whole selection.
 */
export function applyDictSearch(
  params: URLSearchParams,
  search: DictSearch
): void {
  params.set("q", search.q);
  params.set("d", search.d);
  params.set("o", search.inflected ? "1" : "0");
  applyFocus(params, search.focus);
  params.delete("dict");
  params.delete("in");
}

/**
 * Writes a search that leaves the view's `lang=` scope: sets `q` and `o`, sets
 * or drops `focus`, and drops `lang` together with every dictionary param, so
 * the server resolves the user's saved dictionaries in full (cookie → default).
 * A word typed into the reader's dictionary may be English or German, so it
 * must reach the English → Latin and German → Latin lexica the reader's Latin
 * scope leaves out.
 */
export function applyUnscopedDictSearch(
  params: URLSearchParams,
  search: Omit<DictSearch, "d">
): void {
  params.set("q", search.q);
  params.set("o", search.inflected ? "1" : "0");
  applyFocus(params, search.focus);
  for (const name of ["d", "dict", "in", "lang"]) params.delete(name);
}

interface DictUrlOptions extends Omit<DictSearch, "d"> {
  /** The active dictionaries; when absent, no `d` param is written. */
  readonly d?: string;
  readonly lang?: string | null;
  readonly embedded?: string | null;
  /** When true, appends `save=1` so the server persists the settings on navigation. */
  readonly save?: boolean;
}

/**
 * The `/dicts` URL (path and query) for a search, with params in the
 * order `q`, `d`, `lang`, `o`, `embedded`, `save`.
 */
export function buildDictUrl(options: DictUrlOptions): string {
  const params = new URLSearchParams();
  params.set("q", options.q);
  if (options.d !== undefined) params.set("d", options.d);
  if (options.lang) params.set("lang", options.lang);
  params.set("o", options.inflected ? "1" : "0");
  if (options.embedded) params.set("embedded", options.embedded);
  if (options.save) params.set("save", "1");
  return `/dicts?${params.toString()}`;
}

/**
 * Returns a function producing the same URLs as {@link buildDictUrl} for
 * `options` with varying `q`. The shared part of the query is built once,
 * which matters when linking every word of a long entry (thousands of calls).
 */
export function dictUrlBuilder(
  options: Omit<DictUrlOptions, "q">
): (q: string) => string {
  // `q` is always the first param, so everything after it is fixed.
  const rest = buildDictUrl({ ...options, q: "" }).slice("/dicts?q=".length);
  return (q) => `/dicts?${new URLSearchParams({ q }).toString()}${rest}`;
}
