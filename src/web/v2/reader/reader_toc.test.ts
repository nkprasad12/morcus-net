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

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

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
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // Reconnecting re-binds listeners on the same controller instance
    controller.connect();
    triggerBtn.click();
    expect(controller.isOpen()).toBe(true);
    controller.dispose();
  });
});
