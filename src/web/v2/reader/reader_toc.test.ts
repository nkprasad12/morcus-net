/**
 * @jest-environment jsdom
 */

import { ReaderTocController } from "@/web/v2/reader/reader_toc.client";

describe("ReaderTocController", () => {
  let container: HTMLDivElement;

  function createTocFixture(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerHTML = `
      <div class="sticky-expanded-row">
        <button type="button" id="reader-toc-btn" aria-expanded="false" aria-controls="reader-toc-drawer">
          Contents
        </button>
        <button type="button" id="reader-breadcrumb-btn" aria-expanded="false">
          Book 1
        </button>
      </div>

      <div id="reader-toc-drawer" class="reader-toc-drawer" role="dialog" aria-label="Table of Contents" hidden>
        <div class="reader-toc-header">
          <button type="button" id="reader-toc-back-btn" class="reader-toc-back-btn">&larr; Back</button>
          <span class="reader-toc-title">Table of Contents</span>
          <button type="button" id="reader-toc-close-btn" class="reader-toc-close-btn">&times;</button>
        </div>

        <div class="reader-toc-search-box">
          <input type="text" id="reader-toc-filter" class="reader-toc-input" placeholder="Search..." />
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

  test("gracefully handles missing drawer without throwing", () => {
    const emptyDiv = document.createElement("div");
    const controller = new ReaderTocController({ root: emptyDiv });

    expect(controller.drawer).toBeNull();
    expect(controller.isOpen()).toBe(false);

    // Calling methods on empty controller is safe no-op
    expect(() => {
      controller.open();
      controller.close();
      controller.toggle();
      controller.filter("test");
      controller.destroy();
    }).not.toThrow();
  });

  test("resolves drawer, triggers, and inputs from root container", () => {
    const controller = new ReaderTocController({ root: container });

    expect(controller.drawer).toBe(
      container.querySelector("#reader-toc-drawer")
    );
    expect(controller.triggerBtn).toBe(
      container.querySelector("#reader-toc-btn")
    );
    expect(controller.breadcrumbBtn).toBe(
      container.querySelector("#reader-breadcrumb-btn")
    );
    expect(controller.closeBtn).toBe(
      container.querySelector("#reader-toc-close-btn")
    );
    expect(controller.backBtn).toBe(
      container.querySelector("#reader-toc-back-btn")
    );
    expect(controller.filterInput).toBe(
      container.querySelector("#reader-toc-filter")
    );
    expect(controller.listContainer).toBe(
      container.querySelector("#reader-toc-list")
    );

    controller.destroy();
  });

  test("open() removes hidden, updates aria-expanded, focuses filter input, and triggers onOpen callback", () => {
    const onOpen = jest.fn();
    const controller = new ReaderTocController({ root: container, onOpen });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;
    const filterInput = controller.filterInput!;

    expect(drawer.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    const focusSpy = jest.spyOn(filterInput, "focus");

    controller.open();

    expect(drawer.hasAttribute("hidden")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");
    expect(controller.isOpen()).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  test("close() adds hidden, updates aria-expanded, and triggers onClose callback", () => {
    const onClose = jest.fn();
    const controller = new ReaderTocController({ root: container, onClose });
    const drawer = controller.drawer!;
    const triggerBtn = controller.triggerBtn!;

    controller.open();
    expect(controller.isOpen()).toBe(true);

    controller.close();

    expect(drawer.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(controller.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  test("toggle() alternates between open and closed state", () => {
    const controller = new ReaderTocController({ root: container });

    expect(controller.isOpen()).toBe(false);

    controller.toggle();
    expect(controller.isOpen()).toBe(true);

    controller.toggle();
    expect(controller.isOpen()).toBe(false);

    controller.destroy();
  });

  test("clicking trigger button toggles drawer", () => {
    const controller = new ReaderTocController({ root: container });
    const triggerBtn = controller.triggerBtn!;

    expect(controller.isOpen()).toBe(false);

    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);

    triggerBtn.click();
    expect(controller.isOpen()).toBe(false);

    controller.destroy();
  });

  test("clicking breadcrumb button opens drawer", () => {
    const controller = new ReaderTocController({ root: container });
    const breadcrumbBtn = controller.breadcrumbBtn!;

    expect(controller.isOpen()).toBe(false);

    breadcrumbBtn.click();
    expect(controller.isOpen()).toBe(true);

    controller.destroy();
  });

  test("clicking close button or back button closes drawer", () => {
    const controller = new ReaderTocController({ root: container });
    const closeBtn = controller.closeBtn!;
    const backBtn = controller.backBtn!;

    controller.open();
    expect(controller.isOpen()).toBe(true);

    closeBtn.click();
    expect(controller.isOpen()).toBe(false);

    controller.open();
    expect(controller.isOpen()).toBe(true);

    backBtn.click();
    expect(controller.isOpen()).toBe(false);

    controller.destroy();
  });

  test("live filtering matches titles and section IDs and hides non-matches", () => {
    const controller = new ReaderTocController({ root: container });
    const items = controller.getItems();
    expect(items).toHaveLength(3);

    // Search for "Troy" -> should match Book II only
    controller.filter("troy");
    expect(items[0].style.display).toBe("none");
    expect(items[1].style.display).toBe("");
    expect(items[2].style.display).toBe("none");

    // Search by section id "6.1" -> should match Book VI only
    controller.filter("6.1");
    expect(items[0].style.display).toBe("none");
    expect(items[1].style.display).toBe("none");
    expect(items[2].style.display).toBe("");

    // Empty search -> all visible
    controller.filter("");
    expect(items[0].style.display).toBe("");
    expect(items[1].style.display).toBe("");
    expect(items[2].style.display).toBe("");

    controller.destroy();
  });

  test("typing into filter input automatically updates filtered items", () => {
    const controller = new ReaderTocController({ root: container });
    const filterInput = controller.filterInput!;
    const items = controller.getItems();

    filterInput.value = "underworld";
    filterInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(items[0].style.display).toBe("none");
    expect(items[1].style.display).toBe("none");
    expect(items[2].style.display).toBe("");

    controller.destroy();
  });

  test("dismisses drawer on click outside", () => {
    const controller = new ReaderTocController({ root: container });

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

    controller.destroy();
  });

  test("closes on Escape key and returns focus to trigger button", () => {
    const controller = new ReaderTocController({ root: container });
    const triggerBtn = controller.triggerBtn!;
    const focusSpy = jest.spyOn(triggerBtn, "focus");

    controller.open();
    expect(controller.isOpen()).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(controller.isOpen()).toBe(false);
    expect(focusSpy).toHaveBeenCalled();

    controller.destroy();
  });

  test("destroy() removes all listeners and prevents memory leaks", () => {
    const controller = new ReaderTocController({ root: container });
    const triggerBtn = controller.triggerBtn!;

    controller.destroy();

    // Clicking trigger button no longer opens drawer
    triggerBtn.click();
    expect(controller.isOpen()).toBe(false);

    // Outside click no longer throws or errors
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});
