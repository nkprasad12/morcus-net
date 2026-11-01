/**
 * `<morcus-open-text-reader>`: the client-side reader for Open Texts
 * (`/opentexts?open=<id>`, M4).
 *
 * Open Texts ship only catalog metadata. The server renders this host with the
 * work's catalog entry and pinned source (`renderOpenTextReaderHostHtml` in
 * `open_texts_contract.common.ts`), and this element does the rest in the
 * browser:
 *
 * 1. Reads the cached parse from IndexedDB (`open_text_storage.client.ts`),
 *    keyed by the entry id and the pinned commit.
 * 2. On a miss, fetches every file in `entry.files` from the pinned commit on
 *    `raw.githubusercontent.com`, falling back to `cdn.jsdelivr.net` when the
 *    primary fails or answers non-2xx, and parses them with the entry's
 *    format parser ({@link OPEN_TEXT_PARSERS}). The result is cached.
 * 3. Mounts a `<morcus-reader-view>` frame for the page in `?page=` (or
 *    `?section=`, the server's `initialSection`, or the last page read) into
 *    `[data-role="open-text-mount"]` (`open_text_view_adapter.client.ts`), and
 *    turns pages in place (from the pager or the contents dialog), keeping
 *    `?page=` and the reading position current.
 *
 * Without JS the host shows its No-JS note and a link to the upstream source;
 * see "The M4 JS-only exception" in `src/web/ui/README.md`.
 */

import type {
  OpenTextCatalogEntry,
  OpenTextFormat,
  OpenTextSourceRepoMeta,
} from "@/common/open_texts/catalog_types";
import { buildOpenTextFileUrls } from "@/common/open_texts/catalog_types";
import type { OpenTextDocument } from "@/common/open_texts/open_text_document";
import { parseLatinLibraryOpenText } from "@/common/open_texts/latin_library_adapter";
import { parseTeiDocument } from "@/common/open_texts/tei_parser";
import { decodeLatinLibraryHtmlBytes } from "@/common/thelatinlibrary";
import {
  BaseElement,
  isPlainLeftClick,
  queryUpgraded,
  registerElement,
} from "@/web/ui/core/index.client";
import {
  OPEN_TEXT_READER_ROLES,
  type OpenTextReaderPayload,
} from "@/web/ui/open_texts/open_texts_contract.common";
import {
  OpenTextStore,
  openTextCacheKey,
} from "@/web/ui/open_texts/open_text_storage.client";
import {
  OPEN_TEXT_VIEW_ROLES,
  findOpenTextPageIndex,
  mountOpenTextFrame,
  openTextPageHref,
  renderOpenTextFrameHtml,
  renderOpenTextPassageHtml,
  syncOpenTextPageChrome,
  type OpenTextViewModel,
} from "@/web/ui/open_texts/open_text_view_adapter.client";

