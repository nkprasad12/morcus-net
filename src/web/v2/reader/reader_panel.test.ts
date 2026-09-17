/**
 * @jest-environment jsdom
 */

import {
  ReaderPanelController,
  type PanelTab,
} from "@/web/v2/reader/reader_panel.client";

describe("ReaderPanelController", () => {
  let container: HTMLElement;

  function createFixture(hasNotes = true): HTMLElement {
    const root = document.createElement("div");
    root.className = "reader-split-layout";
    root.innerHTML = `
      <section class="reader-text-panel">
        <div class="reader-text-card">
          <article class="reader-passage">
            <p>Gallia est omnis divisa in partes tres... <a class="reader-note-ref" id="noteref-n1" href="#note-n1"><sup>[1]</sup></a></p>
            <p>Aliam Aquitani... <a class="reader-note-ref" id="noteref-n2" href="#note-n2"><sup>[2]</sup></a></p>
          </article>
          ${
            hasNotes
              ? `<aside class="reader-notes" role="doc-endnotes" aria-labelledby="reader-notes-heading">
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
                 </aside>`
              : ""
          }
          <div class="card-footer">Footer</div>
        </div>
      </section>
      <aside class="reader-dict-panel">
        <div class="reader-sheet-bar">
          <div class="reader-sheet-teaser">
            <span class="reader-sheet-label">Tap any word</span>
          </div>
        </div>
        <div class="dict-iframe-container">
          <iframe id="dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </div>
      </aside>
    `;
    document.body.appendChild(root);
    return root;
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("when page has NO notes", () => {
    it("keeps tab strip hidden and inactive", () => {
      container = createFixture(false);
      const controller = new ReaderPanelController({ root: container });

      expect(controller.hasNotes).toBe(false);
      expect(controller.noteCount).toBe(0);
      expect(controller.activeTab).toBe("dict");

      // Tab strip is hidden in DOM
      const tabs = container.querySelector<HTMLElement>(".reader-panel-tabs");
      expect(tabs).not.toBeNull();
      expect(tabs?.hidden).toBe(true);
      expect(container.querySelector(".has-companion-tabs")).toBeNull();

      // Iframe container is ready in views
      const iframeContainer = container.querySelector(".dict-iframe-container");
      expect(iframeContainer?.getAttribute("role")).toBe("tabpanel");

      // Calling setTab or showNote does nothing
      controller.setTab("notes");
      expect(controller.activeTab).toBe("dict");
      controller.showNote("note-n1");
      expect(controller.activeTab).toBe("dict");

      // Destroy is safe
      expect(() => controller.destroy()).not.toThrow();
    });
  });

  describe("when page HAS notes", () => {
    let controller: ReaderPanelController;
    let tabChangeCalls: PanelTab[];

    beforeEach(() => {
      container = createFixture(true);
      tabChangeCalls = [];
      controller = new ReaderPanelController({
        root: container,
        onTabChange: (tab) => tabChangeCalls.push(tab),
      });
    });

    afterEach(() => {
      controller.destroy();
    });

    it("initializes tab list with badge count and proper ARIA attributes", () => {
      expect(controller.hasNotes).toBe(true);
      expect(controller.noteCount).toBe(2);
      expect(controller.activeTab).toBe("dict");

      const tabs = container.querySelector(".reader-panel-tabs");
      expect(tabs).not.toBeNull();
      expect(tabs?.getAttribute("role")).toBe("tablist");

      const dictTab = container.querySelector("#panel-tab-dict");
      expect(dictTab?.getAttribute("role")).toBe("tab");
      expect(dictTab?.getAttribute("aria-selected")).toBe("true");
      expect(dictTab?.getAttribute("aria-controls")).toBe("panel-view-dict");
      expect(dictTab?.getAttribute("tabindex")).toBe("0");

      const notesTab = container.querySelector("#panel-tab-notes");
      expect(notesTab?.getAttribute("role")).toBe("tab");
      expect(notesTab?.getAttribute("aria-selected")).toBe("false");
      expect(notesTab?.getAttribute("aria-controls")).toBe("panel-view-notes");
      expect(notesTab?.getAttribute("tabindex")).toBe("-1");

      expect(notesTab?.textContent).toBe("Notes");
    });

    it("relocates .reader-notes into #panel-view-notes", () => {
      const textCard = container.querySelector(".reader-text-card");
      expect(textCard?.querySelector(".reader-notes")).toBeNull();
      expect(textCard?.querySelector(".reader-notes-stub")).toBeNull();

      const notesView = container.querySelector("#panel-view-notes");
      expect(notesView).not.toBeNull();
      expect(notesView?.getAttribute("role")).toBe("tabpanel");
      expect(notesView?.getAttribute("aria-live")).toBe("polite");
      expect(notesView?.classList.contains("active")).toBe(false);

      const relocatedNotes = notesView?.querySelector(".reader-notes");
      expect(relocatedNotes).not.toBeNull();

      // IDs must remain unaltered and unique
      expect(container.querySelectorAll("#note-n1").length).toBe(1);
      expect(container.querySelectorAll("#note-n2").length).toBe(1);
    });

    it("switches tabs via setTab() and updates ARIA and active classes", () => {
      controller.setTab("notes");
      expect(controller.activeTab).toBe("notes");
      expect(tabChangeCalls).toEqual(["notes"]);

      const dictTab = container.querySelector("#panel-tab-dict");
      const notesTab = container.querySelector("#panel-tab-notes");
      const dictView = container.querySelector("#panel-view-dict");
      const notesView = container.querySelector("#panel-view-notes");

      expect(dictTab?.getAttribute("aria-selected")).toBe("false");
      expect(dictTab?.getAttribute("tabindex")).toBe("-1");
      expect(notesTab?.getAttribute("aria-selected")).toBe("true");
      expect(notesTab?.getAttribute("tabindex")).toBe("0");

      expect(dictView?.classList.contains("active")).toBe(false);
      expect(notesView?.classList.contains("active")).toBe(true);

      controller.setTab("dict");
      expect(controller.activeTab).toBe("dict");
      expect(tabChangeCalls).toEqual(["notes", "dict"]);
      expect(dictTab?.getAttribute("aria-selected")).toBe("true");
      expect(notesTab?.getAttribute("aria-selected")).toBe("false");
      expect(dictView?.classList.contains("active")).toBe(true);
      expect(notesView?.classList.contains("active")).toBe(false);
    });

    it("clicking tabs switches tab", () => {
      const notesTab =
        container.querySelector<HTMLButtonElement>("#panel-tab-notes")!;
      notesTab.click();
      expect(controller.activeTab).toBe("notes");

      const dictTab =
        container.querySelector<HTMLButtonElement>("#panel-tab-dict")!;
      dictTab.click();
      expect(controller.activeTab).toBe("dict");
    });

    it("shows note with scroll and highlight via showNote()", () => {
      const note2 = container.querySelector<HTMLElement>("#note-n2")!;
      const scrollMock = jest.fn();
      note2.scrollIntoView = scrollMock;

      controller.showNote("note-n2");

      expect(controller.activeTab).toBe("notes");
      expect(note2.classList.contains("note-active")).toBe(true);
      expect(scrollMock).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
      });

      // Switching note clears previous highlight
      const note1 = container.querySelector<HTMLElement>("#note-n1")!;
      note1.scrollIntoView = jest.fn();
      controller.showNote("note-n1");

      expect(note1.classList.contains("note-active")).toBe(true);
      expect(note2.classList.contains("note-active")).toBe(false);
    });

    it("resets back to dict and clears note highlights via reset()", () => {
      const note1 = container.querySelector<HTMLElement>("#note-n1")!;
      note1.scrollIntoView = jest.fn();
      controller.showNote("note-n1");
      expect(note1.classList.contains("note-active")).toBe(true);
      expect(controller.activeTab).toBe("notes");

      controller.reset();

      expect(controller.activeTab).toBe("dict");
      expect(note1.classList.contains("note-active")).toBe(false);
    });

    it("supports keyboard arrow navigation across tabs", () => {
      const tabs = container.querySelector<HTMLElement>(".reader-panel-tabs")!;
      const dictTab =
        container.querySelector<HTMLButtonElement>("#panel-tab-dict")!;
      const notesTab =
        container.querySelector<HTMLButtonElement>("#panel-tab-notes")!;

      dictTab.focus();
      tabs.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
      expect(controller.activeTab).toBe("notes");
      expect(document.activeElement).toBe(notesTab);

      tabs.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
      );
      expect(controller.activeTab).toBe("dict");
      expect(document.activeElement).toBe(dictTab);

      tabs.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true })
      );
      expect(controller.activeTab).toBe("notes");
      expect(document.activeElement).toBe(notesTab);

      tabs.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      );
      expect(controller.activeTab).toBe("dict");
      expect(document.activeElement).toBe(dictTab);
    });

    it("restores original DOM tree on destroy()", () => {
      controller.destroy();

      const textCard = container.querySelector(".reader-text-card");
      expect(textCard?.querySelector(".reader-notes")).not.toBeNull();
      expect(textCard?.querySelector(".reader-notes-stub")).toBeNull();

      // Check order: notes should precede .card-footer
      const notes = textCard?.querySelector(".reader-notes");
      const footer = textCard?.querySelector(".card-footer");
      expect(notes?.nextElementSibling).toBe(footer);

      // Tabs and views removed
      expect(container.querySelector(".reader-panel-tabs")).toBeNull();
      expect(container.querySelector(".reader-panel-views")).toBeNull();

      // Iframe container restored
      const iframeContainer = container.querySelector(".dict-iframe-container");
      expect(iframeContainer?.getAttribute("role")).toBeNull();
      expect(iframeContainer?.getAttribute("id")).toBeNull();
      expect(iframeContainer?.classList.contains("reader-panel-view")).toBe(
        false
      );
    });

    it("adopts new notes dynamically and updates tab state", () => {
      // 1. Start with note-less container
      const emptyContainer = createFixture(false);
      const emptyController = new ReaderPanelController({
        root: emptyContainer,
      });
      expect(emptyController.hasNotes).toBe(false);
      expect(
        emptyContainer.querySelector<HTMLElement>(".reader-panel-tabs")?.hidden
      ).toBe(true);

      // 2. Adopt new notes
      const newNotesEl = document.createElement("aside");
      newNotesEl.className = "reader-notes";
      newNotesEl.innerHTML = `
        <ol class="reader-notes-list">
          <li class="reader-note" id="note-dyn1"><div class="reader-note-body">Dynamic note</div></li>
        </ol>
      `;
      emptyController.adoptNotes(newNotesEl);

      expect(emptyController.hasNotes).toBe(true);
      expect(emptyController.noteCount).toBe(1);
      expect(
        emptyContainer.querySelector<HTMLElement>(".reader-panel-tabs")?.hidden
      ).toBe(false);
      expect(
        emptyContainer.querySelector(".has-companion-tabs")
      ).not.toBeNull();
      expect(
        emptyContainer.querySelector("#panel-view-notes #note-dyn1")
      ).not.toBeNull();

      // 3. Switch to notes tab, then adopt null (simulating page turn to a chapter with no notes)
      emptyController.setTab("notes");
      expect(emptyController.activeTab).toBe("notes");

      emptyController.adoptNotes(null);
      expect(emptyController.hasNotes).toBe(false);
      expect(emptyController.noteCount).toBe(0);
      expect(emptyController.activeTab).toBe("dict"); // fell back to dict!
      expect(
        emptyContainer.querySelector<HTMLElement>(".reader-panel-tabs")?.hidden
      ).toBe(true);
      expect(emptyContainer.querySelector(".has-companion-tabs")).toBeNull();
      expect(
        emptyContainer.querySelector("#panel-view-notes #note-dyn1")
      ).toBeNull();
    });
  });
});
