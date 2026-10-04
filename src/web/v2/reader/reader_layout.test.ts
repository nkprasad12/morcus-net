/**
 * @jest-environment jsdom
 */

import {
  computeMaxSplitWidth,
  DEFAULT_SPLIT_WIDTH,
  SPLIT_CHROME_WIDTH,
  MIN_SPLIT_WIDTH,
  MIN_TEXT_PANEL_WIDTH,
  READER_DICT_WIDTH_STORAGE_KEY,
  ReaderLayoutController,
} from "@/web/v2/reader/reader_layout.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

describe("computeMaxSplitWidth", () => {
  const RESERVED = MIN_TEXT_PANEL_WIDTH + SPLIT_CHROME_WIDTH; // 342

  test("has no fixed cap on wide containers", () => {
    expect(computeMaxSplitWidth(1400)).toBe(1400 - RESERVED);
    expect(computeMaxSplitWidth(2150)).toBe(2150 - RESERVED);
  });

  test("reserves the passage minimum plus splitter chrome", () => {
    expect(MIN_TEXT_PANEL_WIDTH).toBe(320);
    expect(SPLIT_CHROME_WIDTH).toBe(22);
    expect(computeMaxSplitWidth(800)).toBe(800 - RESERVED);
    expect(computeMaxSplitWidth(900)).toBe(900 - RESERVED);
  });

  test("floors at MIN_SPLIT_WIDTH when container is narrow", () => {
    // 600 - 342 = 258 < 300
    expect(computeMaxSplitWidth(600)).toBe(MIN_SPLIT_WIDTH);
    expect(computeMaxSplitWidth(300)).toBe(MIN_SPLIT_WIDTH);
  });
});

