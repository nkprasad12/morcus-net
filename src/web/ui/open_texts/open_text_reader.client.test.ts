/**
 * @jest-environment jsdom
 */

// Mounts the server-rendered Open Texts reader host with the real client
// elements, backed by an in-memory IndexedDB and a fake network.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

// On the page, `reader.js` (which external.js depends on) defines the view.
import "@/web/ui/reader/reader_view.client";
import type { OpenTextDocument } from "@/common/open_texts/open_text_document";
import {
  MorcusOpenTextReader,
  fetchOpenTextFile,
  loadOpenTextDocument,
  parseOpenTextReaderPayload,
  parseTeiFiles,
  type FetchLike,
} from "@/web/ui/open_texts/open_text_reader.client";
import {
  OpenTextStore,
  openTextCacheKey,
} from "@/web/ui/open_texts/open_text_storage.client";
import {
  FIXTURE_LL_PARTIAL_ENTRY,
  FIXTURE_LL_SOURCE,
  FIXTURE_PL_ENTRY,
  FIXTURE_PL_SOURCE,
} from "@/web/ui/open_texts/open_texts_reader_fixtures";
import { renderOpenTextReaderHostHtml } from "@/web/ui/open_texts/open_texts_contract.common";
import { buildOpenTextFileUrls } from "@/common/open_texts/catalog_types";
import { installPointerEventShims } from "@/web/ui/testing/pointer_events";

/** Rendered text, ignoring the formatting whitespace in templates. */
function text(el: Element | null | undefined): string | undefined {
  return el?.textContent?.replace(/\s+/g, " ").trim();
}

installPointerEventShims();

// fake-indexeddb clones rows with structuredClone; rows here are plain JSON.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>De Fide</title></titleStmt>
    <sourceDesc><biblStruct><monogr><author>Ambrosius</author></monogr></biblStruct></sourceDesc>
  </fileDesc></teiHeader>
  <text><body><div type="edition" n="urn:cts:latinLit:stoa0022.stoa002.opp-lat1">
    <pb n="529"/><p><milestone unit="PLSection" n="A"/>Regina Austri venit audire sapientiam.
      <milestone unit="PLSection" n="B"/>Tu quoque, sancte imperator.<note>Cf. 3 Reg. 10.</note></p>
    <pb n="530"/><p>Sed non ego Salomon.</p>
    <pb n="531"/><p>Neque tu unius regionis rex.</p>
  </div></body></text>
