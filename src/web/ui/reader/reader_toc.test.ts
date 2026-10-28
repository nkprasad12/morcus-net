/**
 * @jest-environment jsdom
 */

import { ReaderTocController } from "@/web/ui/reader/reader_toc.client";
import { revealTarget } from "@/web/ui/core/nav/reveal.client";
import { preRenderTocItemsHtml } from "@/web/ui/reader/reader_toc.server";

describe("ReaderTocController", () => {
  let container: HTMLDivElement;

  function createTocFixture(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerHTML = `
      <div class="sticky-primary-row">
        <button type="button" id="reader-toc-btn" aria-expanded="false" aria-controls="reader-toc-drawer">
          Contents
        </button>
      </div>

      <dialog id="reader-toc-drawer" class="reader-toc-drawer" aria-label="Table of Contents">
        <div class="reader-toc-header">
          <span class="reader-toc-title">Table of Contents</span>
          <button type="button" id="reader-toc-close-btn" class="reader-toc-close-btn" data-dialog-close>&times;</button>
        </div>

        <div class="reader-toc-list" id="reader-toc-list">
          <a href="/work/vergil-aeneid/1" class="reader-toc-item active">
            <span class="reader-toc-item-title">Book I: The Trojan Fleet</span>
            <span class="reader-toc-item-id">&sect; 1.1</span>
          </a>
          <a href="/work/vergil-aeneid/2" class="reader-toc-item">
            <span class="reader-toc-item-title">Book II: The Fall of Troy</span>
            <span class="reader-toc-item-id">&sect; 2.1</span>
          </a>
          <a href="/work/vergil-aeneid/6" class="reader-toc-item">
            <span class="reader-toc-item-title">Book VI: The Underworld</span>
            <span class="reader-toc-item-id">&sect; 6.1</span>
          </a>
        </div>
      </dialog>
    `;
    document.body.appendChild(div);
    return div;
  }

  beforeEach(() => {
    document.body.innerHTML = "";
    container = createTocFixture();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function connectController(
    options: ConstructorParameters<typeof ReaderTocController>[0]
  ): ReaderTocController {
    const controller = new ReaderTocController(options);
    controller.connect();
    return controller;
  }

  test("revealing the drawer (pre-upgrade :target, later hashes) opens it via the controller", () => {
    const controller = connectController({ root: container });
    const drawer = container.querySelector<HTMLElement>("#reader-toc-drawer")!;

    revealTarget(drawer);
    expect(controller.isOpen()).toBe(true);

    // Already open: revealing again is a no-op rather than a toggle.
    revealTarget(drawer);
    expect(controller.isOpen()).toBe(true);

    controller.close();
    controller.dispose();
    revealTarget(drawer);
    expect(controller.isOpen()).toBe(false);
  });

  test("gracefully handles missing drawer without throwing", () => {
    const emptyDiv = document.createElement("div");
    const controller = connectController({ root: emptyDiv });

    expect(controller.drawer).toBeNull();
    expect(controller.isOpen()).toBe(false);

    // Calling methods on empty controller is safe no-op
    expect(() => {
      controller.open();
      controller.close();
      controller.toggle();
      controller.dispose();
    }).not.toThrow();
  });

  test("resolves drawer, trigger, close button, and list container from root container", () => {
    const controller = connectController({ root: container });

    expect(controller.drawer).toBe(
      container.querySelector("#reader-toc-drawer")
    );
    expect(controller.triggerBtn).toBe(
      container.querySelector("#reader-toc-btn")
    );
    expect(controller.closeBtn).toBe(
      container.querySelector("#reader-toc-close-btn")
    );
    expect(controller.listContainer).toBe(
      container.querySelector("#reader-toc-list")
    );

    controller.dispose();
  });

  test("onConnect() resolves elements before wiring the dialog to its trigger", () => {
    const controller = new ReaderTocController({ root: container });
    expect(controller.drawer).toBeNull();
    expect(controller.triggerBtn).toBeNull();

    controller.connect();

    expect(controller.drawer).not.toBeNull();
    expect(controller.triggerBtn).not.toBeNull();

    const triggerBtn = container.querySelector<HTMLElement>("#reader-toc-btn")!;
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    controller.close();
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("open() opens the dialog, updates aria-expanded, focuses active item, and triggers onOpen callback", () => {
    const onOpen = jest.fn();
    const controller = connectController({ root: container, onOpen });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;
    const activeItem = drawer.querySelector<HTMLElement>(
      ".reader-toc-item.active"
    )!;

    expect(drawer.hasAttribute("open")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    const focusSpy = jest.spyOn(activeItem, "focus");

    controller.open();

    expect(drawer.hasAttribute("open")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");
    expect(controller.isOpen()).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);

    // Re-entrant open() is a no-op
    controller.open();
    expect(onOpen).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("open() falls back to focusing close button when no active item exists", () => {
    const activeItem = container.querySelector(".reader-toc-item.active");
    activeItem?.classList.remove("active");

    const controller = connectController({ root: container });
    const closeBtn = controller.closeBtn!;
    const focusSpy = jest.spyOn(closeBtn, "focus");

    controller.open();
    expect(focusSpy).toHaveBeenCalled();

    controller.dispose();
  });

  test("close() closes the dialog, updates aria-expanded, and triggers onClose callback", () => {
    const onClose = jest.fn();
    const controller = connectController({ root: container, onClose });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;

    controller.open();
    expect(controller.isOpen()).toBe(true);

    controller.close();

    expect(drawer.hasAttribute("open")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(controller.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("toggle() alternates between open and closed state", () => {
    const controller = connectController({ root: container });

    expect(controller.isOpen()).toBe(false);

    controller.toggle();
    expect(controller.isOpen()).toBe(true);

    controller.toggle();
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("clicking the trigger opens the drawer in place of its hash link", () => {
    const controller = connectController({ root: container });
    const triggerBtn = controller.triggerBtn!;

    expect(controller.isOpen()).toBe(false);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    triggerBtn.dispatchEvent(click);
    expect(controller.isOpen()).toBe(true);
    expect(click.defaultPrevented).toBe(true);

    // Modal: the trigger is inert while open, so a second click can't arrive;
    // a stray one leaves the dialog open rather than toggling it.
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    controller.dispose();
  });

  test("clicking close button closes drawer", () => {
    const controller = connectController({ root: container });
    const closeBtn = controller.closeBtn!;

    controller.open();
    expect(controller.isOpen()).toBe(true);

    closeBtn.click();
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("closes on a backdrop click, not on clicks inside the dialog", () => {
    const controller = connectController({ root: container });
    const drawer = controller.drawer!;
    drawer.getBoundingClientRect = () =>
      ({ top: 100, left: 100, width: 200, height: 200 } as DOMRect);

    controller.open();
    expect(controller.isOpen()).toBe(true);

    // A click on an item inside the dialog does not close it
    drawer
      .querySelector(".reader-toc-list")!
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, clientX: 150, clientY: 150 })
      );
    expect(controller.isOpen()).toBe(true);

    // A click on the ::backdrop targets the dialog, outside its box
    drawer.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 })
    );
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("follows a native close (Escape): resets aria-expanded, the filter and onClose", () => {
    const onClose = jest.fn();
    const controller = connectController({ root: container, onClose });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;

    controller.open();
    controller.applyFilter("2");
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    // jsdom has no native Escape handling: do what the browser does.
    drawer.removeAttribute("open");
    drawer.dispatchEvent(new Event("close"));

    expect(controller.isOpen()).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(
      Array.from(drawer.querySelectorAll<HTMLElement>(".reader-toc-item")).some(
        (item) => item.hidden
      )
    ).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("dispose() removes all listeners and prevents memory leaks, and connect() re-binds cleanly", () => {
    // Constructor is inert before connect()
    const controller = new ReaderTocController({ root: container });
    const triggerBtn = container.querySelector<HTMLElement>("#reader-toc-btn")!;
    triggerBtn.click();
    expect(controller.isOpen()).toBe(false);

    // First connect() binds listeners
    controller.connect();
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    // dispose() closes drawer and removes all listeners
    controller.dispose();
    expect(controller.isOpen()).toBe(false);

    triggerBtn.click();
    expect(controller.isOpen()).toBe(false);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // Reconnecting re-binds listeners on the same controller instance
    controller.connect();
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);
    controller.dispose();
  });

  describe("TOC Search & Section Jump Input", () => {
    function createComprehensiveTocFixture(
      activePageId: string = "1.1"
    ): HTMLDivElement {
      const div = document.createElement("div");
      const items = [
        { group: "Prologue", id: "prologue", title: "Prologue" },
        { group: "Book 1", id: "1.prologue", title: "Chapter prologue" },
        { group: "Book 1", id: "1.1", title: "Chapter 1" },
        { group: "Book 1", id: "1.2", title: "Chapter 2" },
        { group: "Book 1", id: "1.4", title: "Chapter 4" },
        { group: "Book 1", id: "1.14", title: "Chapter 14" },
        { group: "Book 1", id: "1.40", title: "Chapter 40" },
        { group: "Book 2", id: "2.praef", title: "Praefatio" },
        { group: "Book 2", id: "2.1", title: "Chapter 1" },
        { group: "Book 2", id: "2.4", title: "Chapter 4: Belgae" },
        { group: "Book 4", id: "4.1", title: "Chapter 1" },
        { group: "Book 4", id: "4.2", title: "Chapter 2" },
        { group: "Book 14", id: "14.1", title: "Chapter 1" },
        { group: "Book 14", id: "14.2", title: "Chapter 2" },
        { group: "Book 15", id: "15.1", title: "Chapter 1" },
        { group: "Book 20", id: "20.1", title: "Chapter 1" },
      ];

      const groupsMap = new Map<string, typeof items>();
      for (const item of items) {
        const list = groupsMap.get(item.group) ?? [];
        list.push(item);
        groupsMap.set(item.group, list);
      }

      const groupsHtml = Array.from(groupsMap.entries())
        .map(([groupName, groupItems]) => {
          const isOpen = groupItems.some((it) => it.id === activePageId);
          const childrenHtml = groupItems
            .map(
              (it) => `
              <a href="/work/author/work/${it.id}"
                 class="reader-toc-item${
                   it.id === activePageId ? " active" : ""
                 }"
                 data-page-id="${it.id}">
                <span class="reader-toc-item-title">${it.title}</span>
                <span class="reader-toc-item-id">&sect; ${it.id}</span>
              </a>`
            )
            .join("\n");
          return `
            <details class="reader-toc-group" ${isOpen ? "open" : ""}>
              <summary class="reader-toc-summary">
                <span class="reader-toc-group-label">${groupName}</span>
              </summary>
              <div class="reader-toc-group-children">
                ${childrenHtml}
              </div>
            </details>`;
        })
        .join("\n");

      div.innerHTML = `
          <div class="sticky-primary-row">
          <button type="button" id="reader-toc-btn" aria-expanded="false" aria-controls="reader-toc-drawer">
            &sect; ${activePageId}
          </button>
        </div>
        <dialog id="reader-toc-drawer" class="reader-toc-drawer" aria-label="Table of Contents">
          <div class="reader-toc-header">
            <form id="reader-toc-search-form" class="reader-toc-search-form" action="/work/author/work" method="GET">
              <input type="text" name="jump" id="reader-toc-search-input" class="reader-toc-search-input" />
            </form>
            <button type="button" id="reader-toc-close-btn" class="reader-toc-close-btn" data-dialog-close>&times;</button>
          </div>
          <div class="reader-toc-list" id="reader-toc-list">
            ${groupsHtml}
            <div id="reader-toc-empty" class="reader-toc-empty" hidden>No matching sections</div>
          </div>
        </dialog>
      `;
      document.body.appendChild(div);
      return div;
    }

    function getVisiblePageIds(root: ParentNode): string[] {
      return Array.from(
        root.querySelectorAll<HTMLAnchorElement>(".reader-toc-item")
      )
        .filter(
          (el) =>
            !el.hidden &&
            !el.closest<HTMLDetailsElement>(".reader-toc-group")?.hidden
        )
        .map((el) => el.dataset.pageId ?? "");
    }

    function getSelectedPageId(root: ParentNode): string | null {
      return (
        root.querySelector<HTMLAnchorElement>(
          ".reader-toc-item.is-filter-selected"
        )?.dataset.pageId ?? null
      );
    }

    test("auto-focuses search input on open and restores initial open group on clear", () => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture("1.1");
      const controller = connectController({ root });
      const searchInput = controller.searchInput!;
      const focusSpy = jest.spyOn(searchInput, "focus");

      controller.open();
      expect(focusSpy).toHaveBeenCalled();

      controller.applyFilter("2.4");
      expect(getVisiblePageIds(root)).toEqual(["2.4"]);
      expect(getSelectedPageId(root)).toBe("2.4");

      controller.applyFilter("");
      const groups = Array.from(
        root.querySelectorAll<HTMLDetailsElement>(".reader-toc-group")
      );
      const openGroups = groups
        .filter((g) => g.open)
        .map((g) => g.querySelector(".reader-toc-group-label")?.textContent);
      expect(openGroups).toEqual(["Book 1"]);

      controller.dispose();
    });

    test.each([
      {
        desc: "Single digit '4' matches Book 4 (4.1, 4.2) ONLY — never 1.14, 1.4, 1.40, or 2.4",
        active: "1.1",
        query: "4",
        expectedVisible: ["4.1", "4.2"],
        expectedSelected: "4.1",
      },
      {
        desc: "Ammianus-style work (active 14.1): typing '1' shows all 1* pages (1.x, 14.x, 15.x) across books without auto-selecting",
        active: "14.1",
        query: "1",
        expectedVisible: [
          "1.prologue",
          "1.1",
          "1.2",
          "1.4",
          "1.14",
          "1.40",
          "14.1",
          "14.2",
          "15.1",
        ],
        expectedSelected: null,
      },
      {
        desc: "Typing '14' narrows to Book 14 (14.1, 14.2) and excludes 1.14",
        active: "14.1",
        query: "14",
        expectedVisible: ["14.1", "14.2"],
        expectedSelected: "14.1",
      },
      {
        desc: "Typing '1.4' shows 1.4 and 1.40, selecting exact match 1.4 over 1.40, excluding 1.14",
        active: "1.1",
        query: "1.4",
        expectedVisible: ["1.4", "1.40"],
        expectedSelected: "1.4",
      },
      {
        desc: "Typing '1.14' shows 1.14 only",
        active: "1.1",
        query: "1.14",
        expectedVisible: ["1.14"],
        expectedSelected: "1.14",
      },
      {
        desc: "Named chapter 'pro' (no space) matches both top-level 'prologue' and nested '1.prologue' across groups without auto-selecting",
        active: "1.1",
        query: "pro",
        expectedVisible: ["prologue", "1.prologue"],
        expectedSelected: null,
      },
      {
        desc: "Exact named chapter 'prologue' selects 'prologue'",
        active: "1.1",
        query: "prologue",
        expectedVisible: ["prologue", "1.prologue"],
        expectedSelected: "prologue",
      },
      {
        desc: "Qualified named chapter '1.pro' matches only '1.prologue'",
        active: "1.1",
        query: "1.pro",
        expectedVisible: ["1.prologue"],
        expectedSelected: "1.prologue",
      },
      {
        desc: "Named preface 'praef' (no space) matches '2.praef'",
        active: "1.1",
        query: "praef",
        expectedVisible: ["2.praef"],
        expectedSelected: "2.praef",
      },
      {
        desc: "Colon/symbol normalization '§ 1:4' normalizes to '1.4'",
        active: "1.1",
        query: "§ 1:4",
        expectedVisible: ["1.4", "1.40"],
        expectedSelected: "1.4",
      },
      {
        desc: "Group label 'Book 2' shows all Book 2 items (and not Book 20) and auto-selects first item in Book 2",
        active: "1.1",
        query: "Book 2",
        expectedVisible: ["2.praef", "2.1", "2.4"],
        expectedSelected: "2.praef",
      },
      {
        desc: "Unique item title 'Belgae' shows 2.4 and auto-selects it",
        active: "1.1",
        query: "Belgae",
        expectedVisible: ["2.4"],
        expectedSelected: "2.4",
      },
      {
        desc: "Ambiguous multi-book item title 'Chapter 1' shows matches across all books without auto-selecting",
        active: "1.1",
        query: "Chapter 1",
        expectedVisible: ["1.1", "2.1", "4.1", "14.1", "15.1", "20.1"],
        expectedSelected: null,
      },
    ])("$desc", ({ active, query, expectedVisible, expectedSelected }) => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture(active);
      const controller = connectController({ root });
      controller.open();

      controller.applyFilter(query);

      expect(getVisiblePageIds(root)).toEqual(expectedVisible);
      expect(getSelectedPageId(root)).toBe(expectedSelected);

      controller.dispose();
    });

    test("supports deep sub-page section coordinates (e.g. 1.2.3 -> page 1.2#sec-1.2.3 and relative .3 -> 1.1#sec-1.1.3)", () => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture("1.1");
      const controller = connectController({ root });
      const searchInput = controller.searchInput!;
      controller.open();

      // Deep coordinate 1.2.3 keeps parent page 1.2 visible & selected
      searchInput.value = "1.2.3";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));

      expect(getVisiblePageIds(root)).toEqual(["1.2"]);
      expect(getSelectedPageId(root)).toBe("1.2");
      const item12 = root.querySelector<HTMLAnchorElement>(
        '[data-page-id="1.2"]'
      )!;
      const click12Spy = jest.fn((e: MouseEvent) => e.preventDefault());
      item12.addEventListener("click", click12Spy);
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(click12Spy).toHaveBeenCalledTimes(1);
      expect(item12.getAttribute("href")).toBe(
        "/work/author/work/1.2#sec-1.2.3"
      );

      // Relative sub-section .3 while on active page 1.1
      searchInput.value = ".3";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      expect(getVisiblePageIds(root)).toEqual(["1.1"]);
      const item11 = root.querySelector<HTMLAnchorElement>(
        '[data-page-id="1.1"]'
      )!;
      const click11Spy = jest.fn((e: MouseEvent) => e.preventDefault());
      item11.addEventListener("click", click11Spy);
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(click11Spy).toHaveBeenCalledTimes(1);
      expect(item11.getAttribute("href")).toBe(
        "/work/author/work/1.1#sec-1.1.3"
      );

      controller.dispose();
    });

    test("supports ArrowDown and ArrowUp keyboard navigation through visible items", () => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture("1.1");
      const controller = connectController({ root });
      const searchInput = controller.searchInput!;
      controller.open();

      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
      expect(getSelectedPageId(root)).toBe("1.2");

      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
      expect(getSelectedPageId(root)).toBe("1.1");

      // IME composition events should not move selection or trigger Enter navigation
      const composingDown = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      searchInput.dispatchEvent(composingDown);
      expect(composingDown.defaultPrevented).toBe(false);
      expect(getSelectedPageId(root)).toBe("1.1");

      controller.dispose();
    });

    test("Enter on unmatched or ambiguous multi-group query does not submit form or jump until ArrowDown selects an item", () => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture("2.4");
      const controller = connectController({ root });
      const searchInput = controller.searchInput!;
      const form = searchInput.form!;
      const submitSpy = jest.spyOn(form, "submit").mockImplementation(() => {});
      controller.open();

      // 1. Unmatched query "999" shows empty state, selects nothing, and Enter does not submit form
      searchInput.value = "999";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      expect(getVisiblePageIds(root)).toEqual([]);
      expect(getSelectedPageId(root)).toBeNull();
      expect(controller.emptyState?.hidden).toBe(false);

      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(submitSpy).not.toHaveBeenCalled();
      expect(controller.isOpen()).toBe(true);

      // Direct form submit event is also prevented in JS mode
      const submitEv = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEv);
      expect(submitEv.defaultPrevented).toBe(true);
      expect(submitSpy).not.toHaveBeenCalled();

      // 2. Ambiguous multi-book query "Chapter 1" leaves selection null on input; Enter is a no-op until ArrowDown selects an item
      searchInput.value = "Chapter 1";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      expect(getVisiblePageIds(root)).toEqual([
        "1.1",
        "2.1",
        "4.1",
        "14.1",
        "15.1",
        "20.1",
      ]);
      expect(getSelectedPageId(root)).toBeNull();

      const item11 = root.querySelector<HTMLAnchorElement>(
        '[data-page-id="1.1"]'
      )!;
      const click11Spy = jest.fn((e: MouseEvent) => e.preventDefault());
      item11.addEventListener("click", click11Spy);

      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(click11Spy).not.toHaveBeenCalled();
      expect(submitSpy).not.toHaveBeenCalled();

      // Pressing ArrowDown selects the first visible item (1.1), and Enter now clicks it
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
      expect(getSelectedPageId(root)).toBe("1.1");
      searchInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(click11Spy).toHaveBeenCalledTimes(1);

      submitSpy.mockRestore();
      controller.dispose();
    });

    test("open() centers active TOC item inside listContainer with instant scroll after resetFilter()", () => {
      document.body.innerHTML = "";
      const root = createComprehensiveTocFixture("14.1");
      const controller = connectController({ root });
      const list = controller.listContainer!;
      const active = list.querySelector<HTMLElement>(
        ".reader-toc-item.active"
      )!;

      Object.defineProperty(list, "clientHeight", {
        value: 300,
        configurable: true,
      });
      Object.defineProperty(list, "scrollTop", {
        value: 50,
        configurable: true,
        writable: true,
      });
      jest.spyOn(list, "getBoundingClientRect").mockReturnValue({
        top: 100,
        bottom: 400,
        left: 0,
        right: 360,
        width: 360,
        height: 300,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      });
      jest.spyOn(active, "getBoundingClientRect").mockReturnValue({
        top: 600,
        bottom: 632,
        left: 0,
        right: 360,
        width: 360,
        height: 32,
        x: 0,
        y: 600,
        toJSON: () => ({}),
      });
      const scrollToSpy = jest.fn();
      list.scrollTo = scrollToSpy;
      const activeScrollIntoViewSpy = jest.fn();
      active.scrollIntoView = activeScrollIntoViewSpy;

      controller.open();

      // top = (600 - 100) + 50 = 550; targetTop = 550 - 300 / 2 = 400
      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 400,
        behavior: "instant",
      });
      expect(activeScrollIntoViewSpy).not.toHaveBeenCalled();

      controller.dispose();
    });
  });
});

describe("preRenderTocItemsHtml", () => {
  const work = {
    urlAuthor: "appendix_vergiliana",
    urlName: "culex",
    textParts: ["line"],
    navTree: { id: [], children: [{ id: ["1"], children: [] }] },
  };

  test("labels nodes from their citation level by default", () => {
    const html = preRenderTocItemsHtml({ work });

    expect(html).toContain('<span class="reader-toc-item-title">Line 1</span>');
  });

  test("uses a node label override when one is given", () => {
    const html = preRenderTocItemsHtml({
      work,
      nodeLabels: new Map([["1", "Lines 1–414"]]),
    });

    expect(html).toContain(
      '<span class="reader-toc-item-title">Lines 1–414</span>'
    );
    expect(html).toContain('data-page-id="1"');
  });
});
