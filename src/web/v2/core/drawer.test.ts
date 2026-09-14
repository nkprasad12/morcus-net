/**
 * @jest-environment jsdom
 */
import { DrawerController } from "@/web/v2/core/drawer.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

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

  /**
   * Pins the viewport read out of the move hot path.
   *
   * `window.innerHeight` is layout-dependent, so reading it per `pointermove`
   * flushes pending layout — and the move handler writes `--v2-drawer-height`
   * immediately before, making it a read-after-write. The viewport cannot
   * change mid-gesture (the handle is `touch-action: none`, so no scroll-driven
   * URL-bar collapse), so it is measured once in `onStart` and reused by both
   * `onMove` and `onEnd`.
   *
   * Counting reads rather than asserting on the resulting height is deliberate:
   * the height maths is unchanged by the hoist, so only the read count can tell
   * the two versions apart.
   */
  test("reads the viewport once per gesture, never during pointermove", () => {
    const controller = new DrawerController({ drawer, handle });

    const original = Object.getOwnPropertyDescriptor(window, "innerHeight");
    let innerHeightReads = 0;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get: () => {
        innerHeightReads++;
        return 800;
      },
    });
    const rectSpy = jest.spyOn(Element.prototype, "getBoundingClientRect");

    try {
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
        })
      );

      // The gesture measures the viewport and the drawer exactly once, up front.
      expect(innerHeightReads).toBe(1);
      expect(rectSpy).toHaveBeenCalled();
      innerHeightReads = 0;
      rectSpy.mockClear();

      for (const clientY of [280, 260, 240]) {
        handle.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: 100,
            clientY,
            pointerId: 1,
          })
        );
      }

      // Every move is pure arithmetic plus writes: no layout is forced.
      expect(innerHeightReads).toBe(0);
      expect(rectSpy).not.toHaveBeenCalled();
      expect(drawer.style.getPropertyValue("--v2-drawer-height")).toBeTruthy();

      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          clientX: 100,
          clientY: 240,
          pointerId: 1,
        })
      );

      // onEnd reuses the cached viewport rather than re-reading it.
      expect(innerHeightReads).toBe(0);
    } finally {
      rectSpy.mockRestore();
      if (original) {
        Object.defineProperty(window, "innerHeight", original);
      }
      controller.destroy();
    }
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

  describe("drag state classes", () => {
    const pointerDown = (target: Element) =>
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
        })
      );

    const pointerEvent = (target: Element, type: string) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          clientX: 100,
          clientY: 250,
          pointerId: 1,
        })
      );

    /**
     * The drawer's `transition: height 0.25s` is suppressed mid-drag by
     * `.v2-drawer.v2-is-dragging` (core/drawer.css) and, for the reader,
     * `.v2-reader-dict-panel.v2-is-dragging` (reader/reader.css). Both select the
     * *panel*, but the handle is a child of it, so marking only the handle leaves
     * both rules dead and the drawer eases toward the pointer for the whole drag.
     */
    test("marks the drawer itself, not only the handle, while dragging", () => {
      const controller = new DrawerController({ drawer, handle });

      expect(drawer.classList.contains("v2-is-dragging")).toBe(false);

      pointerDown(handle);

      expect(drawer.classList.contains("v2-is-dragging")).toBe(true);
      expect(handle.classList.contains("v2-is-dragging")).toBe(true);

      controller.destroy();
    });

    test("clears the drawer marker on pointerup", () => {
      const controller = new DrawerController({ drawer, handle });

      pointerDown(handle);
      pointerEvent(handle, "pointerup");

      expect(drawer.classList.contains("v2-is-dragging")).toBe(false);
      expect(handle.classList.contains("v2-is-dragging")).toBe(false);

      controller.destroy();
    });

    test("clears the drawer marker on pointercancel", () => {
      const controller = new DrawerController({ drawer, handle });

      pointerDown(handle);
      pointerEvent(handle, "pointercancel");

      expect(drawer.classList.contains("v2-is-dragging")).toBe(false);
      expect(handle.classList.contains("v2-is-dragging")).toBe(false);

      controller.destroy();
    });

    // Without this, a drawer torn down mid-drag keeps `transition: none` forever.
    test("clears the drawer marker when destroyed mid-drag", () => {
      const controller = new DrawerController({ drawer, handle });

      pointerDown(handle);
      expect(drawer.classList.contains("v2-is-dragging")).toBe(true);

      controller.destroy();

      expect(drawer.classList.contains("v2-is-dragging")).toBe(false);
      expect(handle.classList.contains("v2-is-dragging")).toBe(false);
      expect(document.body.classList.contains("v2-resizing-drawer")).toBe(
        false
      );
    });

    test("does not mark the drawer when the drag is filtered out", () => {
      const controller = new DrawerController({
        drawer,
        handle,
        filter: (e) =>
          !(
            e.target instanceof Element && e.target.closest(".v2-drawer-close")
          ),
      });

      pointerDown(drawer.querySelector(".v2-drawer-close")!);

      expect(drawer.classList.contains("v2-is-dragging")).toBe(false);
      expect(handle.classList.contains("v2-is-dragging")).toBe(false);

      controller.destroy();
    });

    test("toggles the body resizing class across the drag", () => {
      const controller = new DrawerController({ drawer, handle });

      pointerDown(handle);
      expect(document.body.classList.contains("v2-resizing-drawer")).toBe(true);

      pointerEvent(handle, "pointerup");
      expect(document.body.classList.contains("v2-resizing-drawer")).toBe(
        false
      );

      controller.destroy();
    });
  });
});