</TEI>`;

const PRIMARY = buildOpenTextFileUrls(
  FIXTURE_PL_SOURCE,
  FIXTURE_PL_ENTRY.files[0]
).primaryUrl;
const FALLBACK = buildOpenTextFileUrls(
  FIXTURE_PL_SOURCE,
  FIXTURE_PL_ENTRY.files[0]
).fallbackUrl;

function bytes(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer.slice(
    encoded.byteOffset,
    encoded.byteOffset + encoded.byteLength
  );
}

function response(status: number, body = ""): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(bytes(body)),
  } as unknown as Response;
}

/** A fetch that answers from `routes` (url → status/body) and logs calls. */
function fakeFetch(routes: Record<string, [number, string] | Error>) {
  const calls: string[] = [];
  const fn = jest.fn((url: string) => {
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return Promise.resolve(response(404));
    if (route instanceof Error) return Promise.reject(route);
    return Promise.resolve(response(route[0], route[1]));
  });
  return { fn, calls };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(check()).toBe(true);
}

describe("fetchOpenTextFile", () => {
  it("uses the pinned raw GitHub URL when it answers", async () => {
    const { fn, calls } = fakeFetch({ [PRIMARY]: [200, "xml"] });
    const file = await fetchOpenTextFile(
      FIXTURE_PL_SOURCE,
      FIXTURE_PL_ENTRY.files[0],
      fn
    );
    expect(calls).toEqual([PRIMARY]);
    expect(new TextDecoder().decode(file.bytes)).toBe("xml");
    expect(PRIMARY).toBe(
      `https://raw.githubusercontent.com/${FIXTURE_PL_SOURCE.repo}/${FIXTURE_PL_SOURCE.commit}/${FIXTURE_PL_ENTRY.files[0]}`
    );
  });

  it("falls back to jsDelivr on a non-2xx answer", async () => {
    const { fn, calls } = fakeFetch({
      [PRIMARY]: [503, ""],
      [FALLBACK]: [200, "mirror"],
    });
    const file = await fetchOpenTextFile(
      FIXTURE_PL_SOURCE,
      FIXTURE_PL_ENTRY.files[0],
      fn
    );
    expect(calls).toEqual([PRIMARY, FALLBACK]);
    expect(FALLBACK).toContain("https://cdn.jsdelivr.net/gh/");
    expect(new TextDecoder().decode(file.bytes)).toBe("mirror");
  });

  it("falls back to jsDelivr when the primary request fails", async () => {
    const { fn, calls } = fakeFetch({
      [PRIMARY]: new TypeError("Failed to fetch"),
      [FALLBACK]: [200, "mirror"],
    });
    await fetchOpenTextFile(FIXTURE_PL_SOURCE, FIXTURE_PL_ENTRY.files[0], fn);
    expect(calls).toEqual([PRIMARY, FALLBACK]);
  });

  it("fails when both sources fail, and never retries an abort", async () => {
    const { fn } = fakeFetch({});
    await expect(
      fetchOpenTextFile(FIXTURE_PL_SOURCE, FIXTURE_PL_ENTRY.files[0], fn)
    ).rejects.toThrow("HTTP 404");

    const abort = new Error("aborted");
    abort.name = "AbortError";
    const aborting = fakeFetch({ [PRIMARY]: abort });
    await expect(
      fetchOpenTextFile(
        FIXTURE_PL_SOURCE,
        FIXTURE_PL_ENTRY.files[0],
        aborting.fn
      )
    ).rejects.toBe(abort);
    expect(aborting.calls).toEqual([PRIMARY]);
  });
});

describe("loadOpenTextDocument", () => {
  it("fetches, parses and caches on a miss, then serves the cache", async () => {
    const store = new OpenTextStore({ factory: null });
    const { fn, calls } = fakeFetch({ [PRIMARY]: [200, TEI] });

    const first = await loadOpenTextDocument(
      FIXTURE_PL_ENTRY,
      FIXTURE_PL_SOURCE,
      { store, fetchFn: fn }
    );
    expect(first.pages.map((p) => p.id)).toEqual(["529", "530", "531"]);
    expect(
      await store.getDocument(
        openTextCacheKey(FIXTURE_PL_ENTRY.id, FIXTURE_PL_SOURCE.commit)
      )
    ).toBe(first);

    const second = await loadOpenTextDocument(
      FIXTURE_PL_ENTRY,
      FIXTURE_PL_SOURCE,
      { store, fetchFn: fn }
    );
    expect(second).toBe(first);
    expect(calls).toEqual([PRIMARY]);
  });

  it("hands every file's bytes to the entry format's parser", async () => {
    const store = new OpenTextStore({ factory: null });
    const { fn } = fakeFetch({
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius1.html`]: [200, "a"],
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius2.html`]: [200, "b"],
    });
    const seen: string[] = [];
    const parsed: OpenTextDocument = {
      title: "Apicius",
      pagination: "pageBreaks",
      pages: [{ id: "1", label: "Page 1", blocks: [], notes: [] }],
      warnings: [],
    };
    const doc = await loadOpenTextDocument(
      FIXTURE_LL_PARTIAL_ENTRY,
      FIXTURE_LL_SOURCE,
      {
        store,
        fetchFn: fn,
        parsers: {
          tei: () => {
            throw new Error("wrong parser");
          },
          thelatinlibrary_html: (files) => {
            for (const f of files) {
              seen.push(`${f.path}=${new TextDecoder().decode(f.bytes)}`);
            }
            return parsed;
          },
        },
      }
    );
    expect(doc).toBe(parsed);
    expect(seen).toEqual([
      "raw/apicius/apicius1.html=a",
      "raw/apicius/apicius2.html=b",
    ]);
  });

  it("decodes and parses multi-page Latin Library texts", async () => {
    const store = new OpenTextStore({ factory: null });
    const { fn } = fakeFetch({
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius1.html`]: [
        200,
        "<html><body><h1>LIBER I</h1><p>Prima pagina.</p></body></html>",
      ],
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius2.html`]: [
        200,
        "<html><body><h1>LIBER II</h1><p>Secunda pagina.</p></body></html>",
      ],
    });
    const doc = await loadOpenTextDocument(
      FIXTURE_LL_PARTIAL_ENTRY,
      FIXTURE_LL_SOURCE,
      { store, fetchFn: fn }
    );
    expect(doc.pagination).toBe("pageBreaks");
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0].label).toBe("LIBER I");
    expect(doc.pages[1].label).toBe("LIBER II");
  });
});

