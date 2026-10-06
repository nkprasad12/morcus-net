/**
 * @jest-environment jsdom
 */

import { notifyContentSwap } from "@/web/v2/core/base_element.client";
import { revealTarget } from "@/web/v2/core/reveal.client";
import {
  renderReaderDictPanelHtml,
  renderReaderNotesSlot,
  type ReaderCompanionOptions,
} from "@/web/v2/reader/reader.server";
import {
  ReaderPanelController,
  type PanelTab,
} from "@/web/v2/reader/reader_panel.client";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

const NOTES_HTML = `<aside class="reader-notes" role="doc-endnotes" aria-labelledby="reader-notes-heading">
  <h2 class="reader-notes-heading" id="reader-notes-heading">Notes</h2>
  <ol class="reader-notes-list">
    <li class="reader-note" id="note-n1">
      <a class="reader-note-backref" href="#noteref-n1" role="doc-backlink">[1]</a>
      <div class="reader-note-body">First critical apparatus note.</div>
    </li>
    <li class="reader-note" id="note-n2">
      <a class="reader-note-backref" href="#noteref-n2" role="doc-backlink">[2]</a>
      <div class="reader-note-body">Second critical apparatus note.</div>
    </li>
  </ol>
</aside>`;

const ABOUT_HTML = `<details class="reader-work-about" id="reader-work-about" open>
  <summary class="reader-about-summary">About this text</summary>
  <div class="reader-about-card">Julius Caesar</div>
</details>`;

const TRANSLATION_HTML = `<div class="reader-translation-content">
  <div class="reader-translation-header">Translated by John Selby Watson</div>
  <div class="reader-translation-section" id="trans-sec-1.1">All Gaul is divided...</div>
</div>`;

/** The server-rendered reader layout, with the real companion panel. */
function createFixture(
  companion?: Partial<ReaderCompanionOptions>
): HTMLElement {
  const root = document.createElement("div");
  root.className = "reader-split-layout";
  const panel = renderReaderDictPanelHtml({
    query: "",
    dictIframeSrc: "/v2/dicts?embedded=1",
    closeHref: "/v2/reader/caesar/de_bello_gallico",
    companion: companion && {
      notesHtml: "",
      aboutHtml: "",
      hasTranslation: false,
      ...companion,
    },
  });
  const layout = new DOMParser().parseFromString(
    `<div>
      <section class="reader-text-panel">
        <div class="reader-text-card" data-slot="text">
          <article class="reader-passage">
            <p>Gallia est omnis divisa <a class="reader-note-ref" id="noteref-n1" href="#note-n1"><sup>[1]</sup></a></p>
          </article>
        </div>
      </section>
      ${panel}
    </div>`,
    "text/html"
  ).body.firstElementChild;
  root.replaceChildren(...Array.from(layout?.childNodes ?? []));
  document.body.appendChild(root);
  return root;
}

function connectController(
  options: ConstructorParameters<typeof ReaderPanelController>[0]
): ReaderPanelController {
  const controller = new ReaderPanelController(options);
  controller.connect();
  return controller;
}

function $<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string
): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

