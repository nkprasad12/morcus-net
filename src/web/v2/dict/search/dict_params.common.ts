/**
 * Dictionary search URLs, shared by the client (`dict_search.client.ts`) and
 * the tests that need the URL the client actually shows.
 */

import { trimRawQuery } from "@/common/text_cleaning";
import {
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/v2/dict/settings/dict_bitmask.common";

/**
 * Normalizes a dictionary search query by stripping outer punctuation/whitespace
 * (`trimRawQuery`) and stripping leading or trailing homograph numbers separated by
 * whitespace (e.g. Gaffiot `"1 ab"` or `"ab 1"` -> `"ab"`), while preserving a
 * standalone number query (`"1"` -> `"1"`).
 */
export function cleanDictQuery(raw: string): string {
  const trimmed = trimRawQuery(raw);
  const stripped = trimmed.replace(/^\d+\s+|\s+\d+$/g, "").trim();
  return stripped || trimmed;
}

export interface NormalizedDictParams {
  readonly o: "0" | "1";
  readonly d: string | undefined;
}

/**
 * Normalizes raw `o` and `d` URL parameters:
 * - `o`: `"1"` only for `"1"` (or `"true"`), otherwise `"0"`.
 * - `d`: canonical base36 bitmask if it decodes to at least one known dictionary,
 *   otherwise `undefined` (fall back to saved cookie or default dictionaries).
 */
export function normalizeDictParams(
  params:
    | URLSearchParams
    | { readonly o?: string | null; readonly d?: string | null }
): NormalizedDictParams {
  const rawO =
    params instanceof URLSearchParams ? params.get("o") : params.o ?? null;
  const rawD =
    params instanceof URLSearchParams ? params.get("d") : params.d ?? null;
  const o: "0" | "1" = rawO === "1" || rawO === "true" ? "1" : "0";
  const decodedKeys = decodeDictBitmask(rawD);
  const d = decodedKeys ? encodeDictBitmask(decodedKeys) : undefined;
  return { o, d };
}

interface DictSearch {
  readonly q: string;
  /** The active dictionaries, as a bitmask (`encodeDictBitmask`). */
  readonly d: string;
  /** Whether to search inflected forms (`o=1`). */
  readonly inflected: boolean;
}

/**
 * Writes a search into a dictionary URL's params in place: sets `q`, `d` and
 * `o`, and drops the legacy `dict` and `in` params. Every other param
 * (`embedded`, `scale`, `lang`) is left as it is. `lang` must stay: in a
 * `lang=` view `d` is the narrowed selection, and a `d` without the `lang` that
 * narrowed it would offer, and save, every dictionary as if it were the user's
 * whole selection.
 */
export function applyDictSearch(
  params: URLSearchParams,
  search: DictSearch
): void {
  params.set("q", search.q);
  params.set("d", search.d);
  params.set("o", search.inflected ? "1" : "0");
  params.delete("dict");
  params.delete("in");
}

/**
 * Writes a search that leaves the view's `lang=` scope: sets `q` and `o`, and
 * drops `lang` together with every dictionary param, so the server resolves the
 * user's saved dictionaries in full (cookie → default). A word typed into the
 * reader's dictionary may be English or German, so it must reach the
 * English → Latin and German → Latin lexica the reader's Latin scope leaves out.
 */
export function applyUnscopedDictSearch(
  params: URLSearchParams,
  search: Omit<DictSearch, "d">
): void {
  params.set("q", search.q);
  params.set("o", search.inflected ? "1" : "0");
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
