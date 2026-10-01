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
 * `o`, and drops the legacy `dict` and `in` params. Every other param
 * (`lang`, `embedded`, `scale`) is left as it is.
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

export interface DictUrlOptions extends DictSearch {
  readonly lang?: string | null;
  readonly embedded?: string | null;
}

/** The `/v2/dicts` URL (path and query) for a search. */
export function buildDictUrl(options: DictUrlOptions): string {
  const params = new URLSearchParams();
  applyDictSearch(params, options);
  if (options.lang) params.set("lang", options.lang);
  if (options.embedded) params.set("embedded", options.embedded);
  return `/v2/dicts?${params.toString()}`;
}
