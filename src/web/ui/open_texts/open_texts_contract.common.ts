/**
 * Shared route, URL, and SSR-to-client DOM contract for the Open Texts vertical
 * slice (`src/web/ui/open_texts/`).
 *
 * Bridges C5 (`catalog`, owning `*.server.ts` and `open_texts.css`) and
 * C6 (`otreader`, owning `*.client.ts`) so neither cell collides on files and
 * both agree on exact URL parameters, element tag names, `data-role` attributes,
 * and serialized payload format.
 */

import type {
  OpenTextCatalogEntry,
  OpenTextPeriod,
  OpenTextSourceId,
  OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";

/** Canonical route path for the Open Texts tab (Decision #15). */
export const OPEN_TEXTS_PATH = "/opentexts";

/** Custom element tag for the client-side Open Texts reader (registered by C6). */
export const OPEN_TEXT_READER_TAG = "morcus-open-text-reader";

/**
 * `data-role` hooks shared by the catalog listing (`open_texts.server.ts`)
 * and `<morcus-open-texts-view>` (`open_texts_view.client.ts`), which filters
 * the server-rendered list in place.
 */
export const OPEN_TEXTS_CATALOG_ROLES = {
  count: "open-texts-count",
  shownWorks: "open-texts-shown-works",
  shownAuthors: "open-texts-shown-authors",
  filteredNote: "open-texts-filtered-note",
  reset: "open-texts-reset",
  emptyReset: "open-texts-empty-reset",
} as const;

/** `"1 work"`, `"1,675 works"`: catalog counts, as server and client write them. */
export function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Query parameters supported on `/opentexts`:
 * - Catalog listing view (when `open` is omitted): none. Filtering is
 *   client-side (`<morcus-open-texts-view>`) and never touches the URL, so the
 *   server ignores `q`, `period`, `source` and `author` and always renders the
 *   full catalog. `buildOpenTextsUrl` still accepts them.
 * - Client-side reader view (when `open` is present): `open` (catalog entry `id`),
 *   optional `page` (target `OpenTextPage.id` to open initially; `section` accepted as alias).
 */
export interface OpenTextsUrlParams {
  readonly q?: string;
  readonly period?: OpenTextPeriod | "all";
  readonly source?: OpenTextSourceId | "all";
  readonly author?: string;
  readonly open?: string;
  readonly page?: string;
  readonly section?: string;
}

/**
 * Builds a canonical `/opentexts` URL from filter or reader parameters.
 */
export function buildOpenTextsUrl(params: OpenTextsUrlParams = {}): string {
  const search = new URLSearchParams();
  if (params.open) {
    search.set("open", params.open);
    if (params.page) {
      search.set("page", params.page);
    } else if (params.section) {
      search.set("section", params.section);
    }
  } else {
    if (params.q && params.q.trim().length > 0) {
      search.set("q", params.q.trim());
    }
    if (params.period && params.period !== "all") {
      search.set("period", params.period);
    }
    if (params.source && params.source !== "all") {
      search.set("source", params.source);
    }
    if (params.author && params.author.trim().length > 0) {
      search.set("author", params.author.trim());
    }
  }
  const qs = search.toString();
  return qs ? `${OPEN_TEXTS_PATH}?${qs}` : OPEN_TEXTS_PATH;
}

/**
 * Serialized JSON payload embedded inside `<morcus-open-text-reader>` by the
 * server when rendering `/opentexts?open=<id>` so the client-side reader (C6)
 * can immediately check IndexedDB `(entry.id, sourceMeta.commit)` or fetch the
 * pinned raw file(s) without an extra catalog round-trip.
 */
export interface OpenTextReaderPayload {
  readonly entry: OpenTextCatalogEntry;
  readonly sourceMeta: OpenTextSourceRepoMeta;
  readonly initialSection?: string;
  readonly backHref: string;
}

/**
 * Shared `data-role` values inside `<morcus-open-text-reader>` so C5's server
 * markup and C6's `onConnect()` lookups match in `ssr_conformance.test.ts`.
 */
export const OPEN_TEXT_READER_ROLES = {
  payload: "open-text-payload",
  loading: "open-text-loading",
  error: "open-text-error",
  errorMessage: "open-text-error-message",
  retry: "open-text-retry",
  mount: "open-text-mount",
} as const;

/**
 * Renders the SSR host markup for `<morcus-open-text-reader>` on `/opentexts?open=<id>`.
 *
 * Used by:
 * - C5 (`open_texts.server.ts`) when serving `/opentexts?open=<id>`
 * - C6 (`open_text_reader.client.test.ts` and `ssr_fixtures.ts`) when testing
 *   `<morcus-open-text-reader>`
 */
export function renderOpenTextReaderHostHtml(
  payload: OpenTextReaderPayload
): SafeHtml {
  const { entry, sourceMeta, backHref } = payload;
  const serialized = raw(
    JSON.stringify(payload)
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e")
      .replaceAll("&", "\\u0026")
  );
  return html`<morcus-open-text-reader
    class="external-local-host"
    data-open-text-id="${entry.id}"
    data-commit="${sourceMeta.commit}">
    <script
      type="application/json"
      data-role="${OPEN_TEXT_READER_ROLES.payload}">
      ${serialized}
    </script>
    <div
      class="external-local-status"
      data-role="${OPEN_TEXT_READER_ROLES.loading}"
      data-js-only>
      <p class="external-local-title">
        Loading <strong>${entry.title}</strong> (${entry.author})…
      </p>
    </div>
    <div
      class="external-local-status"
      data-role="${OPEN_TEXT_READER_ROLES.error}"
      hidden>
      <p
        class="external-local-title"
        data-role="${OPEN_TEXT_READER_ROLES.errorMessage}">
        Unable to load this text from ${sourceMeta.label}.
      </p>
      <div class="external-local-actions">
        <button
          type="button"
          class="btn-secondary"
          data-role="${OPEN_TEXT_READER_ROLES.retry}">
          Retry
        </button>
        <a class="btn-secondary" href="${backHref}">Back to Open Texts</a>
        <a
          class="btn-secondary"
          href="${entry.sourceUrl}"
          target="_blank"
          rel="noopener noreferrer"
          >View upstream source</a
        >
      </div>
    </div>
    <div data-role="${OPEN_TEXT_READER_ROLES.mount}" hidden></div>
    <div class="external-local-status" data-nojs-only>
      <p class="external-local-title">
        <strong>${entry.title}</strong> (${entry.author}) is fetched and parsed
        in your browser from ${sourceMeta.label}. Enable JavaScript to read it
        in Morcus, or view the raw source directly:
      </p>
      <div class="external-local-actions">
        <a
          class="btn-secondary"
          href="${entry.sourceUrl}"
          target="_blank"
          rel="noopener noreferrer"
          >View upstream source</a
        >
        <a class="btn-secondary" href="${backHref}">Back to Open Texts</a>
      </div>
    </div>
  </morcus-open-text-reader>`;
}
