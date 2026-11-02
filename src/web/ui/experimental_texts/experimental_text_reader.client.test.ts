/**
 * @jest-environment jsdom
 */

// Mounts the server-rendered Experimental Texts reader host with the real client
// elements, backed by an in-memory IndexedDB and a fake network.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

// On the page, `reader.js` (which external.js depends on) defines the view.
import "@/web/ui/reader/reader_view.client";
import type { ExperimentalTextDocument } from "@/common/experimental_texts/experimental_text_document";
import {
  MorcusExperimentalTextReader,
  fetchExperimentalTextFile,
  loadExperimentalTextDocument,
  parseExperimentalTextReaderPayload,
  parseTeiFiles,
  type FetchLike,
} from "@/web/ui/experimental_texts/experimental_text_reader.client";
import {
  ExperimentalTextStore,
  experimentalTextCacheKey,
} from "@/web/ui/experimental_texts/experimental_text_storage.client";
import {
  FIXTURE_LL_PARTIAL_ENTRY,
  FIXTURE_LL_SOURCE,
  FIXTURE_PL_ENTRY,
  FIXTURE_PL_SOURCE,
} from "@/web/ui/experimental_texts/experimental_texts_reader_fixtures";
import { renderExperimentalTextReaderHostHtml } from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import { buildExperimentalTextFileUrls } from "@/common/experimental_texts/catalog_types";
import { installPointerEventShims } from "@/web/ui/testing/pointer_events";
import { setupAnchorScroll } from "@/web/ui/core/nav/anchor_scroll.client";

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

