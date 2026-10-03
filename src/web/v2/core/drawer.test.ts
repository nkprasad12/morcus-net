/**
 * @jest-environment jsdom
 */
import {
  DrawerController,
  DRAWER_DEFAULT_SVH,
  DRAWER_EXPANDED_SVH,
  DRAWER_FLOOR_SVH,
  DRAWER_MIN_HEIGHT,
  resolveDrawerSnapDecision,
  type DrawerSnapInput,
} from "@/web/v2/core/drawer.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

describe("DrawerController", () => {
  let drawer: HTMLElement;
  let handle: HTMLElement;
  let target: HTMLElement;

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
        <button id="target" class="back-to-top"></button>
      </div>
    `;
    drawer = document.getElementById("drawer")!;
    handle = document.getElementById("handle")!;
    target = document.getElementById("target")!;
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

  test("initializes with default options and tracks preferred svh", () => {
    const controller = connectController({
      drawer,
      handle,
      heightTargets: () => [target],
    });

    expect(controller.isMinimized()).toBe(false);
    expect(controller.getPreferredSvh()).toBe(DRAWER_DEFAULT_SVH);

    controller.dispose();
  });

  test("uses DRAWER_* constants when svh and height options are omitted", () => {
    const controller = connectController({
      drawer,
      handle,
      heightTargets: () => [target],
    });
    expect(controller.getPreferredSvh()).toBe(DRAWER_DEFAULT_SVH);
    controller.minimize();
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_MIN_HEIGHT}px`
    );
    // Floor clamp
    controller.restore(DRAWER_FLOOR_SVH - 5);
    expect(controller.getPreferredSvh()).toBe(DRAWER_FLOOR_SVH);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_FLOOR_SVH}svh`
    );
    // Expanded clamp
    controller.restore(DRAWER_EXPANDED_SVH + 10);
    expect(controller.getPreferredSvh()).toBe(DRAWER_EXPANDED_SVH);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_EXPANDED_SVH}svh`
    );
    controller.dispose();
  });

  test("minimize() updates styles, classes, ARIA, and invokes onMinimize callback", () => {
    const onMinimize = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      heightTargets: () => [target],
      minHeight: 54,
      onMinimize,
    });

    controller.minimize();

    expect(controller.isMinimized()).toBe(true);
    expect(drawer.classList.contains("drawer-minimized")).toBe(true);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("54px");
    expect(target.style.getPropertyValue("--drawer-height")).toBe("54px");
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    expect(onMinimize).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  test("restore() restores drawer height, updates classes, and invokes onRestore callback", () => {
    const onRestore = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      heightTargets: () => [target],
      defaultSvh: 48,
      onRestore,
    });

    controller.minimize();
    expect(controller.isMinimized()).toBe(true);

    controller.restore(65);

    expect(controller.isMinimized()).toBe(false);
    expect(drawer.classList.contains("drawer-minimized")).toBe(false);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("65svh");
    expect(target.style.getPropertyValue("--drawer-height")).toBe("65svh");
    expect(handle.getAttribute("aria-valuenow")).toBe("65");
    expect(controller.getPreferredSvh()).toBe(65);
    expect(onRestore).toHaveBeenCalledWith(65);

    controller.dispose();
  });

  test("restore() clamps target svh within [floorSvh, expandedSvh]", () => {
    const controller = connectController({
      drawer,
      handle,
      floorSvh: 20,
      expandedSvh: 80,
    });

    controller.restore(10); // Below floor
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("20svh");

    controller.restore(95); // Above expanded
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("80svh");

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

  test("adopts a <details> the user closed before upgrade (PH8)", () => {
    document.body.innerHTML = `
      <morcus-dict-toc id="drawer" class="drawer">
        <details>
          <summary id="handle" class="drawer-bar">Contents</summary>
          <div id="content">TOC items</div>
        </details>
      </morcus-dict-toc>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const controller = connectController({
      drawer: detailsDrawer,
      handle: document.getElementById("handle")!,
      minHeight: 54,
    });

    expect(detailsDrawer.classList.contains("drawer-minimized")).toBe(true);
    expect(detailsDrawer.style.getPropertyValue("--drawer-height")).toBe(
      "54px"
    );
    controller.dispose();
  });

  test("re-closes <details> on connect() when a minimized drawer had <details> opened while disposed", () => {
    document.body.innerHTML = `
      <morcus-dict-toc id="drawer" class="drawer">
        <details open>
          <summary id="handle" class="drawer-bar">Contents</summary>
          <div id="content">TOC items</div>
        </details>
      </morcus-dict-toc>
      <button id="target" class="back-to-top"></button>
    `;
    const detailsDrawer = document.getElementById("drawer")!;
    const detailsHandle = document.getElementById("handle")!;
    const detailsEl = detailsDrawer.querySelector("details")!;
    const backToTop = document.getElementById("target")!;

    const controller = connectController({
      drawer: detailsDrawer,
      handle: detailsHandle,
      heightTargets: () => [backToTop],
      minHeight: 28,
    });

    controller.restore(70);
    controller.minimize();
    expect(detailsEl.open).toBe(false);
    expect(detailsDrawer.classList.contains("drawer-minimized")).toBe(true);
    expect(detailsDrawer.style.getPropertyValue("--drawer-height")).toBe(
      "28px"
    );
    expect(backToTop.style.getPropertyValue("--drawer-height")).toBe("28px");

    // Simulate crossing to desktop: controller disposes and desktop rail forces <details open>
    controller.dispose();
    detailsEl.open = true;
    expect(backToTop.style.getPropertyValue("--drawer-height")).toBe("");

    // Simulate crossing back to mobile: controller reconnects
    controller.connect();
    expect(detailsEl.open).toBe(false);
    expect(detailsDrawer.classList.contains("drawer-minimized")).toBe(true);
    expect(controller.isMinimized()).toBe(true);
    expect(detailsDrawer.style.getPropertyValue("--drawer-height")).toBe(
      "28px"
    );
    expect(backToTop.style.getPropertyValue("--drawer-height")).toBe("28px");
    expect(detailsHandle.getAttribute("aria-valuenow")).toBe("0");

    // Tapping <summary> natively opens <details> and restores the prior 70svh height
    detailsEl.open = true;
    detailsEl.dispatchEvent(new Event("toggle"));
    expect(controller.isMinimized()).toBe(false);
    expect(detailsDrawer.classList.contains("drawer-minimized")).toBe(false);
    expect(detailsDrawer.style.getPropertyValue("--drawer-height")).toBe(
      "70svh"
    );
    expect(backToTop.style.getPropertyValue("--drawer-height")).toBe("70svh");

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

    // ArrowUp while minimized restores to default (DRAWER_DEFAULT_SVH)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(controller.isMinimized()).toBe(false);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_DEFAULT_SVH}svh`
    );

    // ArrowUp while open expands to expandedSvh (DRAWER_EXPANDED_SVH)
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe(
      `${DRAWER_EXPANDED_SVH}svh`
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
   * `100svh` (`measureSvh100()`) is layout-dependent, so reading it per `pointermove`
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

  test("dispose() removes all listeners cleanly and connect() preserves preferredSvh", () => {
    const onEscape = jest.fn();
    const controller = connectController({
      drawer,
      handle,
      heightTargets: () => [target],
      onEscape,
    });

    controller.restore(72);
    expect(controller.getPreferredSvh()).toBe(72);

    controller.dispose();

    // After dispose, keydown should no longer invoke onEscape
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onEscape).not.toHaveBeenCalled();

    // Reconnecting preserves preferredSvh and re-binds listeners
    controller.connect();
    expect(controller.getPreferredSvh()).toBe(72);
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
     * `.reader-dict-panel.is-dragging .dict-iframe` (src/web/v2/reader/reader_dict.css#L31-L34)
     * disables pointer events on the dictionary iframe mid-drag. It selects the panel,
     * and the handle is a child of it, so marking both ensures the iframe never captures
     * pointermove/pointerup events during a drag.
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

    test("leaves <body> classes alone across the drag", () => {
      const controller = connectController({ drawer, handle });
      const before = document.body.className;

      pointerDown(handle);
      expect(document.body.classList.contains("resizing-drawer")).toBe(false);
      expect(document.body.className).toBe(before);

      pointerEvent(handle, "pointerup");
      expect(document.body.className).toBe(before);

      controller.dispose();
    });

    test("reset() applies drawer-minimized, removes custom height from drawer and targets, and sets aria-valuenow to 0", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
        defaultSvh: 48,
        minHeight: 54,
      });

      controller.restore(70);
      expect(drawer.classList.contains("drawer-minimized")).toBe(false);
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("70svh");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("70svh");

      controller.reset();
      expect(drawer.classList.contains("drawer-minimized")).toBe(true);
      expect(controller.isMinimized()).toBe(true);
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("");
      expect(handle.getAttribute("aria-valuenow")).toBe("0");

      controller.dispose();
    });

    test("invokes onDragStart and restores height when dragged up after reset()", () => {
      const onDragStart = jest.fn();
      const onRestore = jest.fn();
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
        defaultSvh: 48,
        minHeight: 38,
        onDragStart,
        onRestore,
      });

      controller.reset();

      pointerDown(handle);
      expect(onDragStart).toHaveBeenCalledTimes(1);
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("38px");

      // Drag up by 300px (from 300 to 0 -> height 338px)
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 0,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("338px");

      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 0,
          pointerId: 1,
        })
      );
      expect(onRestore).toHaveBeenCalled();
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("44svh");

      controller.dispose();
    });
  });

  describe("100svh drag inference and tap early-return", () => {
    let origInnerHeight: PropertyDescriptor | undefined;
    let origClientHeight: PropertyDescriptor | undefined;

    beforeEach(() => {
      origInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
      origClientHeight = Object.getOwnPropertyDescriptor(
        document.documentElement,
        "clientHeight"
      );
      // Simulate mobile URL bar retracted: 100dvh = 800px, 100svh = 700px
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 800,
      });
      Object.defineProperty(document.documentElement, "clientHeight", {
        configurable: true,
        value: 700,
      });
    });

    afterEach(() => {
      if (origInnerHeight) {
        Object.defineProperty(window, "innerHeight", origInnerHeight);
      }
      if (origClientHeight) {
        Object.defineProperty(
          document.documentElement,
          "clientHeight",
          origClientHeight
        );
      } else {
        delete (document.documentElement as { clientHeight?: number })
          .clientHeight;
      }
    });

    test("computes svh percentage from 100svh (700px) rather than 100dvh (800px) when dragging an open drawer", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
        defaultSvh: 48,
      });

      // Open drawer at 48svh = 336px (out of 700px)
      let mockedHeight = 336;
      drawer.getBoundingClientRect = jest.fn(
        () => ({ height: mockedHeight } as DOMRect)
      );

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 400,
          pointerId: 1,
        })
      );

      // Drag upward by 140px (336 + 140 = 476px -> 68% of 700px svh, vs 60% of 800px dvh)
      mockedHeight = 476;
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 260,
          pointerId: 1,
        })
      );
      expect(handle.getAttribute("aria-valuenow")).toBe("68");

      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 260,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("68svh");
      expect(controller.getPreferredSvh()).toBe(68);

      controller.dispose();
    });

    test("computes svh percentage from 100svh (700px) when dragging upward from minimized state", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
        minHeight: 54,
      });

      controller.minimize();
      expect(controller.isMinimized()).toBe(true);

      let mockedHeight = 54;
      drawer.getBoundingClientRect = jest.fn(
        () => ({ height: mockedHeight } as DOMRect)
      );

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 746,
          pointerId: 1,
        })
      );

      // Drag upward by 296px (54 + 296 = 350px -> 50% of 700px svh, vs 44% of 800px dvh)
      mockedHeight = 350;
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 450,
          pointerId: 1,
        })
      );
      expect(handle.getAttribute("aria-valuenow")).toBe("50");

      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 450,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("50svh");
      expect(controller.getPreferredSvh()).toBe(50);

      controller.dispose();
    });

    test("tap early-return on already-open drawer restores --drawer-height back to preferredSvh (not stuck in px)", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
        defaultSvh: 48,
      });

      controller.restore(65);
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("65svh");

      drawer.getBoundingClientRect = jest.fn(
        () => ({ height: 455 } as DOMRect)
      );

      // Pointerdown sets --drawer-height to 455px
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("455px");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("455px");

      // Tap release without drag (dy = 2 < 6) restores --drawer-height to 65svh
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 302,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("65svh");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("65svh");
      expect(controller.getPreferredSvh()).toBe(65);

      controller.dispose();
    });
  });

  describe("heightTargets", () => {
    function pageWideInline(): string[] {
      return [document.documentElement, document.body].map((el) =>
        el.style.getPropertyValue("--drawer-height")
      );
    }

    test("never writes --drawer-height inline on <html> or <body>", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
      });
      controller.minimize();
      expect(pageWideInline()).toEqual(["", ""]);
      controller.restore(60);
      expect(pageWideInline()).toEqual(["", ""]);
      controller.setHeight(200);
      expect(pageWideInline()).toEqual(["", ""]);

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
          button: 0,
        })
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
        })
      );
      expect(drawer.style.getPropertyValue("--drawer-height")).not.toBe("");
      expect(target.style.getPropertyValue("--drawer-height")).toBe(
        drawer.style.getPropertyValue("--drawer-height")
      );
      expect(pageWideInline()).toEqual(["", ""]);
      handle.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
        })
      );
      expect(pageWideInline()).toEqual(["", ""]);
      controller.dispose();
    });

    test("clears targets on reset()", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
      });
      controller.restore(70);
      expect(target.style.getPropertyValue("--drawer-height")).toBe("70svh");
      controller.reset();
      expect(target.style.getPropertyValue("--drawer-height")).toBe("");
      controller.dispose();
    });

    test("clears only the targets on dispose(); the drawer keeps its height", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
      });
      controller.setHeight(200);
      expect(target.style.getPropertyValue("--drawer-height")).toBe("200px");
      controller.dispose();
      expect(target.style.getPropertyValue("--drawer-height")).toBe("");
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("200px");
    });

    test("restore() -> dispose() -> connect() keeps the drawer's height and re-applies it to targets", () => {
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () => [target],
      });
      controller.restore(70);
      controller.dispose();
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("70svh");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("");

      controller.connect();
      expect(drawer.style.getPropertyValue("--drawer-height")).toBe("70svh");
      expect(target.style.getPropertyValue("--drawer-height")).toBe("70svh");
      expect(controller.getPreferredSvh()).toBe(70);
      expect(handle.getAttribute("aria-valuenow")).toBe("70");
      controller.dispose();
    });

    test("does not query heightTargets during pointermove", () => {
      const heightTargets = jest.fn(() => [target]);
      const controller = connectController({ drawer, handle, heightTargets });

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
          button: 0,
        })
      );
      heightTargets.mockClear();
      for (const clientY of [280, 260, 240]) {
        handle.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: 100,
            clientY,
            pointerId: 1,
          })
        );
      }
      expect(heightTargets).not.toHaveBeenCalled();
      expect(target.style.getPropertyValue("--drawer-height")).toBe(
        drawer.style.getPropertyValue("--drawer-height")
      );
      controller.dispose();
    });

    test("picks up targets created after construction at drag start", () => {
      target.remove();
      const controller = connectController({
        drawer,
        handle,
        heightTargets: () =>
          document.querySelectorAll<HTMLElement>(".back-to-top"),
      });
      const late = document.body.appendChild(document.createElement("button"));
      late.className = "back-to-top";

      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 100,
          clientY: 300,
          pointerId: 1,
          button: 0,
        })
      );
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 200,
          pointerId: 1,
        })
      );
      expect(late.style.getPropertyValue("--drawer-height")).not.toBe("");
      expect(late.style.getPropertyValue("--drawer-height")).toBe(
        drawer.style.getPropertyValue("--drawer-height")
      );
      controller.dispose();
    });
  });
});

