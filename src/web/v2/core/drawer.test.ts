/**
 * @jest-environment jsdom
 */
import { DrawerController } from "@/web/v2/core/drawer.client";

// Ensure PointerEvent exists in jsdom
if (typeof window.PointerEvent === "undefined") {
  class MockPointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, params: any = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  (window as any).PointerEvent = MockPointerEvent;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => true;
}

describe("DrawerController", () => {
  let drawer: HTMLElement;
  let handle: HTMLElement;
  let layoutElement: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="layout">
        <aside id="drawer" class="v2-drawer">
          <div id="handle" class="v2-drawer-bar" tabindex="0" role="separator">
            <div class="v2-drawer-handle"></div>
            <div class="v2-drawer-teaser">
              <span class="v2-drawer-label">Drawer Title</span>
              <button class="v2-drawer-close">✕</button>
            </div>
          </div>
          <div id="content">Drawer content</div>
        </aside>
      </div>
    `;
    drawer = document.getElementById("drawer")!;
    handle = document.getElementById("handle")!;
    layoutElement = document.getElementById("layout")!;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("initializes with default options and tracks preferred dvh", () => {
    const controller = new DrawerController({
      drawer,
      handle,
      layoutElement,
      defaultDvh: 48,
    });

    expect(controller.isMinimized()).toBe(false);
    expect(controller.getPreferredDvh()).toBe(48);

    controller.destroy();
  });

  test("minimize() updates styles, classes, ARIA, and invokes onMinimize callback", () => {
    const onMinimize = jest.fn();
    const controller = new DrawerController({
      drawer,
      handle,
      layoutElement,
      minHeight: 54,
      onMinimize,
    });

    controller.minimize();

    expect(controller.isMinimized()).toBe(true);
    expect(drawer.classList.contains("v2-drawer-minimized")).toBe(true);
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("54px");
    expect(layoutElement.style.getPropertyValue("--v2-drawer-height")).toBe(
      "54px"
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    expect(onMinimize).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  test("restore() restores drawer height, updates classes, and invokes onRestore callback", () => {
    const onRestore = jest.fn();
    const controller = new DrawerController({
      drawer,
      handle,
      layoutElement,
      defaultDvh: 48,
      onRestore,
    });

    controller.minimize();
    expect(controller.isMinimized()).toBe(true);

    controller.restore(65);

    expect(controller.isMinimized()).toBe(false);
    expect(drawer.classList.contains("v2-drawer-minimized")).toBe(false);
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("65dvh");
    expect(layoutElement.style.getPropertyValue("--v2-drawer-height")).toBe(
      "65dvh"
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("65");
    expect(controller.getPreferredDvh()).toBe(65);
    expect(onRestore).toHaveBeenCalledWith(65);

    controller.destroy();
  });

  test("restore() clamps target dvh within [floorDvh, expandedDvh]", () => {
    const controller = new DrawerController({
      drawer,
      handle,
      floorDvh: 20,
      expandedDvh: 80,
    });

    controller.restore(10); // Below floor
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("20dvh");

    controller.restore(95); // Above expanded
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("80dvh");

    controller.destroy();
  });

  test("coordinates with <details> disclosure element", () => {
    document.body.innerHTML = `
      <morcus-dict-toc id="drawer" class="v2-drawer">
        <details open>
          <summary id="handle" class="v2-drawer-bar">Contents</summary>
          <div id="content">TOC items</div>
        </details>
      </morcus-dict-toc>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const detailsHandle = document.getElementById("handle")!;
    const detailsEl = detailsDrawer.querySelector("details")!;

    const controller = new DrawerController({
      drawer: detailsDrawer,
      handle: detailsHandle,
    });

    expect(detailsEl.open).toBe(true);
    expect(controller.isMinimized()).toBe(false);

    controller.minimize();
    expect(detailsEl.open).toBe(false);
    expect(controller.isMinimized()).toBe(true);

    controller.restore(50);
    expect(detailsEl.open).toBe(true);
    expect(controller.isMinimized()).toBe(false);

    controller.destroy();
  });

  test("handles keyboard navigation (ArrowUp, ArrowDown, Escape)", () => {
    const onEscape = jest.fn();
    const controller = new DrawerController({
      drawer,
      handle,
      defaultDvh: 48,
      expandedDvh: 88,
      onEscape,
    });

    // ArrowDown collapses to minimized
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(controller.isMinimized()).toBe(true);

    // ArrowUp while minimized restores to default (48dvh)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(controller.isMinimized()).toBe(false);
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("48dvh");

    // ArrowUp while open expands to expandedDvh (88dvh)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBe("88dvh");

    // Escape calls onEscape
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  test("suppresses synthetic <summary> click when dragged", () => {
    document.body.innerHTML = `
      <details id="drawer" class="v2-drawer" open>
        <summary id="handle" class="v2-drawer-bar">Handle</summary>
        <div>Content</div>
      </details>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const summaryHandle = document.getElementById("handle")!;

    const controller = new DrawerController({
      drawer: detailsDrawer,
      handle: summaryHandle,
    });

    // Simulate drag start
    summaryHandle.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 300,
        pointerId: 1,
      })
    );

    // Drag move exceeding threshold (> 6px)
    summaryHandle.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 100,
        clientY: 250,
        pointerId: 1,
      })
    );

    // Drag end
    summaryHandle.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 100,
        clientY: 250,
        pointerId: 1,
      })
    );

    // Browser fires synthetic click after pointerup
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    summaryHandle.dispatchEvent(clickEvent);

    // Click should be suppressed / defaultPrevented
    expect(clickEvent.defaultPrevented).toBe(true);

    controller.destroy();
  });

  test("filter ignores pointerdown on specified elements", () => {
    const controller = new DrawerController({
      drawer,
      handle,
      filter: (e) => {
        if (
          e.target instanceof Element &&
          e.target.closest(".v2-drawer-close")
        ) {
          return false;
        }
        return true;
      },
    });

    const closeBtn = drawer.querySelector(".v2-drawer-close")!;
    closeBtn.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 300,
        pointerId: 1,
      })
    );

    // Should not have entered active drag state
    expect(handle.classList.contains("v2-is-dragging")).toBe(false);

    controller.destroy();
  });

  test("destroy() removes all listeners cleanly", () => {
    const onEscape = jest.fn();
    const controller = new DrawerController({
      drawer,
      handle,
      onEscape,
    });

    controller.destroy();

    // After destroy, keydown should no longer invoke onEscape
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).not.toHaveBeenCalled();
  });
});