function pressKey(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("ReaderPanelController", () => {
  let container: HTMLElement;
  let controller: ReaderPanelController;
  let tabChanges: PanelTab[];

  beforeEach(() => {
    document.body.innerHTML = "";
    tabChanges = [];
  });

  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = "";
  });

  describe("server markup", () => {
    it("renders tabs as hash links and the dictionary as a view", () => {
      container = createFixture({ notesHtml: NOTES_HTML });
      const notesTab = $<HTMLAnchorElement>(container, "#panel-tab-notes");
      expect(notesTab.getAttribute("href")).toBe("#panel-view-notes");
      expect(notesTab.hasAttribute("role")).toBe(false);
      expect(notesTab.hasAttribute("aria-selected")).toBe(false);
      expect(
        $(container, "#dict-frame").closest("#panel-view-dict")
      ).not.toBeNull();
      expect(
        $(container, "#note-n1").closest("#panel-view-notes")
      ).not.toBeNull();
      expect(container.querySelector(".reader-panel-view.active")).toBeNull();
    });

    it("keeps the iframe outside every slot; notes are the `notes` slot", () => {
      container = createFixture({ notesHtml: NOTES_HTML });
      expect($(container, "#dict-frame").closest("[data-slot]")).toBeNull();
      expect(
        $(container, "#note-n1")
          .closest("[data-slot]")
          ?.getAttribute("data-slot")
      ).toBe("notes");
    });

    it("hides the tab bar for a dictionary-only panel", () => {
      container = createFixture();
      expect($(container, ".reader-panel-tabs").hidden).toBe(true);
      expect(container.querySelector(".has-companion-tabs")).toBeNull();
    });

    it("gates the Translation tab on JS", () => {
      container = createFixture({ hasTranslation: true });
      expect(
        $(container, "#panel-tab-translation").hasAttribute("data-js-only")
      ).toBe(true);
      // The empty view is unreachable without its tab, and gating it would
      // leave an inactive (rendered, invisible) js-only box before upgrade.
      expect(
        $(container, "#panel-view-translation").hasAttribute("data-js-only")
      ).toBe(false);
    });
  });

  describe("without notes", () => {
    it("keeps the tab bar hidden and ignores the Notes tab", () => {
      container = createFixture();
      controller = connectController({ root: container });

      expect(controller.hasNotes).toBe(false);
      expect(controller.noteCount).toBe(0);
      expect(controller.activeTab).toBe("dict");
      expect($(container, ".reader-panel-tabs").hidden).toBe(true);
      expect($(container, "#panel-view-dict").getAttribute("role")).toBe(
        "tabpanel"
      );

      controller.setTab("notes");
      expect(controller.activeTab).toBe("dict");
      controller.showNote("note-n1");
      expect(controller.activeTab).toBe("dict");
    });
  });

  describe("with notes", () => {
    beforeEach(() => {
      container = createFixture({ notesHtml: NOTES_HTML });
      controller = connectController({
        root: container,
        onTabChange: (tab) => tabChanges.push(tab),
      });
    });

    it("adds tab roles and selects the dictionary", () => {
      expect(controller.hasNotes).toBe(true);
      expect(controller.noteCount).toBe(2);
      expect($(container, ".reader-panel-tabs").getAttribute("role")).toBe(
        "tablist"
      );

      const dictTab = $(container, "#panel-tab-dict");
      expect(dictTab.getAttribute("role")).toBe("tab");
      expect(dictTab.getAttribute("aria-selected")).toBe("true");
      expect(dictTab.getAttribute("aria-controls")).toBe("panel-view-dict");
      expect(dictTab.getAttribute("tabindex")).toBe("0");

      const notesTab = $(container, "#panel-tab-notes");
      expect(notesTab.getAttribute("aria-selected")).toBe("false");
      expect(notesTab.getAttribute("tabindex")).toBe("-1");
      expect(notesTab.textContent?.trim()).toBe("Notes");

      expect(
        $(container, "#panel-view-dict").classList.contains("active")
      ).toBe(true);
      expect(
        $(container, "#panel-view-notes").getAttribute("aria-labelledby")
      ).toBe("panel-tab-notes");
      // Nothing moved: the dictionary is still the first view.
      expect($(container, ".reader-panel-views").firstElementChild?.id).toBe(
        "panel-view-dict"
      );
    });

    it("switches tabs via setTab()", () => {
      controller.setTab("notes");
      expect(controller.activeTab).toBe("notes");
      expect(
        $(container, "#panel-tab-notes").getAttribute("aria-selected")
      ).toBe("true");
      expect(
        $(container, "#panel-view-notes").classList.contains("active")
      ).toBe(true);
      expect(
        $(container, "#panel-view-dict").classList.contains("active")
      ).toBe(false);
      expect(tabChanges).toEqual(["notes"]);
    });

    it("switches tabs on click without following the link", () => {
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      $(container, "#panel-tab-notes .reader-tab-label").dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(controller.activeTab).toBe("notes");
    });

    it.each([{ ctrlKey: true }, { metaKey: true }])(
      "leaves a modified click (%o) on a tab to the browser",
      (init) => {
        const click = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ...init,
        });
        $(container, "#panel-tab-notes .reader-tab-label").dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
        expect(controller.activeTab).toBe("dict");
      }
    );

    it("shows a note with scroll and highlight", () => {
      const note = $(container, "#note-n2");
      note.scrollIntoView = jest.fn();
      controller.showNote("note-n2");
      expect(controller.activeTab).toBe("notes");
      expect(note.classList.contains("note-active")).toBe(true);
      expect(note.scrollIntoView).toHaveBeenCalled();

      controller.reset();
      expect(controller.activeTab).toBe("dict");
      expect(note.classList.contains("note-active")).toBe(false);
    });

    it("roves with the arrow keys, Home and End", () => {
      const tabs = $(container, ".reader-panel-tabs");
      pressKey(tabs, "ArrowRight");
      expect(controller.activeTab).toBe("notes");
      expect(document.activeElement).toBe($(container, "#panel-tab-notes"));
      pressKey(tabs, "ArrowRight");
      expect(controller.activeTab).toBe("dict");
      pressKey(tabs, "End");
      expect(controller.activeTab).toBe("notes");
      pressKey(tabs, "Home");
      expect(controller.activeTab).toBe("dict");
    });

    it("activates the focused tab on Space", () => {
      controller.setTab("notes");
      const event = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      $(container, ".reader-panel-tabs").dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(controller.activeTab).toBe("notes");
    });

    it("hands back to the No-JS rules on dispose", () => {
      controller.setTab("notes");
      controller.dispose();
      expect(container.querySelector(".reader-panel-view.active")).toBeNull();
      expect(
        container.querySelector(".reader-panel-tab[aria-selected]")
      ).toBeNull();
      expect(
        container.querySelector(
          ".reader-panel-tabs[role], .reader-panel-tab[role], .reader-panel-view[role]"
        )
      ).toBeNull();
      // The iframe never moved.
      expect($(container, "#dict-frame").parentElement?.id).toBe(
        "panel-view-dict"
      );
    });

    it("keeps its tab across a reconnect", () => {
      controller.setTab("notes");
      controller.dispose();
      controller.connect();
      expect(controller.activeTab).toBe("notes");
      expect(
        $(container, "#panel-view-notes").classList.contains("active")
      ).toBe(true);
    });
  });

  it("hands back to the No-JS rules when connect throws partway", () => {
    container = createFixture({ notesHtml: NOTES_HTML });
    // Fail after the ARIA roles and the active view have been applied.
    const spy = jest
      .spyOn(ReaderPanelController.prototype as any, "initRevealers")
      .mockImplementation(() => {
        throw new Error("broken");
      });
    try {
      const failed = new ReaderPanelController({ root: container });
      expect(() => failed.connect()).toThrow("broken");
    } finally {
      spy.mockRestore();
    }
    expect(container.querySelector(".reader-panel-view.active")).toBeNull();
    expect(
      container.querySelector(
        ".reader-panel-tabs[role], .reader-panel-tab[role], .reader-panel-view[role]"
      )
    ).toBeNull();
  });

  describe("notes slot swaps", () => {
    beforeEach(() => {
      container = createFixture({
        notesHtml: NOTES_HTML,
        aboutHtml: ABOUT_HTML,
      });
      controller = connectController({ root: container });
    });

    function swapNotes(notesHtml: string): void {
      const next = new DOMParser().parseFromString(
        renderReaderNotesSlot(notesHtml),
        "text/html"
      ).body.firstElementChild;
      if (!next) throw new Error("No slot");
      $(container, "[data-slot='notes']").replaceWith(next);
      notifyContentSwap(next);
    }

    it("recounts notes and keeps the Notes view", () => {
      controller.setTab("notes");
      const view = $(container, "#panel-view-notes");
      swapNotes(
        NOTES_HTML.replace(
          /<li class="reader-note" id="note-n2">[\s\S]*?<\/li>/,
          ""
        )
      );
      expect(controller.noteCount).toBe(1);
      expect(controller.activeTab).toBe("notes");
      expect($(container, "#panel-view-notes")).toBe(view);
    });

    it("hides the Notes tab and falls back to the dictionary when a page has none", () => {
      controller.setTab("notes");
      swapNotes("");
      expect(controller.hasNotes).toBe(false);
      expect($(container, "#panel-tab-notes").hidden).toBe(true);
      expect(controller.activeTab).toBe("dict");
      // About remains, so the bar stays.
      expect($(container, ".reader-panel-tabs").hidden).toBe(false);

      swapNotes(NOTES_HTML);
      expect($(container, "#panel-tab-notes").hidden).toBe(false);
    });

    it("ignores swaps of other regions", () => {
      const spy = jest.spyOn(controller, "setTab");
      notifyContentSwap($(container, "[data-slot='text']"));
      expect(spy).not.toHaveBeenCalled();
      expect(controller.noteCount).toBe(2);
    });
  });

  describe("hash reveals (PH6)", () => {
    beforeEach(() => {
      container = createFixture({
        notesHtml: NOTES_HTML,
        aboutHtml: ABOUT_HTML,
      });
      controller = connectController({
        root: container,
        onTabChange: (tab) => tabChanges.push(tab),
      });
    });

    it("a note target opens the Notes tab and highlights the note", () => {
      const note = $(container, "#note-n2");
      note.scrollIntoView = jest.fn();
      revealTarget(note);
      expect(controller.activeTab).toBe("notes");
      expect(note.classList.contains("note-active")).toBe(true);
    });

    it("#reader-work-about opens the About tab and is idempotent on repeat reveals", () => {
      const about = $(container, "#reader-work-about");
      revealTarget(about);
      revealTarget(about);
      expect(controller.activeTab).toBe("about");
      expect(tabChanges).toEqual(["about"]);
    });

    it("a view's own id opens its tab and is idempotent on repeat reveals", () => {
      const aboutView = $(container, "#panel-view-about");
      const dictView = $(container, "#panel-view-dict");
      revealTarget(aboutView);
      revealTarget(aboutView);
      expect(controller.activeTab).toBe("about");
      revealTarget(dictView);
      revealTarget(dictView);
      expect(controller.activeTab).toBe("dict");
      expect(tabChanges).toEqual(["about", "dict"]);
    });

    it("stops revealing after dispose", () => {
      controller.dispose();
      revealTarget($(container, "#reader-work-about"));
      expect(tabChanges).toEqual([]);
    });
  });

  describe("with About but no notes", () => {
    it("shows Dictionary and About, with Notes hidden", () => {
      container = createFixture({ aboutHtml: ABOUT_HTML });
      controller = connectController({ root: container });
      expect(controller.hasAbout).toBe(true);
      expect($(container, ".reader-panel-tabs").hidden).toBe(false);
      expect($(container, "#panel-tab-notes").hidden).toBe(true);
      expect($(container, "#panel-tab-about").hidden).toBe(false);

      pressKey($(container, ".reader-panel-tabs"), "ArrowRight");
      expect(controller.activeTab).toBe("about");
    });
  });

  describe("with a translation", () => {
    let loadTranslation: jest.Mock<Promise<string | null>>;

    beforeEach(() => {
      container = createFixture({
        notesHtml: NOTES_HTML,
        aboutHtml: ABOUT_HTML,
        hasTranslation: true,
      });
      loadTranslation = jest.fn().mockResolvedValue(TRANSLATION_HTML);
      controller = connectController({
        root: container,
        hasTranslation: true,
        onLoadTranslation: loadTranslation,
      });
    });

    it("cycles through four tabs", () => {
      const tabs = $(container, ".reader-panel-tabs");
      const order: PanelTab[] = [];
      for (let i = 0; i < 4; i++) {
        pressKey(tabs, "ArrowRight");
        order.push(controller.activeTab);
      }
      expect(order).toEqual(["notes", "translation", "about", "dict"]);
      pressKey(tabs, "ArrowLeft");
      expect(controller.activeTab).toBe("about");
    });

    it("loads the translation once, on first open", async () => {
      expect(loadTranslation).not.toHaveBeenCalled();
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      await Promise.resolve();

      const view = $(container, "#panel-view-translation");
      expect(view.classList.contains("active")).toBe(true);
      expect(view.textContent).toContain("Translated by John Selby Watson");

      controller.setTab("dict");
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(1);
    });

    it("does not re-render spinner or start a second load while in flight", async () => {
      let resolve!: (html: string | null) => void;
      loadTranslation
        .mockReset()
        .mockImplementation(
          () => new Promise<string | null>((r) => (resolve = r))
        );

      const view = $(container, "#panel-view-translation");
      revealTarget(view);
      const firstSpinner = $(view, ".loading-spinner");
      expect(loadTranslation).toHaveBeenCalledTimes(1);

      // Repeat reveal and explicit setTab while in flight are no-ops on the load
      revealTarget(view);
      controller.setTab("dict");
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(1);
      expect($(view, ".loading-spinner")).toBe(firstSpinner);

      resolve(TRANSLATION_HTML);
      await Promise.resolve();
      await Promise.resolve();
      expect(view.textContent).toContain("Translated by John Selby Watson");
    });

    it("re-arms translation load when an in-flight load resolves to null", async () => {
      loadTranslation
        .mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(TRANSLATION_HTML);

      controller.setTab("translation");
      await Promise.resolve();
      await Promise.resolve();
      expect(loadTranslation).toHaveBeenCalledTimes(1);

      controller.setTab("dict");
      controller.setTab("translation");
      await Promise.resolve();
      await Promise.resolve();
      expect(loadTranslation).toHaveBeenCalledTimes(2);
      expect($(container, "#panel-view-translation").textContent).toContain(
        "Translated by John Selby Watson"
      );
    });

    it("reloads after resetTranslation()", async () => {
      controller.setTab("translation");
      await Promise.resolve();
      await Promise.resolve();
      controller.resetTranslation();
      expect($(container, "#panel-view-translation").textContent).toBe("");
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(2);
    });

    it("ignores a stale in-flight load that resolves after resetTranslation()", async () => {
      const resolvers: Array<(html: string | null) => void> = [];
      loadTranslation.mockReset().mockImplementation(
        () =>
          new Promise<string | null>((r) => {
            resolvers.push(r);
          })
      );

      // Start load 1, then reset (simulating a page turn) and start load 2
      controller.setTab("translation");
      controller.setTab("dict");
      controller.resetTranslation();
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(2);

      // Stale load 1 resolves (either with null from an abort or with old HTML);
      // load 2 must remain in flight so a subsequent setTab does not start load 3.
      resolvers[0]("<div>Stale page translation</div>");
      await Promise.resolve();
      await Promise.resolve();
      expect($(container, "#panel-view-translation").textContent).not.toContain(
        "Stale page translation"
      );
      controller.setTab("translation");
      expect(loadTranslation).toHaveBeenCalledTimes(2);

      resolvers[1](TRANSLATION_HTML);
      await Promise.resolve();
      await Promise.resolve();
      expect($(container, "#panel-view-translation").textContent).toContain(
        "Translated by John Selby Watson"
      );
    });

    it("takes content directly via setTranslationHtml()", () => {
      controller.setTranslationHtml(
        '<div class="reader-translation-content">Direct HTML</div>'
      );
      expect($(container, "#panel-view-translation").textContent).toContain(
        "Direct HTML"
      );
      controller.setTab("translation");
      expect(loadTranslation).not.toHaveBeenCalled();
    });

    it("offers a retry after a failed load", async () => {
      loadTranslation
        .mockReset()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce("<div>Recovered!</div>");
      const consoleError = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      controller.setTab("translation");
      await Promise.resolve();
      await Promise.resolve();

      const view = $(container, "#panel-view-translation");
      $<HTMLButtonElement>(view, "#btn-retry-translation").click();
      expect(loadTranslation).toHaveBeenCalledTimes(2);
      await Promise.resolve();
      await Promise.resolve();
      expect(view.textContent).toContain("Recovered!");
      consoleError.mockRestore();
    });

    it("drops a translation that arrives after disconnect", async () => {
      let resolve!: (html: string) => void;
      loadTranslation
        .mockReset()
        .mockImplementation(() => new Promise<string>((r) => (resolve = r)));
      controller.setTab("translation");
      controller.dispose();
      resolve("<div>Late arrival</div>");
      await Promise.resolve();
      await Promise.resolve();
      expect($(container, "#panel-view-translation").textContent).not.toContain(
        "Late arrival"
      );
    });

    it("highlights a translation note in the Translation tab", () => {
      controller.setTranslationHtml(`
        <aside class="reader-notes"><ol class="reader-notes-list">
          <li class="reader-note" id="note-t1"><div class="reader-note-body">Translation note</div></li>
        </ol></aside>`);
      const note = $(container, "#note-t1");
      note.scrollIntoView = jest.fn();
      controller.showNote("note-t1");
      expect(controller.activeTab).toBe("translation");
      expect(note.classList.contains("note-active")).toBe(true);
      controller.reset();
      expect(note.classList.contains("note-active")).toBe(false);
    });
  });
});
