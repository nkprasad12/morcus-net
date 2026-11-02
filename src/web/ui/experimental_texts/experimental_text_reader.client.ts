/**
 * `<morcus-experimental-text-reader>`: the client-side reader for Experimental Texts
 * (`/experimentalTexts?open=<id>`).
 *
 * Experimental Texts ship only catalog metadata. The server renders this host with the
 * work's catalog entry and pinned source (`renderExperimentalTextReaderHostHtml` in
 * `experimental_texts_contract.common.ts`), and this element does the rest in the
 * browser:
 *
 * 1. Reads the cached parse from IndexedDB (`experimental_text_storage.client.ts`),
 *    keyed by the entry id, the pinned commit and the document version.
 * 2. On a miss, fetches every file in `entry.files` from the pinned commit on
 *    `raw.githubusercontent.com`, falling back to `cdn.jsdelivr.net` when the
 *    primary fails, answers non-2xx or times out, and parses them with the
 *    entry's format parser ({@link EXPERIMENTAL_TEXT_PARSERS}). The result is cached.
 * 3. Mounts a `<morcus-reader-view>` frame for the page in `?page=` (or the
 *    last page read) into `[data-role="experimental-text-mount"]`
 *    (`experimental_text_view_adapter.client.ts`), scrolls to a `#sec-` permalink,
 *    and turns pages in place (from the pager or the contents dialog), keeping
 *    `?page=`, the history entries' scroll positions and the reading position
 *    current.
 *
 * Without JS the host shows its No-JS note and a link to the upstream source;
 * see "JS-only exception: Experimental Texts" in `src/web/ui/README.md`.
 */

