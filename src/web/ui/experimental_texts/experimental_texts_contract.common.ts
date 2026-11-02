/**
 * The route, URLs and server-to-client DOM contract of the Experimental Texts
 * slice (`src/web/ui/experimental_texts/`): what the server-rendered pages
 * (`*.server.ts`) and the elements that enhance them (`*.client.ts`) must
 * agree on, namely URL parameters, tag names, `data-role` hooks and the
 * reader's embedded payload.
 */

import type {
  ExperimentalTextCatalogEntry,
  ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";

/** The route of the Experimental Texts tab: the catalog and the reader. */
export const EXPERIMENTAL_TEXTS_PATH = "/experimentalTexts";

/** The client-side Experimental Texts reader's tag. */
export const EXPERIMENTAL_TEXT_READER_TAG = "morcus-experimental-text-reader";

/**
 * `data-role` hooks shared by the catalog listing (`experimental_texts.server.ts`)
 * and `<morcus-experimental-texts-view>` (`experimental_texts_view.client.ts`), which filters
 * the server-rendered list in place.
 */
export const EXPERIMENTAL_TEXTS_CATALOG_ROLES = {
  count: "experimental-texts-count",
  shownWorks: "experimental-texts-shown-works",
  shownAuthors: "experimental-texts-shown-authors",
  filteredNote: "experimental-texts-filtered-note",
  reset: "experimental-texts-reset",
  emptyReset: "experimental-texts-empty-reset",
} as const;

/** `"1 work"`, `"1,675 works"`: catalog counts, as server and client write them. */
export function countLabel(count: number, noun: string): string {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Query parameters of `/experimentalTexts`. The catalog takes none: filtering is
 * client-side (`<morcus-experimental-texts-view>`) and never touches the URL. The
 * reader takes `open` (the catalog entry `id`) and optionally `page` (the
 * `ExperimentalTextPage.id` or label to open at).
 */
export interface ExperimentalTextsUrlParams {
  readonly open?: string;
  readonly page?: string;
}

/** Builds a canonical `/experimentalTexts` URL: the catalog, or a work's page. */
export function buildExperimentalTextsUrl(
  params: ExperimentalTextsUrlParams = {}
): string {
  const search = new URLSearchParams();
  if (params.open) {
    search.set("open", params.open);
    if (params.page) search.set("page", params.page);
  }
  const qs = search.toString();
  return qs ? `${EXPERIMENTAL_TEXTS_PATH}?${qs}` : EXPERIMENTAL_TEXTS_PATH;
}

/**
 * The JSON payload the server embeds in `<morcus-experimental-text-reader>` on
 * `/experimentalTexts?open=<id>`, so the reader can check its IndexedDB cache or
 * fetch the pinned source files without another catalog round trip.
 */
export interface ExperimentalTextReaderPayload {
  readonly entry: ExperimentalTextCatalogEntry;
  readonly sourceMeta: ExperimentalTextSourceRepoMeta;
  /** The `?page=` the page was requested with, if any. */
  readonly initialSection?: string;
  readonly backHref: string;
}

/**
 * `data-role` hooks inside `<morcus-experimental-text-reader>`, shared by the
 * server's host markup and the element's lookups.
 */
export const EXPERIMENTAL_TEXT_READER_ROLES = {
  payload: "experimental-text-payload",
  loading: "experimental-text-loading",
  error: "experimental-text-error",
  errorMessage: "experimental-text-error-message",
  retry: "experimental-text-retry",
  mount: "experimental-text-mount",
} as const;

/**
 * The server-rendered `<morcus-experimental-text-reader>` host for
 * `/experimentalTexts?open=<id>` (also used by its tests and SSR fixtures). The
 * payload's `<`, `>` and `&` are escaped as JSON `\u` escapes, so no title
 * can close the `<script>` early.
 */
export function renderExperimentalTextReaderHostHtml(
  payload: ExperimentalTextReaderPayload
): SafeHtml {
  const { entry, sourceMeta, backHref } = payload;
  const serialized = raw(
    JSON.stringify(payload)
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e")
      .replaceAll("&", "\\u0026")
  );
  return html`<morcus-experimental-text-reader
    class="external-local-host"
    data-experimental-text-id="${entry.id}"
    data-commit="${sourceMeta.commit}">
    <script
      type="application/json"
      data-role="${EXPERIMENTAL_TEXT_READER_ROLES.payload}">
      ${serialized}
    </script>
    <div
      class="external-local-status"
      data-role="${EXPERIMENTAL_TEXT_READER_ROLES.loading}"
      data-js-only>
      <p class="external-local-title">
        Loading <strong>${entry.title}</strong> (${entry.author})…
      </p>
    </div>
    <div
      class="external-local-status"
      data-role="${EXPERIMENTAL_TEXT_READER_ROLES.error}"
      hidden>
      <p
        class="external-local-title"
        data-role="${EXPERIMENTAL_TEXT_READER_ROLES.errorMessage}">
        Unable to load this text from ${sourceMeta.label}.
      </p>
      <div class="external-local-actions">
        <button
          type="button"
          class="btn-secondary"
          data-role="${EXPERIMENTAL_TEXT_READER_ROLES.retry}">
          Retry
        </button>
        <a class="btn-secondary" href="${backHref}"
          >Back to Experimental Texts</a
        >
        <a
          class="btn-secondary"
          href="${entry.sourceUrl}"
          target="_blank"
          rel="noopener noreferrer"
          >View upstream source</a
        >
      </div>
    </div>
    <div data-role="${EXPERIMENTAL_TEXT_READER_ROLES.mount}" hidden></div>
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
        <a class="btn-secondary" href="${backHref}"
          >Back to Experimental Texts</a
        >
      </div>
    </div>
  </morcus-experimental-text-reader>`;
}