describe("resolveDrawerSnapDecision", () => {
  const baseInput: DrawerSnapInput = {
    dy: 0,
    elapsedMs: 200,
    velocityY: 0,
    currentHeight: 400,
    winHeight: 800,
    floorSvh: 18,
    expandedSvh: 88,
  };

  test("tap detection: minimal movement (|dy| < 6) within 350ms resolves to tap", () => {
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 0,
        elapsedMs: 100,
      })
    ).toEqual({ action: "tap" });

    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 5.9,
        elapsedMs: 349,
      })
    ).toEqual({ action: "tap" });

    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: -5.9,
        elapsedMs: 50,
      })
    ).toEqual({ action: "tap" });
  });

  test("tap threshold not met if |dy| >= 6 or elapsedMs >= 350", () => {
    // Movement at or above 6px does not tap
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 6,
        elapsedMs: 100,
      })
    ).not.toEqual({ action: "tap" });

    // Duration >= 350ms does not tap
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 2,
        elapsedMs: 350,
      })
    ).not.toEqual({ action: "tap" });
  });

  test("fast flick down by velocityY > 0.75 with dy > 35 resolves to minimize", () => {
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 40,
        elapsedMs: 500, // vhPerSec would be (40/800)*(1000/500) = 0.1 <= 1.1
        velocityY: 0.8,
      })
    ).toEqual({ action: "minimize" });
  });

  test("fast flick down by vhPerSec > 1.1 with dy > 35 resolves to minimize", () => {
    // dy = 50, winHeight = 800, elapsedMs = 50ms => (50/800)*(1000/50) = 1.25 > 1.1
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 50,
        elapsedMs: 50,
        velocityY: 0.2, // low pointer velocity, but high average vhPerSec
      })
    ).toEqual({ action: "minimize" });
  });

  test("fast flick down suppressed if dy <= 35 (e.g. high velocity micro-jitter)", () => {
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 35,
        elapsedMs: 500, // avoid tap (>=350)
        velocityY: 1.5, // high velocity
      })
    ).toEqual({
      action: "restore",
      targetSvh: 50,
    });
  });

  test("fast flick up (negative dy / velocityY < 0) never resolves to minimize", () => {
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: -80,
        elapsedMs: 100,
        velocityY: -1.5,
        currentHeight: 480, // 480 / 800 = 60svh
      })
    ).toEqual({
      action: "restore",
      targetSvh: 60,
    });
  });

  test("slow drag into floor zone (currentSvh < floorSvh or currentHeight < 110) resolves to minimize", () => {
    // currentSvh < floorSvh (e.g. 100px / 800px = 13svh < 18svh)
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 200,
        elapsedMs: 800,
        velocityY: 0.1,
        currentHeight: 120, // 120/800 = 15svh < 18svh
      })
    ).toEqual({ action: "minimize" });

    // currentHeight < 110px even if currentSvh >= floorSvh (e.g. on small screen winHeight = 500)
    // 105px / 500px = 21svh >= 18svh, but height < 110
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 100,
        elapsedMs: 800,
        velocityY: 0.1,
        winHeight: 500,
        currentHeight: 105,
      })
    ).toEqual({ action: "minimize" });
  });

  test("normal drag releases snap to clamped svh between floorSvh and expandedSvh", () => {
    // Normal snap inside bounds: 400 / 800 = 50svh
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 10,
        elapsedMs: 400,
        velocityY: 0.1,
        currentHeight: 400,
      })
    ).toEqual({ action: "restore", targetSvh: 50 });

    // Clamped at expandedSvh: 750 / 800 = 94svh > 88svh
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: -200,
        elapsedMs: 400,
        velocityY: -0.2,
        currentHeight: 750,
      })
    ).toEqual({ action: "restore", targetSvh: 88 });

    // Clamped at floorSvh: 144 / 800 = 18svh (exactly floorSvh and >= 110px)
    expect(
      resolveDrawerSnapDecision({
        ...baseInput,
        dy: 100,
        elapsedMs: 500,
        velocityY: 0.05,
        currentHeight: 144,
      })
    ).toEqual({ action: "restore", targetSvh: 18 });
  });

  test("guards edge cases (elapsedMs <= 0, zero or negative winHeight)", () => {
    // elapsedMs <= 0 does not divide by zero or produce NaN
    const zeroElapsed = resolveDrawerSnapDecision({
      ...baseInput,
      dy: 20,
      elapsedMs: 0,
      velocityY: 0.1,
    });
    expect(zeroElapsed).toEqual({ action: "restore", targetSvh: 50 });

    // winHeight <= 0 uses safe divisor
    const zeroWinHeight = resolveDrawerSnapDecision({
      ...baseInput,
      dy: 20,
      elapsedMs: 400,
      velocityY: 0.1,
      winHeight: 0,
      currentHeight: 200,
    });
    // With safeWinHeight = 1, currentSvh = 20000, clamped to expandedSvh 88
    expect(zeroWinHeight).toEqual({ action: "restore", targetSvh: 88 });
  });
});
