/**
 * @jest-environment jsdom
 */

import {
  computeMaxSplitWidth,
  DEFAULT_SPLIT_WIDTH,
  MAX_SPLIT_WIDTH,
  MIN_SPLIT_WIDTH,
  MIN_TEXT_PANEL_WIDTH,
  READER_DICT_WIDTH_STORAGE_KEY,
  ReaderLayoutController,
} from "@/web/v2/reader/reader_layout.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

describe("computeMaxSplitWidth", () => {
  test("caps at MAX_SPLIT_WIDTH when container is sufficiently wide", () => {
    // 1400 - 320 = 1080 > 800
    expect(computeMaxSplitWidth(1400)).toBe(MAX_SPLIT_WIDTH);
    // 1120 - 320 = 800
    expect(computeMaxSplitWidth(1120)).toBe(MAX_SPLIT_WIDTH);
  });

  test("reserves MIN_TEXT_PANEL_WIDTH for reading passage when container is medium", () => {
    expect(MIN_TEXT_PANEL_WIDTH).toBe(320);
    // 800 - 320 = 480
    expect(computeMaxSplitWidth(800)).toBe(800 - MIN_TEXT_PANEL_WIDTH);
    // 900 - 320 = 580
    expect(computeMaxSplitWidth(900)).toBe(900 - MIN_TEXT_PANEL_WIDTH);
  });

  test("floors at MIN_SPLIT_WIDTH when container is narrow", () => {
    // 500 - 320 = 180 < 300
    expect(computeMaxSplitWidth(500)).toBe(MIN_SPLIT_WIDTH);
    // 300 - 320 = -20 < 300
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
          <div class="reader-splitter-handle"></div>
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
    expect(controller.splitLayout?.style.getPropertyValue("--dict-width")).toBe(
      "520px"
    );
    expect(controller.splitter?.getAttribute("aria-valuenow")).toBe("520");

    controller.dispose();
  });

  test("ignores invalid or out-of-bounds widths in localStorage", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "150"); // < 300
    let controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(420);
    expect(controller.splitLayout?.style.getPropertyValue("--dict-width")).toBe(
      ""
    );
    controller.dispose();

    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "1200"); // > 900
    controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(420);
    controller.dispose();

    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "not-a-number");
    controller = connectController({ root: container });
    expect(controller.getWidth()).toBe(420);
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

    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("480px");
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

    // Drag left by 200px (420 + 200 = 620, should clamp to 480)
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 600,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("480px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("480");

    // Drag right by 300px (420 - 300 = 120, should clamp to MIN_SPLIT_WIDTH = 300)
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 1100,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("300px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("300");

    splitter.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBe("300");

    controller.dispose();
  });

  test("double-clicking the splitter resets width and clears localStorage", () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "560");
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;
    const splitter = controller.splitter!;

    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("560px");

    splitter.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("");
    expect(splitter.getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_SPLIT_WIDTH)
    );
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    controller.dispose();
  });

  test("keyboard navigation adjusts width and respects bounds", () => {
    const controller = connectController({ root: container });
    const splitLayout = controller.splitLayout!;
    const splitter = controller.splitter!;

    jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    // ArrowLeft: 420 + 24 = 444
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("444px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("444");
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBe("444");

    // ArrowRight: 444 - 24 = 420
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("420px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("420");

    // Home: collapses to MIN_SPLIT_WIDTH (300)
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("300px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("300");

    // End: expands to max allowable (1200 container -> max 800)
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("800px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("800");

    // Escape resets to default
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("");
    expect(splitter.getAttribute("aria-valuenow")).toBe(
      String(DEFAULT_SPLIT_WIDTH)
    );
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    controller.dispose();
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

    jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    controller.dispose();

    // Keydown after dispose does not modify layout
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("");
    expect(localStorage.getItem(READER_DICT_WIDTH_STORAGE_KEY)).toBeNull();

    // Reconnecting re-binds keyboard listener
    controller.connect();
    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("444px");
    controller.dispose();
  });
});