describe("ReaderLayoutController", () => {
  let container: HTMLDivElement;

  function createLayoutFixture(): HTMLDivElement {
    const div = document.createElement("div");
    div.innerHTML = `
      <div class="reader-split-layout reader-layout-empty">
        <section class="reader-text-panel">
          <article class="reader-passage">Text passage</article>
        </section>
        <div class="reader-splitter"
             role="separator"
             tabindex="0"
             aria-orientation="vertical"
             aria-valuemin="300"
             aria-valuemax="750"
             aria-valuenow="420">
          <div class="resize-grip"></div>
        </div>
        <aside class="reader-dict-panel">
          <div class="reader-sheet-bar">Header</div>
        </aside>
      </div>
    `;
    document.body.appendChild(div);
    return div;
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    container = createLayoutFixture();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  function connectController(
    options: ConstructorParameters<typeof ReaderLayoutController>[0]
  ): ReaderLayoutController {
    const controller = new ReaderLayoutController(options);
    controller.connect();
    return controller;
  }

  test("gracefully handles missing elements without throwing", () => {
    const emptyDiv = document.createElement("div");
    const controller = connectController({ root: emptyDiv });

    expect(controller.splitter).toBeNull();
    expect(controller.splitLayout).toBeNull();
    expect(controller.dictPanel).toBeNull();
    expect(controller.getWidth()).toBe(DEFAULT_SPLIT_WIDTH);

    expect(() => {
      controller.setWidth(500);
      controller.resetWidth();
      controller.setActive(true);
      controller.setActive(false);
      controller.dispose();
    }).not.toThrow();
  });

  test("resolves layout elements from root container and restores default state", () => {
    const controller = connectController({ root: container });

    expect(controller.splitLayout).toBe(
      container.querySelector(".reader-split-layout")
    );
    expect(controller.splitter).toBe(
      container.querySelector(".reader-splitter")
    );
    expect(controller.dictPanel).toBe(
      container.querySelector(".reader-dict-panel")
    );
    expect(controller.getWidth()).toBe(420);

    controller.dispose();
  });

  test("hydrates valid saved width from localStorage on initialization", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "520");
    const controller = connectController({ root: container });

    expect(controller.getWidth()).toBe(520);
    expect(controller.dictPanel?.style.getPropertyValue("--dict-width")).toBe(
      "520px"
    );
    expect(controller.splitter?.getAttribute("aria-valuenow")).toBe("520");

    controller.dispose();
  });

  test("ignores invalid or too-small widths in localStorage", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "150"); // < 300
    let controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(420);
    expect(controller.dictPanel?.style.getPropertyValue("--dict-width")).toBe(
      ""
    );
    controller.dispose();

    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "not-a-number");
    controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(420);
    controller.dispose();
  });

  test("restores large saved widths from wide windows (CSS clamps them)", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "1200");
    const controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(1200);
    expect(controller.dictPanel?.style.getPropertyValue("--dict-width")).toBe(
      "1200px"
    );
    controller.dispose();
  });

  test("updates --dict-width and aria-valuenow with zero layout reads during pointer drag", () => {
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;
    const splitter = controller.splitter!;
    const dictPanel = controller.dictPanel!;

    const splitSpy = jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);
    const dictSpy = jest
      .spyOn(dictPanel, "getBoundingClientRect")
      .mockReturnValue({ width: 420 } as DOMRect);

    // 1. Pointerdown (drag start) measures container and panel
    splitter.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 800,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(splitSpy).toHaveBeenCalledTimes(1);
    expect(dictSpy).toHaveBeenCalledTimes(1);
    splitSpy.mockClear();
    dictSpy.mockClear();

    // 2. Pointermove: dragging left by 60px expands dict panel from 420 to 480
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 740,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("480px");
    // Inherited custom property: never on the split layout, or every move
    // restyles the whole passage.
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("");
    expect(splitter.getAttribute("aria-valuenow")).toBe("480");

    // CRITICAL: Verify zero layout reads occurred during move
    expect(splitSpy).not.toHaveBeenCalled();
    expect(dictSpy).not.toHaveBeenCalled();

    // 3. Pointerup persists width
    splitter.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 740,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBe("480");

    splitSpy.mockRestore();
    dictSpy.mockRestore();
    controller.dispose();
  });

  test("clamps width to computed max when dragging beyond allowable bounds", () => {
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;
    const splitter = controller.splitter!;
    const dictPanel = controller.dictPanel!;

    // Container width 800 -> max split width = 800 - 320 = 480
    jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 800 } as DOMRect);
    jest
      .spyOn(dictPanel, "getBoundingClientRect")
      .mockReturnValue({ width: 420 } as DOMRect);

    splitter.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 800,
        clientY: 300,
        pointerId: 1,
      })
    );

    // Drag left by 200px (420 + 200 = 620, should clamp to 800 - 342 = 458)
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 600,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("458px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("458");
    expect(splitter.getAttribute("aria-valuemax")).toBe("458");

    // Drag right by 300px (420 - 300 = 120, should clamp to MIN_SPLIT_WIDTH = 300)
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 1100,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("300px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("300");

    splitter.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBe("300");

    controller.dispose();
  });

  test("double-clicking the splitter resets width and clears localStorage", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "560");
    const controller = connectController({ root: container });
    const dictPanel = controller.dictPanel!;
    const splitter = controller.splitter!;

    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("560px");

    splitter.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("");
    expect(splitter.getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_SPLIT_WIDTH)
    );
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    controller.dispose();
  });

  test("keyboard navigation adjusts width and respects bounds", () => {
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;
    const dictPanel = controller.dictPanel!;
    const splitter = controller.splitter!;

    jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    // ArrowLeft: 420 + 24 = 444
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("444px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("444");
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBe("444");

    // ArrowRight: 444 - 24 = 420
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("420px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("420");

    // Home: collapses to MIN_SPLIT_WIDTH (300)
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("300px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("300");

    // End: expands to max allowable (1200 container -> 1200 - 342 = 858;
    // no fixed cap)
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("858px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("858");
    expect(splitter.getAttribute("aria-valuemax")).toBe("858");

    // Escape resets to default, and is consumed so outer overlays ignore it
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    splitter.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("");
    expect(splitter.getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_SPLIT_WIDTH)
    );
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    controller.dispose();
  });

  describe("pre-paint recording", () => {
    const root = document.documentElement;
    const rootWidth = () => root.style.getPropertyValue("--dict-width");
    const snapshotWidth = (): unknown =>
      JSON.parse(localStorage.getItem("morcus_prepaint") ?? "{}")[
        "--dict-width"
      ];

    afterEach(() => root.removeAttribute("style"));

    function setUp() {
      const controller = connectController({ root: container });
      jest
        .spyOn(controller.splitLayout!, "getBoundingClientRect")
        .mockReturnValue({ width: 1200 } as DOMRect);
      jest
        .spyOn(controller.dictPanel!, "getBoundingClientRect")
        .mockReturnValue({ width: 420 } as DOMRect);
      return controller;
    }

    test("connect re-records the saved width without writing <html>", () => {
      localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "512");
      const controller = setUp();
      expect(snapshotWidth()).toBe("512px");
      expect(rootWidth()).toBe("");
      controller.dispose();
    });

    test("connect with no saved width clears a stale <html> value", () => {
      root.style.setProperty("--dict-width", "600px");
      localStorage.setItem(
        "morcus_prepaint",
        JSON.stringify({ "--dict-width": "600px" })
      );
      const controller = setUp();
      expect(rootWidth()).toBe("");
      expect(snapshotWidth()).toBeUndefined();
      controller.dispose();
    });

    test("drag end records the width without writing <html>", () => {
      const controller = setUp();
      const splitter = controller.splitter!;
      splitter.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          clientX: 800,
          clientY: 300,
          pointerId: 1,
        })
      );
      splitter.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 740,
          clientY: 300,
          pointerId: 1,
        })
      );
      splitter.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      expect(snapshotWidth()).toBe("480px");
      expect(rootWidth()).toBe("");
      controller.dispose();
    });

    test("keyboard steps record the width without writing <html>", () => {
      const controller = setUp();
      const splitter = controller.splitter!;
      splitter.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft" })
      );
      expect(snapshotWidth()).toBe("444px");
      splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
      expect(snapshotWidth()).toBe("858px");
      expect(rootWidth()).toBe("");
      controller.dispose();
    });

    test("resetWidth removes the width from <html> and the snapshot", () => {
      localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "512");
      // As the critical script would have, before first paint.
      root.style.setProperty("--dict-width", "512px");
      const controller = setUp();
      controller.splitter!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft" })
      );
      expect(snapshotWidth()).toBe("536px");
      // <html> keeps the older value; the panel's inline one wins.
      expect(rootWidth()).toBe("512px");

      controller.splitter!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" })
      );
      expect(rootWidth()).toBe("");
      expect(snapshotWidth()).toBeUndefined();
      expect(controller.dictPanel!.style.getPropertyValue("--dict-width")).toBe(
        ""
      );
      controller.dispose();
    });
  });

  test("setActive toggles active and empty CSS classes on splitLayout", () => {
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;

    expect(splitLayout.classList.contains("reader-layout-empty")).toBe(true);
    expect(splitLayout.classList.contains("reader-layout-active")).toBe(false);

    controller.setActive(true);
    expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);
    expect(splitLayout.classList.contains("reader-layout-empty")).toBe(false);

    controller.setActive(false);
    expect(splitLayout.classList.contains("reader-layout-empty")).toBe(true);
    expect(splitLayout.classList.contains("reader-layout-active")).toBe(false);

    controller.dispose();
  });

  test("calling dispose unbinds all listeners and connect re-registers them", () => {
    const controller = connectController({ root: container });
    const splitter = controller.splitter!;
    const splitLayout = controller.splitLayout!;
    const dictPanel = controller.dictPanel!;

    jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    controller.dispose();

    // Keydown after dispose does not modify layout
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("");
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    // Reconnecting re-binds keyboard listener
    controller.connect();
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("444px");
    controller.dispose();
  });

  describe("dictionary iframe freeze during drags", () => {
    const frozen = (c: ReaderLayoutController) =>
      c.dictPanel!.style.getPropertyValue("--dict-frozen-width");

    function setUp(withIframe: boolean) {
      const controller = connectController({ root: container });
      jest
        .spyOn(controller.splitLayout!, "getBoundingClientRect")
        .mockReturnValue({ width: 1200 } as DOMRect);
      jest
        .spyOn(controller.dictPanel!, "getBoundingClientRect")
        .mockReturnValue({ width: 420 } as DOMRect);
      if (withIframe) {
        const iframe = document.createElement("iframe");
        iframe.className = "dict-iframe";
        controller.dictPanel!.appendChild(iframe);
        jest
          .spyOn(iframe, "getBoundingClientRect")
          .mockReturnValue({ width: 404 } as DOMRect);
      }
      return controller;
    }

    function down(splitter: HTMLElement) {
      splitter.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          clientX: 800,
          clientY: 300,
          pointerId: 1,
        })
      );
      splitter.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: 740,
          clientY: 300,
          pointerId: 1,
        })
      );
    }

    test("drag start freezes and drag end releases the iframe width", () => {
      const controller = setUp(true);
      const splitter = controller.splitter!;
      down(splitter);
      expect(frozen(controller)).toBe("404px");

      splitter.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      expect(frozen(controller)).toBe("");
      expect(controller.dictPanel!.style.getPropertyValue("--dict-width")).toBe(
        "480px"
      );
      controller.dispose();
    });

    test("cancelled drag releases the frozen width", () => {
      const controller = setUp(true);
      const splitter = controller.splitter!;
      down(splitter);
      expect(frozen(controller)).toBe("404px");
      splitter.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 1 })
      );
      expect(frozen(controller)).toBe("");
      controller.dispose();
    });

    test("disposing mid-drag releases the frozen width", () => {
      const controller = setUp(true);
      down(controller.splitter!);
      expect(frozen(controller)).toBe("404px");
      controller.dispose();
      expect(frozen(controller)).toBe("");
    });

    test("does nothing without an iframe", () => {
      const controller = setUp(false);
      const setSpy = jest.spyOn(controller.dictPanel!.style, "setProperty");
      down(controller.splitter!);
      expect(setSpy).not.toHaveBeenCalledWith(
        "--dict-frozen-width",
        expect.anything()
      );
      expect(frozen(controller)).toBe("");
      controller.splitter!.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 1 })
      );
      controller.dispose();
    });

    test("keyboard resizing never freezes the iframe", () => {
      const controller = setUp(true);
      const setSpy = jest.spyOn(controller.dictPanel!.style, "setProperty");
      controller.splitter!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft" })
      );
      expect(setSpy).toHaveBeenCalledWith("--dict-width", "444px");
      expect(setSpy).not.toHaveBeenCalledWith(
        "--dict-frozen-width",
        expect.anything()
      );
      controller.dispose();
    });
  });
});
