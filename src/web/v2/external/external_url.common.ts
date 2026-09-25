/**
 * URL contract for the External Content Reader, shared by the server routes
 * and the client so that links built on either side agree.
 *
 * The path matches V1's `/externalReader`; the `/v2` prefix goes away when V2
 * becomes the default, at which point only {@link EXTERNAL_READER_PATH} changes.
 *
 * | Param   | Meaning                                                            |
 * | :------ | :----------------------------------------------------------------- |
 * | `url`   | Import from a web page. Server-rendered, so links are shareable.   |
 * | `local` | Open a text saved in this browser (IndexedDB key). JS-only.        |
 * | `lines` | {@link LineMode}; omitted when it is the default (`keep`).         |
 * | `q`     | Active dictionary lookup, as in the library reader.                |
 *
 * `lines` is part of the URL rather than only stored with the import because
 * it changes section numbering, so a shared `#sec-12` or `matchText` link is
 * only stable if the recipient renders with the same mode.
 */

import {
  DEFAULT_LINE_MODE,
  parseLineMode,
  type LineMode,
} from "@/web/v2/external/external_text.common";

export const EXTERNAL_READER_PATH = "/v2/externalReader";

export interface ExternalReaderParams {
  url?: string;
  local?: string;
  lines?: LineMode;
  q?: string;
}

/** Builds a canonical External Reader URL (path + query), omitting defaults. */
export function buildExternalReaderUrl(
  params: ExternalReaderParams = {}
): string {
  const search = new URLSearchParams();
  if (params.url) search.set("url", params.url);
  else if (params.local) search.set("local", params.local);
  if (params.lines && params.lines !== DEFAULT_LINE_MODE) {
    search.set("lines", params.lines);
  }
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return query ? `${EXTERNAL_READER_PATH}?${query}` : EXTERNAL_READER_PATH;
}

/**
 * Reads External Reader params from a query string or `URLSearchParams`.
 * Unknown or malformed values fall back to defaults rather than failing, and
 * `url` wins over `local` if both are present, matching the builder.
 */
export function parseExternalReaderParams(
  search: string | URLSearchParams
): ExternalReaderParams {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const url = params.get("url")?.trim() || undefined;
  const local = url ? undefined : params.get("local") || undefined;
  const q = params.get("q")?.trim() || undefined;
  return {
    url,
    local,
    lines: parseLineMode(params.get("lines")),
    q,
  };
}
