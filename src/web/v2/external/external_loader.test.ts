/**
 * @jest-environment jsdom
 */

// Mounts the server-rendered External Reader pages with the real client
// elements, backed by an in-memory IndexedDB.

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  MorcusExternalLoader,
  passageText,
  savedItemHref,
} from "@/web/v2/external/external_loader.client";
import {
  renderExternalLandingContentHtml,
  renderExternalLocalContentHtml,
  renderExternalReaderContentHtml,
} from "@/web/v2/external/external.server";
import { ExternalContentStore } from "@/web/v2/external/external_storage.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

// jsdom lacks structuredClone, which fake-indexeddb uses. Rows are plain JSON.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

const PROSE =
  "Gallia est omnis divisa in partes tres.\n\nQuarum unam incolunt Belgae.";
const VERSE =
  "Arma virumque cano, Troiae qui primus ab oris\nItaliam, fato profugus";

function mount(markup: string): MorcusExternalLoader {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  document.body.appendChild(holder);
  const loader = holder.querySelector("morcus-external-loader");
  if (!(loader instanceof MorcusExternalLoader)) {
    throw new Error("loader did not upgrade");
  }
  return loader;
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(check()).toBe(true);
}

/** A second handle on the same (global) database, to seed and inspect it. */
let clock = 1_000_000;
async function withStore<T>(
  fn: (store: ExternalContentStore) => Promise<T>
): Promise<T> {
  // A ticking clock keeps "newest first" deterministic.
  const store = new ExternalContentStore({ now: () => ++clock });
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("<morcus-external-loader>", () => {
  beforeEach(() => {
    // A fresh database per test; stores read the global on construction.
    globalThis.indexedDB = new IDBFactory();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  describe("landing", () => {
    test("saves pasted text on this device and opens it", async () => {
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;
      const navigate = jest.fn();
      loader.navigate = navigate;

      const text = loader.querySelector<HTMLTextAreaElement>("#external-text")!;
      text.value = `  ${VERSE}`;
      loader.querySelector<HTMLInputElement>('input[value="verse"]')!.checked =
        true;
      submit(loader.querySelector<HTMLFormElement>("#external-paste-form")!);

      await until(() => navigate.mock.calls.length > 0);
      const target = new URL(navigate.mock.calls[0][0], "https://x");
      expect(target.pathname).toBe("/v2/externalReader");
      expect(target.searchParams.get("lines")).toBe("verse");
      const key = target.searchParams.get("local")!;

      const saved = await withStore((store) => store.get(key));
      // Untrimmed (verse indents survive); titled from the first words.
      expect(saved?.content).toBe(`  ${VERSE}`);
      expect(saved?.title).toMatch(/^Arma virumque cano/);
      expect(saved?.lineMode).toBe("verse");
    });

    test("uses the given title", async () => {
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;
      const navigate = jest.fn();
      loader.navigate = navigate;

      loader.querySelector<HTMLInputElement>("#external-title")!.value =
        "Aeneid I";
      loader.querySelector<HTMLTextAreaElement>("#external-text")!.value =
        VERSE;
      submit(loader.querySelector<HTMLFormElement>("#external-paste-form")!);

      await until(() => navigate.mock.calls.length > 0);
      const list = await withStore((store) => store.list());
      expect(list.map((item) => item.title)).toEqual(["Aeneid I"]);
    });

    test("refuses an empty paste with a message", async () => {
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;
      const navigate = jest.fn();
      loader.navigate = navigate;

      loader.querySelector<HTMLTextAreaElement>("#external-text")!.value =
        "   \n ";
      submit(loader.querySelector<HTMLFormElement>("#external-paste-form")!);

      const error = loader.querySelector<HTMLElement>("#external-paste-error")!;
      await until(() => !error.hidden);
      expect(error.textContent).toContain("Paste some text");
      expect(navigate).not.toHaveBeenCalled();
    });

    test("lists saved texts, newest first, and deletes them", async () => {
      await withStore(async (store) => {
        await store.save({
          title: "Pasted",
          content: PROSE,
          lineMode: "prose",
        });
        await store.save({
          title: "https://example.com/a.html",
          content: PROSE,
          source: "fromUrl",
        });
      });
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;

      const links = () =>
        Array.from(
          loader.querySelectorAll<HTMLAnchorElement>(".external-saved-link")
        );
      expect(links().map((a) => a.textContent)).toEqual([
        "example.com/a.html",
        "Pasted",
      ]);
      expect(links()[0].getAttribute("href")).toBe(
        "/v2/externalReader?url=https%3A%2F%2Fexample.com%2Fa.html"
      );
      expect(links()[1].getAttribute("href")).toMatch(
        /^\/v2\/externalReader\?local=[^&]+&lines=prose$/
      );
      expect(
        loader.querySelector<HTMLElement>("#external-saved-empty")!.hidden
      ).toBe(true);

      const confirmDelete = jest.fn(() => true);
      loader.confirmDelete = confirmDelete;
      loader.querySelector<HTMLButtonElement>('[data-label="Pasted"]')!.click();

      await until(() => links().length === 1);
      expect(confirmDelete).toHaveBeenCalledWith("Pasted");
      const left = await withStore((store) => store.list());
      expect(left.map((item) => item.source)).toEqual(["fromUrl"]);
    });

    test("keeps a text when the delete is not confirmed", async () => {
      await withStore((store) => store.save({ title: "Keep", content: PROSE }));
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;
      loader.confirmDelete = () => false;

      loader
        .querySelector<HTMLButtonElement>(".external-saved-delete")!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(loader.querySelectorAll(".external-saved-item")).toHaveLength(1);
      expect(await withStore((store) => store.list())).toHaveLength(1);
    });

    test("shows the empty state with nothing saved", async () => {
      const loader = mount(renderExternalLandingContentHtml());
      await loader.ready;
      expect(loader.querySelectorAll(".external-saved-item")).toHaveLength(0);
      expect(
        loader.querySelector<HTMLElement>("#external-saved-empty")!.hidden
      ).toBe(false);
    });
  });

  describe("?local=", () => {
    test("renders the saved text into the reader, ready for lookups", async () => {
      const key = await withStore((store) =>
        store.save({ title: "Gallic War", content: PROSE, lineMode: "keep" })
      );
      const loader = mount(
        renderExternalLocalContentHtml({
          localKey: key,
          lines: "keep",
          query: "",
        })
      );
      await loader.ready;

      const view = loader.closest("morcus-reader-view")!;
      expect(view.querySelector(".reader-passage-heading")?.textContent).toBe(
        "Gallic War"
      );
      const words = Array.from(
        view.querySelectorAll("#reader-passage .lat-word[data-word]")
      ).map((el) => el.getAttribute("data-word"));
      expect(words).toContain("Gallia");
      expect(words).toContain("Belgae");
      expect(document.title).toContain("Gallic War");
    });

    test("remembers the line mode it was opened in", async () => {
      const key = await withStore((store) =>
        store.save({ title: "Aeneid", content: VERSE })
      );
      const loader = mount(
        renderExternalLocalContentHtml({
          localKey: key,
          lines: "verse",
          query: "",
        })
      );
      await loader.ready;

      expect(
        loader.closest("morcus-reader-view")!.querySelector(".section-verse")
      ).not.toBeNull();
      const saved = await withStore((store) => store.get(key));
      expect(saved?.lineMode).toBe("verse");
    });

    test("explains when the text is not saved in this browser", async () => {
      const loader = mount(
        renderExternalLocalContentHtml({
          localKey: "gone",
          lines: "keep",
          query: "",
        })
      );
      await loader.ready;

      const passage = document.getElementById("reader-passage")!;
      expect(passage.textContent).toContain("isn't saved in this browser");
      expect(
        passage.querySelector('a[href="/v2/externalReader"]')
      ).not.toBeNull();
    });
  });

  describe("?url=", () => {
    test("adds the import to the saved list, as V1 does", async () => {
      const loader = mount(
        renderExternalReaderContentHtml({
          sourceUrl: "https://example.com/bg.html",
          text: PROSE,
          lines: "keep",
          query: "",
        })
      );
      await loader.ready;

      const list = await withStore((store) => store.list());
      expect(list).toEqual([
        expect.objectContaining({
          storageKey: "https://example.com/bg.html",
          title: "https://example.com/bg.html",
          source: "fromUrl",
        }),
      ]);
      const saved = await withStore((store) =>
        store.get("https://example.com/bg.html")
      );
      expect(saved?.content).toBe(PROSE);
    });
  });
});

describe("passageText", () => {
  function rendered(text: string, lines: "keep" | "prose" | "verse") {
    const holder = document.createElement("div");
    holder.innerHTML = renderExternalReaderContentHtml({
      sourceUrl: "https://example.com/",
      text,
      lines,
      query: "",
    });
    return holder.querySelector("#reader-passage")!;
  }

  test("round-trips kept lines and paragraphs", () => {
    const text = "Quo usque tandem\nabutere, Catilina?\n\nQuam diu etiam.";
    expect(passageText(rendered(text, "keep"))).toBe(text);
  });

  test("round-trips verse lines and stanzas", () => {
    const text = `${VERSE}\n\nInde toro pater Aeneas`;
    expect(passageText(rendered(text, "verse"))).toBe(text);
  });
});

describe("savedItemHref", () => {
  test("opens URL imports from the server and pastes from this device", () => {
    expect(
      savedItemHref({
        storageKey: "https://a.com/x",
        title: "https://a.com/x",
        source: "fromUrl",
        lineMode: "keep",
      })
    ).toBe("/v2/externalReader?url=https%3A%2F%2Fa.com%2Fx");
    expect(
      savedItemHref({ storageKey: "k1", title: "t", lineMode: "verse" })
    ).toBe("/v2/externalReader?local=k1&lines=verse");
  });
});