import type {
  ExperimentalTextCatalogEntry,
  ExperimentalTextFormat,
  ExperimentalTextSourceRepoMeta,
} from "@/common/experimental_texts/catalog_types";
import { buildExperimentalTextFileUrls } from "@/common/experimental_texts/catalog_types";
import type { ExperimentalTextDocument } from "@/common/experimental_texts/experimental_text_document";
import { parseLatinLibraryExperimentalText } from "@/common/experimental_texts/latin_library_adapter";
import { parseTeiDocument } from "@/common/experimental_texts/tei_parser";
import { decodeLatinLibraryHtmlBytes } from "@/common/thelatinlibrary";
import {
  BaseElement,
  isPlainLeftClick,
  queryUpgraded,
  registerElement,
} from "@/web/ui/core/index.client";
import {
  EXPERIMENTAL_TEXT_READER_ROLES,
  type ExperimentalTextReaderPayload,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import {
  ExperimentalTextStore,
  experimentalTextCacheKey,
} from "@/web/ui/experimental_texts/experimental_text_storage.client";
import {
  EXPERIMENTAL_TEXT_VIEW_ROLES,
  findExperimentalTextPageIndex,
  mountExperimentalTextFrame,
  experimentalTextPageHref,
  renderExperimentalTextFrameHtml,
  renderExperimentalTextPassageHtml,
  swapExperimentalTextNotes,
  syncExperimentalTextPageChrome,
  type ExperimentalTextViewModel,
} from "@/web/ui/experimental_texts/experimental_text_view_adapter.client";
import type { PageDir } from "@/web/ui/reader/reader_page_nav.client";

/** One fetched source file, as raw bytes (decoding is format-specific). */
export interface FetchedExperimentalTextFile {
  /** The path within the source repository, from `entry.files`. */
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

/**
 * Turns an entry's fetched files (in `entry.files` order) into a document.
 * Throwing shows the reader's error state.
 */
export type ExperimentalTextParser = (
  files: readonly FetchedExperimentalTextFile[],
  entry: ExperimentalTextCatalogEntry
) => ExperimentalTextDocument;

/** A user-facing failure: its message is shown as is. */
export class ExperimentalTextLoadError extends Error {
  override name = "ExperimentalTextLoadError";
}

/** TEI (Patrologia Latina): UTF-8 XML, one file per work. */
export function parseTeiFiles(
  files: readonly FetchedExperimentalTextFile[]
): ExperimentalTextDocument {
  const decoder = new TextDecoder("utf-8");
  const docs = files.map((file) =>
    parseTeiDocument(decoder.decode(file.bytes))
  );
  if (docs.length === 0) {
    throw new ExperimentalTextLoadError("This text has no source files.");
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
 * and parses into `ExperimentalTextDocument` via `parseLatinLibraryExperimentalText`.
 */
export function parseLatinLibraryFiles(
  files: readonly FetchedExperimentalTextFile[],
  entry: ExperimentalTextCatalogEntry
): ExperimentalTextDocument {
  if (files.length === 0) {
    throw new ExperimentalTextLoadError("This text has no source files.");
  }
  const pages = files.map((file) => ({
    path: file.path,
    html: decodeLatinLibraryHtmlBytes(file.bytes),
  }));
  return parseLatinLibraryExperimentalText(pages, {
    title: entry.title,
    author: entry.author,
  });
}

/** The parser for each catalog format. */
export const EXPERIMENTAL_TEXT_PARSERS: Readonly<
  Record<ExperimentalTextFormat, ExperimentalTextParser>
> = {
  tei: parseTeiFiles,
  thelatinlibrary_html: parseLatinLibraryFiles,
};

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<Pick<Response, "ok" | "status" | "arrayBuffer">>;

/**
 * How long one fetch attempt (response and body) may take before the next
 * URL is tried. A blackholed host otherwise leaves the reader on "Loading…"
 * for minutes instead of falling back to the mirror.
 */
export const EXPERIMENTAL_TEXT_FETCH_TIMEOUT_MS = 10_000;

function abortError(): Error {
  const err = new Error("The load was aborted.");
  err.name = "AbortError";
  return err;
}

/** Throws when `signal` (the element's lifetime) has been aborted. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

/**
 * A signal for one fetch attempt: aborted when `outer` is, or after
 * `timeoutMs`. Built by hand rather than with `AbortSignal.any` /
 * `AbortSignal.timeout`, which older Safari lacks.
 */
function attemptSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  // An AbortSignal, not UI: the activation gate doesn't apply, and dispose()
  // removes the listener.
  // eslint-disable-next-line no-restricted-syntax
  outer?.addEventListener("abort", onAbort, { once: true });
  if (outer?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Fetches one file of a pinned source: the raw GitHub URL first, then the
 * jsDelivr mirror when that throws, answers non-2xx, or takes longer than
 * `timeoutMs`. Only an abort of `signal` itself stops early.
 */
export async function fetchExperimentalTextFile(
  sourceMeta: Pick<
    ExperimentalTextSourceRepoMeta,
    "rawBaseUrl" | "fallbackBaseUrl"
  >,
  path: string,
  fetchFn: FetchLike,
  signal?: AbortSignal,
  timeoutMs: number = EXPERIMENTAL_TEXT_FETCH_TIMEOUT_MS
): Promise<FetchedExperimentalTextFile> {
  const { primaryUrl, fallbackUrl } = buildExperimentalTextFileUrls(
    sourceMeta,
    path
  );
  let lastError: unknown;
  for (const url of [primaryUrl, fallbackUrl]) {
    throwIfAborted(signal);
    const attempt = attemptSignal(signal, timeoutMs);
    try {
      const response = await fetchFn(url, {
        signal: attempt.signal,
        credentials: "omit",
      });
      if (response.ok) {
        return { path, bytes: await response.arrayBuffer() };
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (err) {
      throwIfAborted(signal);
      // A timeout or a network error: try the next URL.
      lastError = attempt.signal.aborted
        ? new Error(`Timed out after ${timeoutMs} ms for ${url}`)
        : err;
    } finally {
      attempt.dispose();
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface LoadDeps {
  readonly store: ExperimentalTextStore;
  readonly fetchFn: FetchLike;
  readonly parsers?: Readonly<
    Record<ExperimentalTextFormat, ExperimentalTextParser>
  >;
  /** Stops the load: nothing is parsed or cached once it is aborted. */
  readonly signal?: AbortSignal;
  /** Per-attempt fetch timeout; defaults to {@link EXPERIMENTAL_TEXT_FETCH_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * The parsed document for an entry: from the cache when present, else
 * fetched, parsed and cached. Caching is best effort and never fails a load.
 */
export async function loadExperimentalTextDocument(
  entry: ExperimentalTextCatalogEntry,
  sourceMeta: ExperimentalTextSourceRepoMeta,
  deps: LoadDeps
): Promise<ExperimentalTextDocument> {
  const key = experimentalTextCacheKey(entry.id, sourceMeta.commit);
  const cached = await deps.store.getDocument(key);
  if (cached !== undefined) return cached;

  const parser = (deps.parsers ?? EXPERIMENTAL_TEXT_PARSERS)[entry.format];
  if (parser === undefined) {
    throw new ExperimentalTextLoadError("This text's format isn't supported.");
  }
  throwIfAborted(deps.signal);
  const files = await Promise.all(
    entry.files.map((path) =>
      fetchExperimentalTextFile(
        sourceMeta,
        path,
        deps.fetchFn,
        deps.signal,
        deps.timeoutMs
      )
    )
  );
  // The reader left while the files downloaded: don't parse them, and don't
  // reopen the database it closed to store the result.
  throwIfAborted(deps.signal);
  const doc = parser(files, entry);
  if (doc.pages.length === 0) {
    throw new ExperimentalTextLoadError("No text was found in this source.");
  }
  throwIfAborted(deps.signal);
  await deps.store.putDocument(entry.id, key, doc);
  return doc;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses the host's embedded payload, or null when it's malformed. */
export function parseExperimentalTextReaderPayload(
  text: string | null | undefined
): ExperimentalTextReaderPayload | null {
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
  // Safe: the server serializes `ExperimentalTextReaderPayload`, and the fields
  // the reader depends on were checked above.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return value as unknown as ExperimentalTextReaderPayload;
}

/** A page in the contents dialog (`reader_toc.common.ts`). */
const TOC_ITEM_SELECTOR = "#reader-toc-drawer a.reader-toc-item[data-page-id]";

/** The links that turn pages in place: the pager arrows and the contents. */
const PAGE_LINK_SELECTOR = [
  `a[data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.prev}"]`,
  `a[data-role="${EXPERIMENTAL_TEXT_VIEW_ROLES.next}"]`,
  TOC_ITEM_SELECTOR,
].join(", ");

/** The `history.state` key holding a page's scroll offset for Back / Forward. */
const SCROLL_STATE_KEY = "experimentalTextScrollY";

const DEFAULT_ERROR =
  "Unable to load this text right now. The source may be unreachable.";

export class MorcusExperimentalTextReader extends BaseElement {
  /** The document cache. Replaceable in tests. */
  public store = new ExperimentalTextStore();
  /** Network access. Replaceable in tests. */
  public fetchFn: FetchLike = (url, init) => fetch(url, init);
  /** Settles when the load started on connect (or by Retry) is done. */
  public ready: Promise<void> = Promise.resolve();

  #payload: ExperimentalTextReaderPayload | null = null;
  #model: ExperimentalTextViewModel | null = null;
  #pageIndex = 0;

  get #mount() {
    return this.scope.$(
      `[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.mount}"]`
    );
  }

  protected override onConnect(): void {
    this.#payload = parseExperimentalTextReaderPayload(
      this.scope.$(`[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.payload}"]`)
        ?.textContent
    );
    this.scope.listen(
      this.scope.$(`[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.retry}"]`),
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
      `[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.loading}"]`
    );
    const error = this.scope.$(
      `[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.error}"]`
    );
    const mount = this.#mount;
    if (loading) loading.hidden = state !== "loading";
    if (error) error.hidden = state !== "error";
    if (mount) mount.hidden = state !== "ready";
    if (state === "error") {
      const text = this.scope.$(
        `[data-role="${EXPERIMENTAL_TEXT_READER_ROLES.errorMessage}"]`
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
    let doc: ExperimentalTextDocument;
    try {
      doc = await loadExperimentalTextDocument(
        payload.entry,
        payload.sourceMeta,
        {
          store: this.store,
          fetchFn: this.fetchFn,
          signal,
        }
      );
    } catch (err) {
      if (signal.aborted) return;
      this.#showState(
        "error",
        err instanceof ExperimentalTextLoadError ? err.message : DEFAULT_ERROR
      );
      return;
    }
    if (signal.aborted) return;

    const params = new URLSearchParams(window.location.search);
    const urlRef = params.get("page");
    let saved: string | undefined;
    if (urlRef === null && !payload.initialSection) {
      saved = (await this.store.getPosition(payload.entry.id))?.pageId;
      if (signal.aborted) return;
    }
    try {
      this.#mountDocument(
        payload,
        doc,
        urlRef ?? payload.initialSection ?? saved,
        params
      );
    } catch {
      // A cached document this code can no longer render (or a parser bug):
      // drop it so Retry fetches a fresh copy, and say so instead of leaving
      // an empty mount.
      this.#model = null;
      void this.store.deleteDocument(
        experimentalTextCacheKey(payload.entry.id, payload.sourceMeta.commit)
      );
      this.#showState("error", DEFAULT_ERROR);
    }
  }

  /** Renders and mounts `doc` at the page `pageRef` names (else the first). */
  #mountDocument(
    payload: ExperimentalTextReaderPayload,
    doc: ExperimentalTextDocument,
    pageRef: string | undefined,
    params: URLSearchParams
  ): void {
    const mount = this.#mount;
    if (!mount) return;
    const model: ExperimentalTextViewModel = {
      entry: payload.entry,
      sourceMeta: payload.sourceMeta,
      doc,
      backHref: payload.backHref,
    };
    const index = Math.max(0, findExperimentalTextPageIndex(doc, pageRef));
    const frame = renderExperimentalTextFrameHtml(
      model,
      index,
      params.get("q")?.trim() ?? ""
    );
    this.#model = model;
    this.#pageIndex = index;
    this.#showState("ready");
    mountExperimentalTextFrame(mount, frame);
    this.#attachPageTurner(mount);
    this.#syncUrl(false);
    // The browser's own jump to a `#sec-` permalink happened before the
    // passage existed, so it is made here.
    this.#scrollToHash(window.location.hash);
    void this.store.setPosition(payload.entry.id, doc.pages[index].id);
  }

  /**
   * Scrolls to the element a `#…` hash names inside the frame (a section
   * lands below the sticky bar, at its `scroll-margin-top`). False when there
   * is no such element.
   */
  #scrollToHash(hash: string): boolean {
    let id: string;
    try {
      id = decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
      return false;
    }
    if (!id) return false;
    const target = this.ownerDocument.getElementById(id);
    if (!target || !this.contains(target)) return false;
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }
    return true;
  }

  /**
   * Lets the reader view's swipe gesture and `[` / `]` shortcuts turn pages
   * in place. The frame has no server pager (`#pager-prev` / `#pager-next`)
   * for the view to swap pages from, so it asks this element instead.
   */
  #attachPageTurner(mount: Element): void {
    const view = queryUpgraded(mount, "morcus-reader-view");
    if (!view) return;
    const target = (dir: PageDir) =>
      this.#pageIndex + (dir === "next" ? 1 : -1);
    view.pageTurner = {
      canTurn: (dir) => {
        const index = target(dir);
        return (
          this.#model !== null &&
          index >= 0 &&
          index < this.#model.doc.pages.length
        );
      },
      turn: (dir) =>
        Promise.resolve(this.#showPage(target(dir), { push: true })),
    };
  }

  /** The passage's scroll offset: the text panel on desktop, else the window. */
  #pageScroll(): number {
    const panel = this.#mount?.querySelector<HTMLElement>(".reader-text-panel");
    return Math.max(window.scrollY, panel?.scrollTop ?? 0);
  }

  #setPageScroll(top: number): void {
    window.scrollTo({ top, left: 0, behavior: "instant" });
    const panel = this.#mount?.querySelector<HTMLElement>(".reader-text-panel");
    if (panel) panel.scrollTop = top;
  }

  /**
   * Records the current page in `?page=`. A page turn (`push`) first saves
   * the scroll position into the entry being left, so Back returns to it,
   * then pushes a fresh entry carrying `hash` (a section on the new page).
   */
  #syncUrl(push: boolean, hash: string = ""): void {
    const model = this.#model;
    if (!model) return;
    const pageId = model.doc.pages[this.#pageIndex].id;
    const url = new URL(window.location.href);
    if (!push && url.searchParams.get("page") === pageId) return;
    // Keep `q` (the dictionary lookup) and the rest; normalize the page.
    const canonical = new URL(
      experimentalTextPageHref(model.entry.id, pageId),
      url.origin
    );
    for (const [key, value] of url.searchParams) {
      if (key !== "open" && key !== "page") {
        canonical.searchParams.set(key, value);
      }
    }
    const next = `${canonical.pathname}${canonical.search}`;
    if (push) {
      this.#saveScrollState();
      window.history.pushState(null, "", next + hash);
    } else {
      window.history.replaceState(window.history.state, "", next + url.hash);
    }
  }

  /** Saves the scroll offset into the current history entry's state. */
  #saveScrollState(): void {
    const current: unknown = window.history.state;
    const state: Record<string, unknown> =
      typeof current === "object" && current !== null ? { ...current } : {};
    state[SCROLL_STATE_KEY] = this.#pageScroll();
    window.history.replaceState(state, "", window.location.href);
  }

  /**
   * Shows page `index` in place; false when there is no frame to update.
   * `push` adds a history entry (with `hash`, a section to scroll to);
   * `scrollTop` restores a saved offset (Back / Forward).
   */
  #showPage(
    index: number,
    options: { push: boolean; hash?: string; scrollTop?: number }
  ): boolean {
    const model = this.#model;
    const mount = this.#mount;
    if (!model || !mount || index < 0 || index >= model.doc.pages.length) {
      return false;
    }
    const view = queryUpgraded(mount, "morcus-reader-view");
    if (!view) return false;
    this.#pageIndex = index;
    const page = model.doc.pages[index];
    if (options.push) this.#syncUrl(true, options.hash ?? "");
    // The view scrolls to the URL's hash, if the new page has that element.
    view.adoptPassage(renderExperimentalTextPassageHtml(page));
    swapExperimentalTextNotes(mount, model, index);
    syncExperimentalTextPageChrome(mount, model, index);
    view.syncTocActivePage(page.id);
    if (options.scrollTop !== undefined) {
      this.#setPageScroll(options.scrollTop);
    } else if (!this.#hashTargetExists(window.location.hash)) {
      // A new page starts at its top.
      this.#setPageScroll(0);
    }
    void this.store.setPosition(model.entry.id, page.id);
    return true;
  }

  #hashTargetExists(hash: string): boolean {
    let id: string;
    try {
      id = decodeURIComponent(hash.replace(/^#/, ""));
    } catch {
      return false;
    }
    const target = id ? this.ownerDocument.getElementById(id) : null;
    return target !== null && this.contains(target);
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
    const target = new URL(href, window.location.href);
    // A jump to a section within a page (`529.A` in the contents) adds
    // `#sec-…` to the page's link.
    const hash = target.hash;
    const pageId =
      (tocItem ? link.dataset.pageId : undefined) ??
      target.searchParams.get("page");
    const index = findExperimentalTextPageIndex(model.doc, pageId);
    if (index === this.#pageIndex && hash) {
      // A section on the page already shown: just go there.
      e.preventDefault();
      this.#saveScrollState();
      window.history.pushState(
        null,
        "",
        window.location.pathname + window.location.search + hash
      );
      this.#scrollToHash(hash);
      return;
    }
    if (index < 0 || index === this.#pageIndex) {
      // At either end, or the page already shown: nothing to turn to.
      e.preventDefault();
      return;
    }
    // Turns the page in place instead of reloading and re-parsing the work.
    if (this.#showPage(index, { push: true, hash })) e.preventDefault();
  };

  readonly #handlePopState = (): void => {
    const model = this.#model;
    if (!model) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== model.entry.id) return;
    const index = findExperimentalTextPageIndex(model.doc, params.get("page"));
    const target = index < 0 ? 0 : index;
    // On popstate, `history.state` is the entry being returned to.
    const state: unknown = window.history.state;
    const saved: unknown =
      typeof state === "object" && state !== null
        ? Reflect.get(state, SCROLL_STATE_KEY)
        : undefined;
    const scrollTop = typeof saved === "number" ? saved : undefined;
    if (target !== this.#pageIndex) {
      this.#showPage(target, { push: false, scrollTop });
    } else if (scrollTop !== undefined) {
      this.#setPageScroll(scrollTop);
    } else {
      this.#scrollToHash(window.location.hash);
    }
  };
}

registerElement(
  "morcus-experimental-text-reader",
  MorcusExperimentalTextReader
);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-experimental-text-reader": MorcusExperimentalTextReader;
  }
}
