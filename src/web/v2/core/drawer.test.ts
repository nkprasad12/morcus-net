/**
 * @jest-environment jsdom
 */
import {
  DrawerController,
  DRAWER_DEFAULT_DVH,
  DRAWER_EXPANDED_DVH,
  DRAWER_FLOOR_DVH,
  DRAWER_MIN_HEIGHT,
} from "@/web/v2/core/drawer.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

describe("DrawerController", () => {
  let drawer: HTMLElement;
  let handle: HTMLElement;
  let layoutElement: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="layout">
        <aside id="drawer" class="drawer">
          <div id="handle" class="drawer-bar" tabindex="0" role="separator">
            <div class="drawer-handle"></div>
            <div class="drawer-teaser">
              <span class="drawer-label">Drawer Title</span>
              <button class="drawer-close">✕</button>
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

  function connectController(
    options: ConstructorParameters<typeof DrawerController>[0]
  ): DrawerController {
    const controller = new DrawerController(options);
    controller.connect();
    return controller;
  }

  afterEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("initializes with default options and tracks preferred dvh", () => {
    const controller = connectController({
      drawer,
      handle,
      layoutElement,
    });

    expect(controller.isMinimized()).toBe(false);
    expect(controller.getPreferredDvh()).toBe(DRAWER_DEFAULT_DVH);

    controller.dispose();
  });

  test("uses DRAWER_* constants when dvh and height options are omitted", () => {
    const controller = connectController({ drawer, handle, layoutElement });
    expect(controller.getPreferredDvh()).toBe(DRAWER_DEFAULT_DVH);
    controller.minimize();
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_MIN_HEIGHT}px`
    );
    // Floor clamp
    controller.restore(DRAWER_FLOOR_DVH - 5);
    expect(controller.getPreferredDvh()).toBe(DRAWER_FLOOR_DVH);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_FLOOR_DVH}dvh`
    );
    // Expanded clamp
    controller.restore(DRAWER_EXPANDED_DVH + 10);
    expect(controller.getPreferredDvh()).toBe(DRAWER_EXPANDED_DVH);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_EXPANDED_DVH}dvh`
    );
    controller.dispose();
  });

  test("minimize() updates styles, classes, ARIA, and invokes onMinimize callback", () => {
    const onMinimize = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      layoutElement,
      minHeight: 54,
      onMinimize,
    });

    controller.minimize();

    expect(controller.isMinimized()).toBe(true);
    expect(drawer.classList.contains("drawer-minimized")).toBe(true);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("54px");
    expect(layoutElement.style.getPropertyValue("--drawer-height")).toBe(
      "54px"
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    expect(onMinimize).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("restore() restores drawer height, updates classes, and invokes onRestore callback", () => {
    const onRestore = jest.fn();
    const controller = connectController({
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
    expect(drawer.classList.contains("drawer-minimized")).toBe(false);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("65dvh");
    expect(layoutElement.style.getPropertyValue("--drawer-height")).toBe(
      "65dvh"
    );
    expect(handle.getAttribute("aria-valuenow")).toBe("65");
    expect(controller.getPreferredDvh()).toBe(65);
    expect(onRestore).toHaveBeenCalledWith(65);

    controller.dispose();
  });

  test("restore() clamps target dvh within [floorDvh, expandedDvh]", () => {
    const controller = connectController({
      drawer,
      handle,
      floorDvh: 20,
      expandedDvh: 80,
    });

    controller.restore(10); // Below floor
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("20dvh");

    controller.restore(95); // Above expanded
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("80dvh");

    controller.dispose();
  });

  test("coordinates with <details> disclosure element", () => {
    document.body.innerHTML = `
      <morcus-dict-toc id="drawer" class="drawer">
        <details open>
          <summary id="handle" class="drawer-bar">Contents</summary>
          <div id="content">TOC items</div>
        </details>
      </morcus-dict-toc>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const detailsHandle = document.getElementById("handle")!;
    const detailsEl = detailsDrawer.querySelector("details")!;

    const controller = connectController({
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

    controller.dispose();
  });

  test("handles keyboard navigation (ArrowUp, ArrowDown, Escape)", () => {
    const onEscape = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      onEscape,
    });

    // ArrowDown collapses to minimized
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(controller.isMinimized()).toBe(true);

    // ArrowUp while minimized restores to default (DRAWER_DEFAULT_DVH)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(controller.isMinimized()).toBe(false);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_DEFAULT_DVH}dvh`
    );

    // ArrowUp while open expands to expandedDvh (DRAWER_EXPANDED_DVH)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_EXPANDED_DVH}dvh`
    );

    // Escape calls onEscape
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("suppresses synthetic <summary> click when dragged", () => {
    document.body.innerHTML = `
      <details id="drawer" class="drawer" open>
        <summary id="handle" class="drawer-bar">Handle</summary>
        <div>Content</div>
      </details>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const summaryHandle = document.getElementById("handle")!;

    const controller = connectController({
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

    controller.dispose();
  });

  /**
   * Pins the viewport read out of the move hot path.
   *
   * `window.innerHeight` is layout-dependent, so reading it per `pointermove`
   * flushes pending layout — and the move handler writes `--drawer-height`
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
    const controller = connectController({ drawer, handle });

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
      expect(drawer.style.getPropertyValue("--drawer-height")).toBeTruthy();

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
      controller.dispose();
    }
  });

  test("filter ignores pointerdown on specified elements", () => {
    const controller = connectController({
      drawer,
      handle,
      filter: (e) => {
        if (e.target instanceof Element && e.target.closest(".drawer-close")) {
          return false;
        }
        return true;
      },
    });

    const closeBtn = drawer.querySelector(".drawer-close")!;
    closeBtn.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 300,
        pointerId: 1,
      })
    );

    // Should not have entered active drag state
    expect(handle.classList.contains("is-dragging")).toBe(false);

    controller.dispose();
  });

  test("dispose() removes all listeners cleanly and connect() preserves preferredDvh", () => {
    const onEscape = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      layoutElement,
      onEscape,
    });

    controller.restore(72);
    expect(controller.getPreferredDvh()).toBe(72);

    controller.dispose();

    // After dispose, keydown should no longer invoke onEscape
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).not.toHaveBeenCalled();

    // Reconnecting preserves preferredDvh and re-binds listeners
    controller.connect();
    expect(controller.getPreferredDvh()).toBe(72);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).toHaveBeenCalledTimes(1);

    controller.dispose();
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
     * `.drawer.is-dragging` (core/drawer.css) and, for the reader,
     * `.reader-dict-panel.is-dragging` (reader/reader.css). Both select the
     * *panel*, but the handle is a child of it, so marking only the handle leaves
     * both rules dead and the drawer eases toward the pointer for the whole drag.
     */
    test("marks the drawer itself, not only the handle, while dragging", () => {
      const controller = connectController({ drawer, handle });

      expect(drawer.classList.contains("is-dragging")).toBe(false);

      pointerDown(handle);

      expect(drawer.classList.contains("is-dragging")).toBe(true);
      expect(handle.classList.contains("is-dragging")).toBe(true);

      controller.dispose();
    });

    test("clears the drawer marker on pointerup", () => {
      const controller = connectController({ drawer, handle });

      pointerDown(handle);
      pointerEvent(handle, "pointerup");

      expect(drawer.classList.contains("is-dragging")).toBe(false);
      expect(handle.classList.contains("is-dragging")).toBe(false);

      controller.dispose();
    });

    test("clears the drawer marker on pointercancel", () => {
      const controller = connectController({ drawer, handle });

      pointerDown(handle);
      pointerEvent(handle, "pointercancel");

      expect(drawer.classList.contains("is-dragging")).toBe(false);
      expect(handle.classList.contains("is-dragging")).toBe(false);

      controller.dispose();
    });

    // Without this, a drawer torn down mid-drag keeps `transition: none` forever.
    test("clears the drawer marker when destroyed mid-drag", () => {
      const controller = connectController({ drawer, handle });

      pointerDown(handle);
      expect(drawer.classList.contains("is-dragging")).toBe(true);

      controller.dispose();

      expect(drawer.classList.contains("is-dragging")).toBe(false);
      expect(handle.classList.contains("is-dragging")).toBe(false);
      expect(document.body.classList.contains("resizing-drawer")).toBe(false);
    });

    test("does not mark the drawer when the drag is filtered out", () => {
      const controller = connectController({
        drawer,
        handle,
        filter: (e) =>
          !(e.target instanceof Element && e.target.closest(".drawer-close")),
      });

      pointerDown(drawer.querySelector(".drawer-close")!);

      expect(drawer.classList.contains("is-dragging")).toBe(false);
      expect(handle.classList.contains("is-dragging")).toBe(false);

      controller.dispose();
    });

    test("toggles the body resizing class across the drag", () => {
      const controller = connectController({ drawer, handle });

      pointerDown(handle);
      expect(document.body.classList.contains("resizing-drawer")).toBe(true);

      pointerEvent(handle, "pointerup");
      expect(document.body.classList.contains("resizing-drawer")).toBe(false);

      controller.dispose();
    });
  });
});
