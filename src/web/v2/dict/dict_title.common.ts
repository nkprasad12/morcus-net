/**
 * The dictionary page title, shared by the server (`dict_page.server.ts`)
 * and the client (`dict_search.client.ts`), so a client-side navigation shows
 * the same title a full load would.
 */

import { trimRawQuery } from "@/common/text_cleaning";

const DICT_ID_PATH = "/dicts/id/";

/**
 * `isIdSearch`: the page is `/dicts/id/:id`, and `query` is that id.
 */
export function dictPageTitle(query: string, isIdSearch = false): string {
  if (!query) return "Morcus Dictionary";
  return `${isIdSearch ? `ID ${query}` : query} - Morcus Dictionary`;
}

/**
 * The title the server renders for `url`: the id for `/dicts/id/:id`
 * (which ignores `q`), otherwise `q` cleaned as `dict_routes.server.ts` does.
 */
export function dictPageTitleForUrl(url: URL): string {
  if (url.pathname.startsWith(DICT_ID_PATH)) {
    const raw = url.pathname.slice(DICT_ID_PATH.length);
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Express rejects a malformed id; keep the raw text for the title.
    }
    return dictPageTitle(id.trim(), true);
  }
  return dictPageTitle(trimRawQuery(url.searchParams.get("q") ?? ""));
}