/** One fetched source file, as raw bytes (decoding is format-specific). */
export interface FetchedOpenTextFile {
  /** The path within the source repository, from `entry.files`. */
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

/**
 * Turns an entry's fetched files (in `entry.files` order) into a document.
 * Throwing shows the reader's error state.
 */
export type OpenTextParser = (
  files: readonly FetchedOpenTextFile[],
  entry: OpenTextCatalogEntry
) => OpenTextDocument;

/** A user-facing failure: its message is shown as is. */
export class OpenTextLoadError extends Error {
  override name = "OpenTextLoadError";
}

/** TEI (Patrologia Latina): UTF-8 XML, one file per work. */
export function parseTeiFiles(
  files: readonly FetchedOpenTextFile[]
): OpenTextDocument {
  const decoder = new TextDecoder("utf-8");
  const docs = files.map((file) =>
    parseTeiDocument(decoder.decode(file.bytes))
  );
  if (docs.length === 0) {
    throw new OpenTextLoadError("This text has no source files.");
  }
  if (docs.length === 1) return docs[0];
  // Several files read as one document, in order; page ids stay unique.
  const seen = new Set<string>();
  const pages = docs.flatMap((doc, fileIndex) =>
    doc.pages.map((page) => {
      const id = seen.has(page.id) ? `${fileIndex + 1}-${page.id}` : page.id;
      seen.add(id);
      return { ...page, id };
    })
  );
  return {
    ...docs[0],
    pages,
    warnings: docs.flatMap((doc) => doc.warnings),
  };
}

/**
 * The Latin Library (`thelatinlibrary_html`): decodes raw bytes with
 * `decodeLatinLibraryHtmlBytes` (handling ISO-8859-1 / windows-1252 pages)
 * and parses into `OpenTextDocument` via `parseLatinLibraryOpenText`.
 */
export function parseLatinLibraryFiles(
  files: readonly FetchedOpenTextFile[],
  entry: OpenTextCatalogEntry
): OpenTextDocument {
  if (files.length === 0) {
    throw new OpenTextLoadError("This text has no source files.");
  }
  const pages = files.map((file) => ({
    path: file.path,
    html: decodeLatinLibraryHtmlBytes(file.bytes),
  }));
  return parseLatinLibraryOpenText(pages, {
    title: entry.title,
    author: entry.author,
  });
}

/** The parser for each catalog format. */
export const OPEN_TEXT_PARSERS: Readonly<
  Record<OpenTextFormat, OpenTextParser>
> = {
  tei: parseTeiFiles,
  thelatinlibrary_html: parseLatinLibraryFiles,
};

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "arrayBuffer">>;

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Fetches one file of a pinned source: the raw GitHub URL first, then the
 * jsDelivr mirror when that throws or answers non-2xx.
 */
export async function fetchOpenTextFile(
  sourceMeta: Pick<OpenTextSourceRepoMeta, "rawBaseUrl" | "fallbackBaseUrl">,
  path: string,
  fetchFn: FetchLike,
  signal?: AbortSignal
): Promise<FetchedOpenTextFile> {
  const { primaryUrl, fallbackUrl } = buildOpenTextFileUrls(sourceMeta, path);
  let lastError: unknown;
  for (const url of [primaryUrl, fallbackUrl]) {
    try {
      const response = await fetchFn(url, { signal, credentials: "omit" });
      if (response.ok) {
        return { path, bytes: await response.arrayBuffer() };
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (err) {
      if (isAbort(err)) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface LoadDeps {
  readonly store: OpenTextStore;
  readonly fetchFn: FetchLike;
  readonly parsers?: Readonly<Record<OpenTextFormat, OpenTextParser>>;
  readonly signal?: AbortSignal;
}

/**
 * The parsed document for an entry: from the cache when present, else
 * fetched, parsed and cached. Caching is best effort and never fails a load.
 */
export async function loadOpenTextDocument(
  entry: OpenTextCatalogEntry,
  sourceMeta: OpenTextSourceRepoMeta,
  deps: LoadDeps
): Promise<OpenTextDocument> {
  const key = openTextCacheKey(entry.id, sourceMeta.commit);
  const cached = await deps.store.getDocument(key);
  if (cached !== undefined) return cached;

  const parser = (deps.parsers ?? OPEN_TEXT_PARSERS)[entry.format];
  if (parser === undefined) {
    throw new OpenTextLoadError("This text's format isn't supported.");
  }
  const files = await Promise.all(
    entry.files.map((path) =>
      fetchOpenTextFile(sourceMeta, path, deps.fetchFn, deps.signal)
    )
  );
  const doc = parser(files, entry);
  if (doc.pages.length === 0) {
    throw new OpenTextLoadError("No text was found in this source.");
  }
  await deps.store.putDocument(entry.id, key, doc);
  return doc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses the host's embedded payload, or null when it's malformed. */
export function parseOpenTextReaderPayload(
  text: string | null | undefined
): OpenTextReaderPayload | null {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { entry, sourceMeta, backHref } = value;
  if (
    !isRecord(entry) ||
    !isRecord(sourceMeta) ||
    typeof entry.id !== "string" ||
    typeof entry.format !== "string" ||
    !Array.isArray(entry.files) ||
    typeof sourceMeta.commit !== "string" ||
    typeof sourceMeta.rawBaseUrl !== "string" ||
    typeof sourceMeta.fallbackBaseUrl !== "string" ||
    typeof backHref !== "string"
  ) {
    return null;
  }
  // Safe: the server serializes `OpenTextReaderPayload`, and the fields
  // the reader depends on were checked above.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return value as unknown as OpenTextReaderPayload;
}

/** A page in the contents dialog (`reader_toc.common.ts`). */
const TOC_ITEM_SELECTOR = "#reader-toc-drawer a.reader-toc-item[data-page-id]";

/** The links that turn pages in place: the pager arrows and the contents. */
const PAGE_LINK_SELECTOR = [
  `a[data-role="${OPEN_TEXT_VIEW_ROLES.prev}"]`,
  `a[data-role="${OPEN_TEXT_VIEW_ROLES.next}"]`,
  TOC_ITEM_SELECTOR,
].join(", ");

const DEFAULT_ERROR =
  "Unable to load this text right now. The source may be unreachable.";

export class MorcusOpenTextReader extends BaseElement {
  /** The document cache. Replaceable in tests. */
  public store = new OpenTextStore();
  /** Network access. Replaceable in tests. */
  public fetchFn: FetchLike = (url, init) => fetch(url, init);
  /** Settles when the load started on connect (or by Retry) is done. */
  public ready: Promise<void> = Promise.resolve();

  #payload: OpenTextReaderPayload | null = null;
  #model: OpenTextViewModel | null = null;
  #pageIndex = 0;

  get #mount() {
    return this.scope.$(`[data-role="${OPEN_TEXT_READER_ROLES.mount}"]`);
  }

  protected override onConnect(): void {
    this.#payload = parseOpenTextReaderPayload(
      this.scope.$(`[data-role="${OPEN_TEXT_READER_ROLES.payload}"]`)
        ?.textContent
    );
    this.scope.listen(
      this.scope.$(`[data-role="${OPEN_TEXT_READER_ROLES.retry}"]`),
      "click",
      () => {
        this.ready = this.#load();
      }
    );
    this.scope.listen(this, "click", this.#handleClick);
    this.scope.listen(window, "popstate", this.#handlePopState);
    // Moved in the DOM after loading: the frame (and its reader view, which
    // reconnects itself) is still there, so only the listeners come back.
    if (
      this.#model !== null &&
      this.#mount?.querySelector("morcus-reader-view")
    ) {
      this.ready = Promise.resolve();
      return;
    }
    this.ready = this.#load();
  }

  protected override onDisconnect(): void {
    void this.store.close();
  }

  #showState(state: "loading" | "error" | "ready", message?: string): void {
    const loading = this.scope.$(
      `[data-role="${OPEN_TEXT_READER_ROLES.loading}"]`
    );
    const error = this.scope.$(`[data-role="${OPEN_TEXT_READER_ROLES.error}"]`);
    const mount = this.#mount;
    if (loading) loading.hidden = state !== "loading";
    if (error) error.hidden = state !== "error";
    if (mount) mount.hidden = state !== "ready";
    if (state === "error") {
      const text = this.scope.$(
        `[data-role="${OPEN_TEXT_READER_ROLES.errorMessage}"]`
      );
      if (text) text.textContent = message ?? DEFAULT_ERROR;
    }
    // Once the frame is mounted, the host and mount step out of the layout
    // so `.reader-view` sits in the reader page's flex column, as on
    // library pages.
    const display = state === "ready" ? "contents" : "";
    this.style.display = display;
    if (mount) mount.style.display = display;
  }

  async #load(): Promise<void> {
    const payload = this.#payload;
    if (payload === null) {
      this.#showState("error", DEFAULT_ERROR);
      return;
    }
    const signal = this.scope.signal;
    this.#showState("loading");
    let doc: OpenTextDocument;
    try {
      doc = await loadOpenTextDocument(payload.entry, payload.sourceMeta, {
        store: this.store,
        fetchFn: this.fetchFn,
        signal,
      });
    } catch (err) {
      if (signal.aborted) return;
      this.#showState(
        "error",
        err instanceof OpenTextLoadError ? err.message : DEFAULT_ERROR
      );
      return;
    }
    if (signal.aborted) return;

    const model: OpenTextViewModel = {
      entry: payload.entry,
      sourceMeta: payload.sourceMeta,
      doc,
      backHref: payload.backHref,
    };
    const params = new URLSearchParams(window.location.search);
    const urlRef = params.get("page") ?? params.get("section");
    let index = findOpenTextPageIndex(doc, urlRef ?? payload.initialSection);
    if (index < 0 && urlRef === null) {
      const saved = await this.store.getPosition(payload.entry.id);
      if (signal.aborted) return;
      index = findOpenTextPageIndex(doc, saved?.pageId);
    }
    if (index < 0) index = 0;

    const mount = this.#mount;
    if (!mount) return;
    this.#model = model;
    this.#pageIndex = index;
    this.#showState("ready");
    mountOpenTextFrame(
      mount,
      renderOpenTextFrameHtml(model, index, params.get("q")?.trim() ?? "")
    );
    this.#syncUrl(false);
    void this.store.setPosition(payload.entry.id, doc.pages[index].id);
  }

  /** Records the current page in `?page=` (push for a page turn). */
  #syncUrl(push: boolean): void {
    const model = this.#model;
    if (!model) return;
    const pageId = model.doc.pages[this.#pageIndex].id;
    const url = new URL(window.location.href);
    if (url.searchParams.get("page") === pageId) return;
    // Keep `q` (the dictionary lookup) and the rest; normalize the page.
    const canonical = new URL(
      openTextPageHref(model.entry.id, pageId),
      url.origin
    );
    for (const [key, value] of url.searchParams) {
      if (key !== "open" && key !== "page" && key !== "section") {
        canonical.searchParams.set(key, value);
      }
    }
    const next = `${canonical.pathname}${canonical.search}`;
    const state: unknown = window.history.state;
    if (push) {
      window.history.pushState(state, "", next);
    } else {
      window.history.replaceState(state, "", next + url.hash);
    }
  }

  /** Shows page `index` in place; false when there is no frame to update. */
  #showPage(index: number, options: { push: boolean }): boolean {
    const model = this.#model;
    const mount = this.#mount;
    if (!model || !mount || index < 0 || index >= model.doc.pages.length) {
      return false;
    }
    const view = queryUpgraded(mount, "morcus-reader-view");
    if (!view) return false;
    this.#pageIndex = index;
    const page = model.doc.pages[index];
    if (options.push) this.#syncUrl(true);
    view.adoptPassage(renderOpenTextPassageHtml(page));
    syncOpenTextPageChrome(mount, model, index);
    view.syncTocActivePage(page.id);
    // A new page starts at its top (the passage scrolls in the text panel on
    // desktop and in the window on phones).
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const panel = mount.querySelector<HTMLElement>(".reader-text-panel");
    if (panel) panel.scrollTop = 0;
    void this.store.setPosition(model.entry.id, page.id);
    return true;
  }

  readonly #handleClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || !isPlainLeftClick(e)) return;
    if (!(e.target instanceof Element)) return;
    const link = e.target.closest<HTMLAnchorElement>(PAGE_LINK_SELECTOR);
    if (!link || !this.contains(link)) return;
    const href = link.getAttribute("href");
    const model = this.#model;
    if (!href || !model) return;
    const tocItem = link.matches(TOC_ITEM_SELECTOR);
    if (tocItem) {
      // A page chosen in the contents: close them, then turn to it.
      const mount = this.#mount;
      if (mount) queryUpgraded(mount, "morcus-reader-view")?.closeToc();
    }
    const pageId =
      (tocItem ? link.dataset.pageId : undefined) ??
      new URL(href, window.location.href).searchParams.get("page");
    const index = findOpenTextPageIndex(model.doc, pageId);
    if (index < 0 || index === this.#pageIndex) {
      // At either end, or the page already shown: nothing to turn to.
      e.preventDefault();
      return;
    }
    // Turns the page in place instead of reloading and re-parsing the work.
    if (this.#showPage(index, { push: true })) e.preventDefault();
  };

  readonly #handlePopState = (): void => {
    const model = this.#model;
    if (!model) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== model.entry.id) return;
    const index = findOpenTextPageIndex(
      model.doc,
      params.get("page") ?? params.get("section")
    );
    const target = index < 0 ? 0 : index;
    if (target !== this.#pageIndex) this.#showPage(target, { push: false });
  };
}

registerElement("morcus-open-text-reader", MorcusOpenTextReader);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-open-text-reader": MorcusOpenTextReader;
  }
}
