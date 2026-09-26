/**
 * @jest-environment jsdom
 */

import { ReaderTocController } from "@/web/v2/reader/reader_toc.client";

describe("ReaderTocController", () => {
  let container: HTMLDivElement;

  function createTocFixture(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerHTML = `
      <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>
      <div class="sticky-primary-row">
        <button type="button" id="reader-toc-btn" aria-expanded="false" aria-controls="reader-toc-drawer">
          Contents
        </button>
      </div>

      <div id="reader-toc-drawer" class="reader-toc-drawer" role="dialog" aria-label="Table of Contents" hidden>
        <div class="reader-toc-header">
          <span class="reader-toc-title">Table of Contents</span>
          <button type="button" id="reader-toc-close-btn" class="reader-toc-close-btn">&times;</button>
        </div>

        <div class="reader-toc-list" id="reader-toc-list">
          <a href="/v2/reader/vergil-aeneid/1" class="reader-toc-item active">
            <span class="reader-toc-item-title">Book I: The Trojan Fleet</span>
            <span class="reader-toc-item-id">&sect; 1.1</span>
          </a>
          <a href="/v2/reader/vergil-aeneid/2" class="reader-toc-item">
            <span class="reader-toc-item-title">Book II: The Fall of Troy</span>
            <span class="reader-toc-item-id">&sect; 2.1</span>
          </a>
          <a href="/v2/reader/vergil-aeneid/6" class="reader-toc-item">
            <span class="reader-toc-item-title">Book VI: The Underworld</span>
            <span class="reader-toc-item-id">&sect; 6.1</span>
          </a>
        </div>
      </div>
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

  test("onConnect() resolves elements before child popover connects, binding trigger and panel without getPanel workaround", () => {
    const controller = new ReaderTocController({ root: container });
    expect(controller.drawer).toBeNull();
    expect(controller.triggerBtn).toBeNull();

    controller.connect();

    expect(controller.drawer).not.toBeNull();
    expect(controller.triggerBtn).not.toBeNull();

    // Child popover wired trigger successfully because elements were resolved before child connected
    const triggerBtn = container.querySelector<HTMLElement>("#reader-toc-btn")!;
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    controller.close();
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("open() removes hidden, updates aria-expanded, focuses active item, and triggers onOpen callback", () => {
    const onOpen = jest.fn();
    const controller = connectController({ root: container, onOpen });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;
    const activeItem = drawer.querySelector<HTMLElement>(
      ".reader-toc-item.active"
    )!;

    expect(drawer.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    const focusSpy = jest.spyOn(activeItem, "focus");

    controller.open();

    expect(drawer.hasAttribute("hidden")).toBe(false);
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

  test("close() adds hidden, updates aria-expanded, and triggers onClose callback", () => {
    const onClose = jest.fn();
    const controller = connectController({ root: container, onClose });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;

    controller.open();
    expect(controller.isOpen()).toBe(true);

    controller.close();

    expect(drawer.hasAttribute("hidden")).toBe(true);
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

  test("clicking trigger button toggles drawer", () => {
    const controller = connectController({ root: container });
    const triggerBtn = controller.triggerBtn!;

    expect(controller.isOpen()).toBe(false);

    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    triggerBtn.click();
    expect(controller.isOpen()).toBe(false);

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

  test("dismisses drawer on click outside", () => {
    const controller = connectController({ root: container });

    controller.open();
    expect(controller.isOpen()).toBe(true);

    // Click inside drawer does NOT dismiss
    controller.drawer!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(controller.isOpen()).toBe(true);

    // Click outside on document dismisses
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(controller.isOpen()).toBe(false);

    controller.dispose();
  });

  test("synchronizes backdrop visibility and dismisses on backdrop click", () => {
    const controller = connectController({ root: container });
    expect(controller.backdrop).not.toBeNull();
    expect(controller.backdrop?.hasAttribute("hidden")).toBe(true);

    controller.open();
    expect(controller.backdrop?.hasAttribute("hidden")).toBe(false);

    // Clicking backdrop closes drawer and re-hides backdrop
    controller.backdrop?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(controller.isOpen()).toBe(false);
    expect(controller.backdrop?.hasAttribute("hidden")).toBe(true);

    controller.dispose();
  });

  test("closes on Escape key and returns focus to trigger button", () => {
    const controller = connectController({ root: container });
    const triggerBtn = controller.triggerBtn!;
    const focusSpy = jest.spyOn(triggerBtn, "focus");

    controller.open();
    expect(controller.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(controller.isOpen()).toBe(false);
    expect(focusSpy).toHaveBeenCalled();

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
              <a href="/v2/reader/author/work/${it.id}"
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
        <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>
        <div class="sticky-primary-row">
          <button type="button" id="reader-toc-btn" aria-expanded="false" aria-controls="reader-toc-drawer">
            &sect; ${activePageId}
          </button>
        </div>
        <div id="reader-toc-drawer" class="reader-toc-drawer" role="dialog" aria-label="Table of Contents" hidden>
          <div class="reader-toc-header">
            <form id="reader-toc-search-form" class="reader-toc-search-form" action="/v2/reader/author/work" method="GET">
              <input type="text" name="jump" id="reader-toc-search-input" class="reader-toc-search-input" />
            </form>
            <button type="button" id="reader-toc-close-btn" class="reader-toc-close-btn">&times;</button>
          </div>
          <div class="reader-toc-list" id="reader-toc-list">
            ${groupsHtml}
            <div id="reader-toc-empty" class="reader-toc-empty" hidden>No matching sections</div>
          </div>
        </div>
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
        desc: "Ammianus-style work (active 14.1): typing '1' shows all 1* pages (1.x, 14.x, 15.x), not just 14.1",
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
        expectedSelected: "1.prologue",
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
        desc: "Named chapter 'pro' (no space) matches both top-level 'prologue' and nested '1.prologue'",
        active: "1.1",
        query: "pro",
        expectedVisible: ["prologue", "1.prologue"],
        expectedSelected: "prologue",
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
        "/v2/reader/author/work/1.2#sec-1.2.3"
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
        "/v2/reader/author/work/1.1#sec-1.1.3"
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

      controller.dispose();
    });
  });
});