const PRIMARY = buildExperimentalTextFileUrls(
  FIXTURE_PL_SOURCE,
  FIXTURE_PL_ENTRY.files[0]
).primaryUrl;
const FALLBACK = buildExperimentalTextFileUrls(
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

describe("fetchExperimentalTextFile", () => {
  it("uses the pinned raw GitHub URL when it answers", async () => {
    const { fn, calls } = fakeFetch({ [PRIMARY]: [200, "xml"] });
    const file = await fetchExperimentalTextFile(
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
    const file = await fetchExperimentalTextFile(
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
    await fetchExperimentalTextFile(
      FIXTURE_PL_SOURCE,
      FIXTURE_PL_ENTRY.files[0],
      fn
    );
    expect(calls).toEqual([PRIMARY, FALLBACK]);
  });

  it("fails when both sources fail", async () => {
    const { fn } = fakeFetch({});
    await expect(
      fetchExperimentalTextFile(
        FIXTURE_PL_SOURCE,
        FIXTURE_PL_ENTRY.files[0],
        fn
      )
    ).rejects.toThrow("HTTP 404");
  });

  /** A fetch whose primary URL hangs until its signal aborts. */
  function hangingPrimary() {
    const calls: string[] = [];
    const fn = jest.fn((url: string, init?: RequestInit) => {
      calls.push(url);
      if (url !== PRIMARY) return Promise.resolve(response(200, "mirror"));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    return { fn, calls };
  }

  it("falls back to jsDelivr when the primary times out", async () => {
    const { fn, calls } = hangingPrimary();
    const file = await fetchExperimentalTextFile(
      FIXTURE_PL_SOURCE,
      FIXTURE_PL_ENTRY.files[0],
      fn,
      undefined,
      20
    );
    expect(calls).toEqual([PRIMARY, FALLBACK]);
    expect(new TextDecoder().decode(file.bytes)).toBe("mirror");
  });

  it("stops without trying the mirror once the load is aborted", async () => {
    const { fn, calls } = hangingPrimary();
    const controller = new AbortController();
    const result = fetchExperimentalTextFile(
      FIXTURE_PL_SOURCE,
      FIXTURE_PL_ENTRY.files[0],
      fn,
      controller.signal
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual([PRIMARY]);
  });
});

describe("loadExperimentalTextDocument", () => {
  it("fetches, parses and caches on a miss, then serves the cache", async () => {
    const store = new ExperimentalTextStore({ factory: null });
    const { fn, calls } = fakeFetch({ [PRIMARY]: [200, TEI] });

    const first = await loadExperimentalTextDocument(
      FIXTURE_PL_ENTRY,
      FIXTURE_PL_SOURCE,
      { store, fetchFn: fn }
    );
    expect(first.pages.map((p) => p.id)).toEqual(["529", "530", "531"]);
    expect(
      await store.getDocument(
        experimentalTextCacheKey(FIXTURE_PL_ENTRY.id, FIXTURE_PL_SOURCE.commit)
      )
    ).toBe(first);

    const second = await loadExperimentalTextDocument(
      FIXTURE_PL_ENTRY,
      FIXTURE_PL_SOURCE,
      { store, fetchFn: fn }
    );
    expect(second).toBe(first);
    expect(calls).toEqual([PRIMARY]);
  });

  it("hands every file's bytes to the entry format's parser", async () => {
    const store = new ExperimentalTextStore({ factory: null });
    const { fn } = fakeFetch({
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius1.html`]: [200, "a"],
      [`${FIXTURE_LL_SOURCE.rawBaseUrl}raw/apicius/apicius2.html`]: [200, "b"],
    });
    const seen: string[] = [];
    const parsed: ExperimentalTextDocument = {
      title: "Apicius",
      pagination: "pageBreaks",
      pages: [{ id: "1", label: "Page 1", blocks: [], notes: [] }],
      warnings: [],
    };
    const doc = await loadExperimentalTextDocument(
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
    const store = new ExperimentalTextStore({ factory: null });
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
    const doc = await loadExperimentalTextDocument(
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

describe("parseExperimentalTextReaderPayload", () => {
  it("reads the server's payload and rejects malformed ones", () => {
    const payload = {
      entry: FIXTURE_PL_ENTRY,
      sourceMeta: FIXTURE_PL_SOURCE,
      backHref: "/experimentalTexts",
    };
    expect(parseExperimentalTextReaderPayload(JSON.stringify(payload))).toEqual(
      payload
    );
    expect(parseExperimentalTextReaderPayload("{")).toBeNull();
    expect(parseExperimentalTextReaderPayload("[]")).toBeNull();
    expect(
      parseExperimentalTextReaderPayload(JSON.stringify({ entry: {} }))
    ).toBeNull();
    expect(parseExperimentalTextReaderPayload(undefined)).toBeNull();
  });
});

describe("<morcus-experimental-text-reader>", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.history.replaceState(
      null,
      "",
      `/experimentalTexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}`
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
  ): MorcusExperimentalTextReader {
    const holder = document.createElement("main");
    holder.innerHTML = renderExperimentalTextReaderHostHtml({
      entry,
      sourceMeta,
      initialSection,
      backHref: "/experimentalTexts",
    });
    document.body.appendChild(holder);
    const reader = holder.querySelector("morcus-experimental-text-reader");
    if (!(reader instanceof MorcusExperimentalTextReader)) {
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
    expect(role(reader, "experimental-text-loading").hidden).toBe(false);
    await reader.ready;

    expect(calls).toEqual([PRIMARY]);
    expect(role(reader, "experimental-text-loading").hidden).toBe(true);
    expect(role(reader, "experimental-text-error").hidden).toBe(true);
    const mountEl = role(reader, "experimental-text-mount");
    expect(mountEl.hidden).toBe(false);
    const view = mountEl.querySelector("morcus-reader-view");
    expect(view?.hasAttribute("data-upgraded")).toBe(true);
    expect(heading(reader)).toBe("529");
    // The reader view tokenized the passage for dictionary lookup.
    const words = Array.from(
      reader.querySelectorAll("#reader-passage .lat-word"),
      (w) => text(w)
    );
    expect(words).toContain("Regina");
    expect(reader.querySelector("#sec-529A")).not.toBeNull();
    // The page's note is in the companion panel's Notes tab, not the passage.
    expect(reader.querySelector("#reader-passage .reader-note")).toBeNull();
    expect(
      text(reader.querySelector("#panel-view-notes #note-1 .reader-note-body"))
    ).toBe("Cf. 3 Reg. 10.");
    expect(reader.querySelector<HTMLElement>("#panel-tab-notes")?.hidden).toBe(
      false
    );
    // The URL names the page shown.
    expect(new URLSearchParams(window.location.search).get("page")).toBe("529");
    // The header has a single "Experimental · About this text" line; the
    // collection, volume and source link are in the About panel.
    const header = reader.querySelector(".reader-text-card-header");
    const attribution = header?.querySelectorAll("p.reader-header-attribution");
    expect(attribution).toHaveLength(1);
    expect(text(attribution?.[0])).toBe("Experimental · About this text ⓘ");
    expect(header?.textContent).not.toContain("Patrologia Latina");
    expect(header?.textContent).not.toContain("View source");
    const about = reader.querySelector("#panel-view-about");
    expect(about?.textContent).toContain("Patrologia Latina");
    expect(about?.textContent).toContain("PL 16");
    expect(
      Array.from(about?.querySelectorAll("a") ?? [], (a) => text(a))
    ).toContain("View source");
  });

  it("turns pages in place, updating the URL and the reading position", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;

    const next = reader.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="experimental-text-next"]'
    );
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    next?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(heading(reader)).toBe("530");
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
    expect(heading(reader)).toBe("531");
    expect(text(tocBtn.querySelector(".jump-val"))).toBe("531");
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
      `/experimentalTexts?open=${encodeURIComponent(
        FIXTURE_PL_ENTRY.id
      )}&page=530`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(heading(reader)).toBe("530");
    expect(
      drawer.querySelector<HTMLElement>(".reader-toc-item.active")?.dataset
        .pageId
    ).toBe("530");

    await until(() => true);
    const position = await new ExperimentalTextStore().getPosition(
      FIXTURE_PL_ENTRY.id
    );
    expect(position?.pageId).toBe("530");
  });

  it("turns pages with a horizontal swipe on the text panel", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;
    const panel = reader.querySelector<HTMLElement>(".reader-text-panel");
    if (!panel) throw new Error("no text panel");

    function touch(type: string, points: Array<[number, number]>) {
      const e = new Event(type, { bubbles: true });
      Object.defineProperty(e, "touches", {
        value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      });
      panel?.dispatchEvent(e);
    }
    // A single-finger drag from the middle of the (1024px) jsdom viewport,
    // past the commit distance (20% of min(1024, 768)).
    async function swipe(dx: number) {
      touch("touchstart", [[500, 300]]);
      touch("touchmove", [[500 + dx / 2, 302]]);
      touch("touchmove", [[500 + dx, 304]]);
      touch("touchend", []);
      // New swipes are ignored until the slide settles.
      await until(() => panel?.dataset.swipe === undefined);
    }

    // At the first page, a swipe right has nothing to turn to.
    await swipe(200);
    expect(heading(reader)).toBe("529");

    // Swiping left turns to the next page, in place and in history.
    await swipe(-200);
    expect(heading(reader)).toBe("530");
    expect(reader.querySelector("#reader-passage")?.textContent).toContain(
      "Sed non ego Salomon."
    );
    expect(new URLSearchParams(window.location.search).get("page")).toBe("530");

    await swipe(-200);
    expect(heading(reader)).toBe("531");
    // At the last page, a swipe left does nothing.
    await swipe(-200);
    expect(heading(reader)).toBe("531");

    // Swiping right goes back a page.
    await swipe(200);
    expect(heading(reader)).toBe("530");
    expect(new URLSearchParams(window.location.search).get("page")).toBe("530");

    // A short drag springs back without turning.
    await swipe(-40);
    expect(heading(reader)).toBe("530");
  });

  it("turns pages with the [ and ] shortcuts", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;
    const press = (key: string) =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );

    press("[");
    expect(heading(reader)).toBe("529");
    press("]");
    expect(heading(reader)).toBe("530");
    press("[");
    expect(heading(reader)).toBe("529");
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
    expect(heading(reader)).toBe("530");

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

  it("opens the reader settings from the Aa button and applies them", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;

    const btn = reader.querySelector<HTMLButtonElement>(
      ".reader-sticky-bar #reader-settings-btn"
    );
    const dialog = reader.querySelector<HTMLDialogElement>(
      "morcus-reader-view #reader-settings-popover"
    );
    if (!btn || !dialog) throw new Error("no reader settings");
    expect(
      dialog.closest("morcus-reader-settings")?.hasAttribute("data-upgraded")
    ).toBe(true);
    btn.click();
    expect(dialog.open).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    // The settings reach the reader view: hiding the section numbers.
    const gutter = dialog.querySelector<HTMLInputElement>("#toggle-gutter");
    if (!gutter) throw new Error("no gutter toggle");
    expect(gutter.checked).toBe(true);
    gutter.checked = false;
    gutter.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      document.documentElement.hasAttribute("data-reader-hide-gutter")
    ).toBe(true);
    gutter.checked = true;
    gutter.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      document.documentElement.hasAttribute("data-reader-hide-gutter")
    ).toBe(false);

    dialog.querySelector<HTMLElement>("#reader-settings-close-btn")?.click();
    expect(dialog.open).toBe(false);
  });

  it("copies the heading's permalink, which follows page turns", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;

    reader
      .querySelector<HTMLAnchorElement>(
        '.reader-sticky-bar [data-role="experimental-text-next"]'
      )
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    const link = reader.querySelector<HTMLAnchorElement>(
      "h1.reader-passage-heading a.reader-heading-link"
    );
    if (!link) throw new Error("no heading link");
    expect(text(link)).toBe("530");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(click.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      new URL(link.getAttribute("href") ?? "", window.location.href).href
    );
    expect(new URL(link.href).searchParams.get("page")).toBe("530");
  });

  it("shows notes in the Notes tab, following page turns", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;
    // On the page, `common.js` handles in-page links once components are up.
    const stopAnchors = setupAnchorScroll();

    const tab = reader.querySelector<HTMLElement>("#panel-tab-notes");
    const notesView = reader.querySelector<HTMLElement>("#panel-view-notes");
    if (!tab || !notesView) throw new Error("no notes tab");
    expect(tab.hidden).toBe(false);
    expect(tab.getAttribute("role")).toBe("tab");
    expect(tab.getAttribute("aria-selected")).toBe("false");
    // The tab is the way in: the header has no separate "N notes" link.
    expect(
      reader.querySelector(
        '.reader-text-card-header a[href="#panel-view-notes"]'
      )
    ).toBeNull();

    // The Notes tab opens the notes view.
    tab.click();
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(notesView.classList.contains("active")).toBe(true);

    // A `#note-1` link reveals the note in the tab.
    const view = reader.querySelector("morcus-reader-view");
    view?.querySelector<HTMLElement>("#panel-tab-dict")?.click();
    expect(tab.getAttribute("aria-selected")).toBe("false");
    const noteLink = document.createElement("a");
    noteLink.href = "#note-1";
    reader.querySelector(".reader-text-card-header")?.appendChild(noteLink);
    noteLink.click();
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(
      notesView.querySelector("#note-1")?.classList.contains("note-active")
    ).toBe(true);
    noteLink.remove();

    // A page without notes hides the tab and falls back to the dictionary.
    const next = reader.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="experimental-text-next"]'
    );
    next?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(heading(reader)).toBe("530");
    expect(tab.hidden).toBe(true);
    expect(notesView.querySelector(".reader-note")).toBeNull();
    expect(
      reader.querySelector("#panel-tab-dict")?.getAttribute("aria-selected")
    ).toBe("true");

    // Back on a page with notes, the tab comes back.
    window.history.replaceState(
      null,
      "",
      `/experimentalTexts?open=${encodeURIComponent(
        FIXTURE_PL_ENTRY.id
      )}&page=529`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(heading(reader)).toBe("529");
    expect(tab.hidden).toBe(false);
    expect(notesView.querySelectorAll(".reader-note")).toHaveLength(1);
    stopAnchors();
  });

  it("reopens from the cache at the last page read, without the network", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    const first = mount();
    await first.ready;
    first
      .querySelector<HTMLAnchorElement>(
        '.reader-continuation-card[data-role="experimental-text-next"]'
      )
      ?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    expect(heading(first)).toBe("530");
    // Let the position write settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    document.body.replaceChildren();

    window.history.replaceState(
      null,
      "",
      `/experimentalTexts?open=${encodeURIComponent(FIXTURE_PL_ENTRY.id)}`
    );
    const { calls } = useFetch({});
    const second = mount();
    await second.ready;
    expect(calls).toEqual([]);
    expect(heading(second)).toBe("530");
    expect(new URLSearchParams(window.location.search).get("page")).toBe("530");
  });

  it("opens the page named in the URL, or the server's initial section", async () => {
    useFetch({ [PRIMARY]: [200, TEI] });
    window.history.replaceState(
      null,
      "",
      `/experimentalTexts?open=${encodeURIComponent(
        FIXTURE_PL_ENTRY.id
      )}&page=531`
    );
    const fromUrl = mount();
    await fromUrl.ready;
    expect(heading(fromUrl)).toBe("531");
    document.body.replaceChildren();

    window.history.replaceState(null, "", "/experimentalTexts?open=x");
    const fromServer = mount(FIXTURE_PL_ENTRY, FIXTURE_PL_SOURCE, "530");
    await fromServer.ready;
    expect(heading(fromServer)).toBe("530");
  });

  it("shows the error state when both sources fail, and retries", async () => {
    const failing = useFetch({});
    const reader = mount();
    await reader.ready;
    expect(failing.calls).toEqual([PRIMARY, FALLBACK]);
    expect(role(reader, "experimental-text-error").hidden).toBe(false);
    expect(role(reader, "experimental-text-loading").hidden).toBe(true);
    expect(role(reader, "experimental-text-mount").hidden).toBe(true);
    expect(
      role(reader, "experimental-text-error-message").textContent
    ).toContain("unreachable");

    useFetch({ [FALLBACK]: [200, TEI] });
    role(reader, "experimental-text-retry").click();
    await reader.ready;
    expect(role(reader, "experimental-text-error").hidden).toBe(true);
    expect(heading(reader)).toBe("529");
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
    expect(role(reader, "experimental-text-error").hidden).toBe(true);
    expect(text(role(reader, "experimental-text-mount"))).toContain(
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
    const put = jest.spyOn(reader.store, "putDocument");
    await until(() => (globalThis.fetch as jest.Mock).mock.calls.length > 0);
    const mountEl = role(reader, "experimental-text-mount");
    reader.remove();
    resolveFetch(response(200, TEI));
    await reader.ready;
    expect(mountEl.childElementCount).toBe(0);
    // Nothing is parsed or stored after the disconnect, so the database the
    // element closed isn't reopened.
    expect(put).not.toHaveBeenCalled();
  });

  it("shows the error state and evicts a cached document that can't render", async () => {
    const key = experimentalTextCacheKey(
      FIXTURE_PL_ENTRY.id,
      FIXTURE_PL_SOURCE.commit
    );
    const seed = new ExperimentalTextStore();
    // Passes the stored-row check, but its block has no segments.
    const broken = {
      title: "Broken",
      pagination: "pageBreaks",
      pages: [
        { id: "1", label: "1", blocks: [{ kind: "paragraph" }], notes: [] },
      ],
      warnings: [],
    } as unknown as ExperimentalTextDocument;
    await seed.putDocument(FIXTURE_PL_ENTRY.id, key, broken);
    await seed.close();

    const { calls } = useFetch({ [PRIMARY]: [200, TEI] });
    const reader = mount();
    await reader.ready;
    expect(calls).toEqual([]);
    expect(role(reader, "experimental-text-error").hidden).toBe(false);
    expect(role(reader, "experimental-text-mount").hidden).toBe(true);
    await until(() => true);
    const check = new ExperimentalTextStore();
    expect(await check.getDocument(key)).toBeUndefined();
    await check.close();

    // Retry fetches a fresh copy.
    role(reader, "experimental-text-retry").click();
    await reader.ready;
    expect(calls).toEqual([PRIMARY]);
    expect(heading(reader)).toBe("529");
  });

  describe("permalinks and history", () => {
    const scrollIntoView = jest.fn();
    const scrollTo = jest.fn();
    const originalScrollTo = window.scrollTo;

    beforeEach(() => {
      scrollIntoView.mockClear();
      scrollTo.mockClear();
      Element.prototype.scrollIntoView = scrollIntoView;
      window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    });

    afterEach(() => {
      // @ts-expect-error jsdom has no scrollIntoView of its own.
      delete Element.prototype.scrollIntoView;
      window.scrollTo = originalScrollTo;
    });

    function pageUrl(page: string, hash = ""): string {
      return `/experimentalTexts?open=${encodeURIComponent(
        FIXTURE_PL_ENTRY.id
      )}&page=${page}${hash}`;
    }

    function scrolledTo(): (string | undefined)[] {
      return scrollIntoView.mock.instances.map(
        (el) => (el as unknown as Element).id
      );
    }

    function clickToc(reader: Element, pageId: string, hash: string): void {
      const item = reader.querySelector<HTMLAnchorElement>(
        `#reader-toc-drawer a.reader-toc-item[data-page-id="${pageId}"]`
      )!;
      item.setAttribute("href", `${item.getAttribute("href")}${hash}`);
      item.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    }

    it("scrolls to a #sec- permalink on first load", async () => {
      useFetch({ [PRIMARY]: [200, TEI] });
      window.history.replaceState(null, "", pageUrl("529", "#sec-529B"));
      const reader = mount();
      await reader.ready;
      expect(scrolledTo()).toEqual(["sec-529B"]);
      expect(window.location.hash).toBe("#sec-529B");
    });

    it("keeps the section of a contents jump to another page", async () => {
      useFetch({ [PRIMARY]: [200, TEI] });
      window.history.replaceState(null, "", pageUrl("530"));
      const reader = mount();
      await reader.ready;
      scrollTo.mockClear();

      clickToc(reader, "529", "#sec-529B");
      expect(heading(reader)).toBe("529");
      expect(window.location.search).toContain("page=529");
      expect(window.location.hash).toBe("#sec-529B");
      // The section is where the page opens, not its top.
      expect(scrollTo).not.toHaveBeenCalledWith(
        expect.objectContaining({ top: 0 })
      );
    });

    it("scrolls to a section on the page already shown", async () => {
      useFetch({ [PRIMARY]: [200, TEI] });
      window.history.replaceState(null, "", pageUrl("529"));
      const reader = mount();
      await reader.ready;
      const length = window.history.length;

      clickToc(reader, "529", "#sec-529B");
      expect(heading(reader)).toBe("529");
      expect(window.location.hash).toBe("#sec-529B");
      expect(window.history.length).toBe(length + 1);
      expect(scrolledTo()).toEqual(["sec-529B"]);
    });

    it("saves the scroll position for Back, and pushes a fresh state", async () => {
      useFetch({ [PRIMARY]: [200, TEI] });
      window.history.replaceState({ other: "kept" }, "", pageUrl("529"));
      const reader = mount();
      await reader.ready;
      const panel = reader.querySelector<HTMLElement>(".reader-text-panel")!;
      panel.scrollTop = 240;

      reader
        .querySelector<HTMLAnchorElement>(
          '.reader-sticky-bar [data-role="experimental-text-next"]'
        )
        ?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      expect(heading(reader)).toBe("530");
      // The new entry doesn't inherit the previous entry's state.
      expect(window.history.state).toBeNull();
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ top: 0 })
      );

      // Back: the URL and state are the saved entry's.
      window.history.replaceState(
        { other: "kept", experimentalTextScrollY: 240 },
        "",
        pageUrl("529")
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(heading(reader)).toBe("529");
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ top: 240 })
      );
      expect(panel.scrollTop).toBe(240);
    });

    it("records the scroll position in the entry it leaves", async () => {
      useFetch({ [PRIMARY]: [200, TEI] });
      window.history.replaceState({ other: "kept" }, "", pageUrl("529"));
      const reader = mount();
      await reader.ready;
      reader.querySelector<HTMLElement>(".reader-text-panel")!.scrollTop = 99;
      const replace = jest.spyOn(window.history, "replaceState");

      reader
        .querySelector<HTMLAnchorElement>(
          '.reader-sticky-bar [data-role="experimental-text-next"]'
        )
        ?.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      expect(replace).toHaveBeenCalledWith(
        { other: "kept", experimentalTextScrollY: 99 },
        "",
        expect.stringContaining("page=529")
      );
      replace.mockRestore();
    });
  });
});

// Typing check: the default fetch matches `FetchLike`.
const _fetchLike: FetchLike = (url, init) => fetch(url, init);
void _fetchLike;
