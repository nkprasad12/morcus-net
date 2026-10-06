/**
 * Dictionary search URLs, shared by the client (`dict_search.client.ts`) and
 * the tests that need the URL the client actually shows.
 */

export interface DictSearch {
  readonly q: string;
  /** The active dictionaries, as a bitmask (`encodeDictBitmask`). */
  readonly d: string;
  /** Whether to search inflected forms (`o=1`). */
  readonly inflected: boolean;
}

/**
 * Writes a search into a dictionary URL's params in place: sets `q`, `d` and
 * `o`, and drops the legacy `dict` and `in` params and any transient `lang`
 * filter (the active dictionary set is now encoded in `d`, matching the No-JS
 * search form). Every other param (`embedded`, `scale`) is left as it is.
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
  params.delete("lang");
}

export interface DictUrlOptions extends Omit<DictSearch, "d"> {
  /** The active dictionaries; when absent, no `d` param is written. */
  readonly d?: string;
  readonly lang?: string | null;
  readonly embedded?: string | null;
  /** When true, appends `save=1` so the server persists the settings on navigation. */
  readonly save?: boolean;
}

/**
 * The `/v2/dicts` URL (path and query) for a search, with params in the
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
  return `/v2/dicts?${params.toString()}`;
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
  const rest = buildDictUrl({ ...options, q: "" }).slice("/v2/dicts?q=".length);
  return (q) => `/v2/dicts?${new URLSearchParams({ q }).toString()}${rest}`;
}