describe("parseTeiFiles", () => {
  it("joins several files into one document with unique page ids", () => {
    const doc = parseTeiFiles([
      { path: "a.xml", bytes: bytes(TEI) },
      { path: "b.xml", bytes: bytes(TEI) },
    ]);
    expect(doc.pages.map((p) => p.id)).toEqual([
      "529",
      "530",
      "531",
      "2-529",
      "2-530",
      "2-531",
    ]);
  });
});

describe("parseOpenTextReaderPayload", () => {
  it("reads the server's payload and rejects malformed ones", () => {
    const payload = {
      entry: FIXTURE_PL_ENTRY,
      sourceMeta: FIXTURE_PL_SOURCE,
      backHref: "/opentexts",
    };
    expect(parseOpenTextReaderPayload(JSON.stringify(payload))).toEqual(
      payload
    );
    expect(parseOpenTextReaderPayload("{")).toBeNull();
    expect(parseOpenTextReaderPayload("[]")).toBeNull();
    expect(
      parseOpenTextReaderPayload(JSON.stringify({ entry: {} }))
    ).toBeNull();
    expect(parseOpenTextReaderPayload(undefined)).toBeNull();
  });
});

describe("<morcus-open-text-reader>", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.history.replaceState(
      null,
      "",
      `/opentexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}`
    );
  });

  afterEach(() => {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
  });

  function useFetch(routes: Record<string, [number, string] | Error>) {
    const fake = fakeFetch(routes);
    globalThis.fetch = fake.fn as unknown as typeof fetch;
    return fake;
  }

  function mount(
    entry = FIXTURE_PL_ENTRY,
    sourceMeta = FIXTURE_PL_SOURCE,
    initialSection?: string
  ): MorcusOpenTextReader {
    const holder = document.createElement("main");
    holder.innerHTML = renderOpenTextReaderHostHtml({
      entry,
      sourceMeta,
      initialSection,
      backHref: "/opentexts",
    });
    document.body.appendChild(holder);
    const reader = holder.querySelector("morcus-open-text-reader");
    if (!(reader instanceof MorcusOpenTextReader)) {
      throw new Error("reader did not upgrade");
    }
    return reader;
  }

  function role(reader: Element, name: string): HTMLElement {
    const el = reader.querySelector<HTMLElement>(`[data-role="${name}"]`);
    if (!el) throw new Error(`missing ${name}`);
    return el;
  }

  function heading(reader: Element): string | null | undefined {
    return text(reader.querySelector("h1.reader-passage-heading"));
  }

  it("fetches, parses and renders the work in a tokenized reader view", async () => {
    const { calls } = useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    expect(role(reader, "open-text-loading").hidden).toBe(false);
    await reader.ready;

    expect(calls).toEqual([PRIMARY]);
    expect(role(reader, "open-text-loading").hidden).toBe(true);
    expect(role(reader, "open-text-error").hidden).toBe(true);
    const mountEl = role(reader, "open-text-mount");
    expect(mountEl.hidden).toBe(false);
    const view = mountEl.querySelector("morcus-reader-view");
    expect(view?.hasAttribute("data-upgraded")).toBe(true);
    expect(heading(reader)).toBe("col. 529");
    // The reader view tokenized the passage for dictionary lookup.
    const words = Array.from(
      reader.querySelectorAll("#reader-passage .lat-word"),
      (w) => text(w)
    );
    expect(words).toContain("Regina");
    expect(words).toContain("Reg"); // Note text is tokenized too.
    expect(reader.querySelector("#sec-529A")).not.toBeNull();
    // The URL names the page shown.
    expect(new URLSearchParams(window.location.search).get("page")).toBe("529");
  });

  it("turns pages in place, updating the URL and the reading position", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;

    const next = reader.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="open-text-next"]'
    );
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    next?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(heading(reader)).toBe("col. 530");
    expect(reader.querySelector("#reader-passage")?.textContent).toContain(
      "Sed non ego Salomon."
    );
    expect(
      reader.querySelectorAll("#reader-passage .lat-word").length
    ).toBeGreaterThan(0);
    expect(new URLSearchParams(window.location.search).get("page")).toBe("530");

    // The contents dialog jumps too: its button opens it, and choosing a
    // page closes it and turns to that page in place.
    const tocBtn = reader.querySelector<HTMLAnchorElement>("#reader-toc-btn");
    const drawer =
      reader.querySelector<HTMLDialogElement>("#reader-toc-drawer");
    if (!tocBtn || !drawer) throw new Error("no contents");
    tocBtn.click();
    expect(drawer.open).toBe(true);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("true");
    const item = drawer.querySelector<HTMLAnchorElement>(
      'a.reader-toc-item[data-page-id="531"]'
    );
    const tocClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    item?.dispatchEvent(tocClick);
    expect(tocClick.defaultPrevented).toBe(true);
    expect(drawer.open).toBe(false);
    expect(heading(reader)).toBe("col. 531");
    expect(text(tocBtn.querySelector(".jump-val"))).toBe("col. 531");
    expect(new URLSearchParams(window.location.search).get("page")).toBe("531");
    // The contents now mark the new page as current.
    expect(
      Array.from(
        drawer.querySelectorAll<HTMLElement>(".reader-toc-item[aria-current]"),
        (el) => el.dataset.pageId
      )
    ).toEqual(["531"]);
    expect(item?.classList.contains("active")).toBe(true);

    // Back goes to the previous page.
    window.history.replaceState(
      null,
      "",
      `/opentexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}&page=530`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(heading(reader)).toBe("col. 530");
    expect(
      drawer.querySelector<HTMLElement>(".reader-toc-item.active")?.dataset
        .pageId
    ).toBe("530");

    await until(() => true);
    const position = await new OpenTextStore().getPosition(FIXTURE_PL_ENTRY.id);
    expect(position?.pageId).toBe("530");
  });

  it("enhances the contents dialog after the async render", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;

    // The reader view connected with the frame already in place, so its
    // contents controller found the dialog and its button.
    const tocBtn = reader.querySelector<HTMLAnchorElement>("#reader-toc-btn");
    const drawer =
      reader.querySelector<HTMLDialogElement>("#reader-toc-drawer");
    const search = reader.querySelector<HTMLInputElement>(
      "#reader-toc-search-input"
    );
    if (!tocBtn || !drawer || !search) throw new Error("no contents");
    const open = new MouseEvent("click", { bubbles: true, cancelable: true });
    tocBtn.dispatchEvent(open);
    expect(open.defaultPrevented).toBe(true);
    expect(drawer.open).toBe(true);

    // Typing filters the pages by id.
    search.value = "530";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = Array.from(
      drawer.querySelectorAll<HTMLElement>(".reader-toc-item"),
      (el) => (el.hidden ? null : el.dataset.pageId)
    ).filter((id) => id !== null);
    expect(visible).toEqual(["530"]);

    // Enter opens the one match, turning the page in place.
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(drawer.open).toBe(false);
    expect(heading(reader)).toBe("col. 530");

    // The dialog still works after a page turn: its button and the `t`
    // shortcut open it, and its close button closes it.
    tocBtn.click();
    expect(drawer.open).toBe(true);
    // Filtering was reset on close.
    expect(search.value).toBe("");
    drawer.querySelector<HTMLElement>("#reader-toc-close-btn")?.click();
    expect(drawer.open).toBe(false);
    // (Typed into a text box, `t` is just a letter.)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    expect(drawer.open).toBe(true);
  });

  it("reopens from the cache at the last page read, without the network", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const first = mount();
    await first.ready;
    first
      .querySelector<HTMLAnchorElement>(
        '.reader-continuation-card[data-role="open-text-next"]'
      )
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    expect(heading(first)).toBe("col. 530");
    // Let the position write settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    document.body.replaceChildren();

    window.history.replaceState(
      null,
      "",
      `/opentexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}`
    );
    const { calls } = useFetch({});
    const second = mount();
    await second.ready;
    expect(calls).toEqual([]);
    expect(heading(second)).toBe("col. 530");
    expect(new URLSearchParams(window.location.search).get("page")).toBe("530");
  });

  it("opens the page named in the URL, or the server's initial section", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    window.history.replaceState(
      null,
      "",
      `/opentexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}&page=531`
    );
    const fromUrl = mount();
    await fromUrl.ready;
    expect(heading(fromUrl)).toBe("col. 531");
    document.body.replaceChildren();

    window.history.replaceState(null, "", "/opentexts?open=x");
    const fromServer = mount(FIXTURE_PL_ENTRY, FIXTURE_PL_SOURCE, "530");
    await fromServer.ready;
    expect(heading(fromServer)).toBe("col. 530");
  });

  it("shows the error state when both sources fail, and retries", async () => {
    const failing = useFetch({});
    const reader = mount();
    await reader.ready;
    expect(failing.calls).toEqual([PRIMARY, FALLBACK]);
    expect(role(reader, "open-text-error").hidden).toBe(false);
    expect(role(reader, "open-text-loading").hidden).toBe(true);
    expect(role(reader, "open-text-mount").hidden).toBe(true);
    expect(role(reader, "open-text-error-message").textContent).toContain(
      "unreachable"
    );

    useFetch({ [FALLBACK]: [200, TEI] });
    role(reader, "open-text-retry").click();
    await reader.ready;
    expect(role(reader, "open-text-error").hidden).toBe(true);
    expect(heading(reader)).toBe("col. 529");
  });

  it("renders a multi-page Latin Library text and its partial-coverage notice", async () => {
    useFetch({
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius1.html`]: [
        200,
        "<html><body><h1>APICIVS LIBER I</h1><p>[1] Conditum paradoxum.</p></body></html>",
      ],
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius2.html`]: [
        200,
        "<html><body><h1>APICIVS LIBER II</h1><p>[1] Isicia omentata.</p></body></html>",
      ],
    });
    const reader = mount(FIXTURE_LL_PARTIAL_ENTRY, FIXTURE_LL_SOURCE);
    await reader.ready;
    expect(role(reader, "open-text-error").hidden).toBe(true);
    expect(text(role(reader, "open-text-mount"))).toContain(
      "Conditum paradoxum."
    );
  });

  it("stops quietly when disconnected mid-load", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    globalThis.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;
    const reader = mount();
    await until(() => (globalThis.fetch as jest.Mock).mock.calls.length > 0);
    const mountEl = role(reader, "open-text-mount");
    reader.remove();
    resolveFetch(response(200, TEI));
    await reader.ready;
    expect(mountEl.childElementCount).toBe(0);
  });
});

// Typing check: the default fetch matches `FetchLike`.
const _fetchLike: FetchLike = (url, init) => fetch(url, init);
void _fetchLike;
