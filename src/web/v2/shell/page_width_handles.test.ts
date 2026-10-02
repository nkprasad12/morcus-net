/**
 * @jest-environment jsdom
 */

import {
  KEY_STEP_PX,
  pageWidthLabel,
} from "@/web/v2/shell/page_width_handles.client";
import { renderPageWidthHandles } from "@/web/v2/shell/page_width.server";
import {
  GLOBAL_SETTINGS_KEY,
  settingsStore,
} from "@/web/v2/core/settings.client";
import { PREPAINT_KEY } from "@/web/v2/core/prepaint.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

const root = document.documentElement;
const VIEWPORT = 2000;

let columnWidth = 1400;
let rafQueue: FrameRequestCallback[] = [];

function flushFrames() {
  const queue = rafQueue;
  rafQueue = [];
  for (const cb of queue) cb(0);
}

function mountPage(): {
  column: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  host: HTMLElement;
} {
  document.body.className = "body-reader";
  document.body.innerHTML = `
    <header class="app-bar"><div class="app-bar-inner"></div></header>
    <div class="container container-reader"><main></main></div>
    ${renderPageWidthHandles("reader")}
  `;
  const column = document.querySelector<HTMLElement>(".container")!;
  column.getBoundingClientRect = () => ({ width: columnWidth } as DOMRect);
  return {
    column,
    host: document.querySelector<HTMLElement>("morcus-page-width")!,
    left: document.querySelector<HTMLElement>(
      '.page-handle[data-side="left"]'
    )!,
    right: document.querySelector<HTMLElement>(
      '.page-handle[data-side="right"]'
    )!,
  };
}

function pointer(type: string, el: HTMLElement, clientX: number) {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX,
      clientY: 300,
      pointerId: 1,
    })
  );
}

function key(el: HTMLElement, k: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key: k,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(e);
  return e;
}

function savedPrepaint(): Record<string, string> {
  return JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "{}");
}

beforeAll(() => {
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    get: () => VIEWPORT,
  });
});

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("style");
  columnWidth = 1400;
  rafQueue = [];
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("pageWidthLabel", () => {
  test("labels default, full and custom widths", () => {
    expect(pageWidthLabel(undefined, 1400)).toBe("Default (1400px)");
    expect(pageWidthLabel(1400, 1400)).toBe("Default (1400px)");
    expect(pageWidthLabel("full", 1400)).toBe("Full width");
    expect(pageWidthLabel(1234, 1400)).toBe("1234px");
  });
});

describe("<morcus-page-width>", () => {
  test("upgrades and sets ARIA from the saved width", () => {
    localStorage.setItem(
      GLOBAL_SETTINGS_KEY,
      JSON.stringify({ readerWidth: 1234 })
    );
    const { host, left, right } = mountPage();
    expect(host.hasAttribute("data-upgraded")).toBe(true);
    for (const h of [left, right]) {
      expect(h.getAttribute("aria-valuenow")).toBe("1234");
      expect(h.getAttribute("aria-valuemin")).toBe("720");
      expect(h.getAttribute("aria-valuemax")).toBe(String(VIEWPORT));
      expect(h.getAttribute("aria-valuetext")).toBe("1234px");
    }
    // Heals the pre-paint snapshot on connect.
    expect(savedPrepaint()["--reader-page-max"]).toBe("1234px");
  });

  test("dragging the right edge grows symmetrically, writes live, persists on release only", () => {
    const { column, right } = mountPage();
    const appBar = document.querySelector<HTMLElement>(".app-bar-inner")!;

    pointer("pointerdown", right, 1700);
    expect(document.body.classList.contains("resizing-page")).toBe(true);
    pointer("pointermove", right, 1750); // +50 → +100
    // rAF-throttled: nothing written until the frame.
    expect(column.style.getPropertyValue("--page-max")).toBe("");
    flushFrames();
    expect(column.style.getPropertyValue("--page-max")).toBe("1500px");
    expect(appBar.style.getPropertyValue("--page-max")).toBe("1500px");
    expect(right.getAttribute("aria-valuenow")).toBe("1500");
    // Nothing persisted mid-drag.
    expect(settingsStore.get().readerWidth).toBeUndefined();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");

    pointer("pointerup", right, 1750);
    expect(document.body.classList.contains("resizing-page")).toBe(false);
    expect(settingsStore.get().readerWidth).toBe(1500);
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("1500px");
    expect(savedPrepaint()["--reader-page-max"]).toBe("1500px");
    // Inline values are dropped once :root has the width.
    expect(column.style.getPropertyValue("--page-max")).toBe("");
  });

  test("dragging the left edge outward also grows the column", () => {
    const { left } = mountPage();
    pointer("pointerdown", left, 300);
    pointer("pointermove", left, 250); // -50 on the left → +100
    pointer("pointerup", left, 250);
    expect(settingsStore.get().readerWidth).toBe(1500);
  });

  test("clamps to the minimum", () => {
    const { right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1000);
    pointer("pointerup", right, 1000);
    expect(settingsStore.get().readerWidth).toBe(720);
  });

  test("dragging to the viewport width saves full", () => {
    const { right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 2100);
    pointer("pointerup", right, 2100);
    expect(settingsStore.get().readerWidth).toBe("full");
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("100vw");
  });

  test("snaps to a preset, and snapping to the default clears the setting", () => {
    const { right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1700 + 142); // 1684 → Wide (1680)
    pointer("pointerup", right, 1700 + 142);
    expect(settingsStore.get().readerWidth).toBe(1680);

    columnWidth = 1680;
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1700 - 135); // 1410 → Default (1400)
    pointer("pointerup", right, 1700 - 135);
    expect(settingsStore.get().readerWidth).toBeUndefined();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
  });

  test("a click without a move saves nothing", () => {
    const { right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointerup", right, 1700);
    expect(localStorage.getItem(GLOBAL_SETTINGS_KEY)).toBeNull();
  });

  test("a cancelled drag reverts and saves nothing", () => {
    const { column, right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1800);
    flushFrames();
    pointer("pointercancel", right, 1800);
    expect(column.style.getPropertyValue("--page-max")).toBe("");
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("arrow keys step outward-grows / inward-shrinks per side", () => {
    const { left, right } = mountPage();
    const e = key(right, "ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    expect(settingsStore.get().readerWidth).toBe(1400 + KEY_STEP_PX);

    columnWidth = 1500;
    key(left, "ArrowRight"); // inward on the left edge shrinks
    expect(settingsStore.get().readerWidth).toBe(1500 - KEY_STEP_PX);

    columnWidth = 1500;
    key(left, "ArrowLeft");
    expect(settingsStore.get().readerWidth).toBe(1500 + KEY_STEP_PX);
  });

  test("Home goes to the minimum, End to full", () => {
    const { right } = mountPage();
    key(right, "Home");
    expect(settingsStore.get().readerWidth).toBe(720);
    expect(right.getAttribute("aria-valuenow")).toBe("720");
    key(right, "End");
    expect(settingsStore.get().readerWidth).toBe("full");
    expect(right.getAttribute("aria-valuenow")).toBe(String(VIEWPORT));
    expect(right.getAttribute("aria-valuetext")).toBe("Full width");
  });

  test("Enter, Escape and double-click reset to the default", () => {
    const { right } = mountPage();
    for (const reset of [
      () => key(right, "Enter"),
      () => key(right, "Escape"),
      () => right.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    ]) {
      key(right, "Home");
      expect(settingsStore.get().readerWidth).toBe(720);
      reset();
      expect(settingsStore.get().readerWidth).toBeUndefined();
      expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
      expect(right.getAttribute("aria-valuenow")).toBe("1400");
    }
  });

  test("other keys are left alone", () => {
    const { right } = mountPage();
    expect(key(right, "Tab").defaultPrevented).toBe(false);
    expect(localStorage.getItem(GLOBAL_SETTINGS_KEY)).toBeNull();
  });

  test("focus refreshes ARIA after the width changed elsewhere", () => {
    const { right } = mountPage();
    localStorage.setItem(
      GLOBAL_SETTINGS_KEY,
      JSON.stringify({ readerWidth: 1111 })
    );
    right.dispatchEvent(new FocusEvent("focus"));
    expect(right.getAttribute("aria-valuenow")).toBe("1111");
  });
});

describe("<morcus-page-width> on a dictionary entry with the rail", () => {
  function mountDict() {
    document.body.className = "body-dict";
    document.body.innerHTML = `
      <header class="app-bar"><div class="app-bar-inner"></div></header>
      <div class="container"><main>
        <div class="results-layout has-toc">
          <aside class="drawer drawer-toc" style="position: sticky"></aside>
        </div>
      </main></div>
      ${renderPageWidthHandles("dict")}
    `;
    const container = document.querySelector<HTMLElement>(".container")!;
    // Column 900 + rail 260 + 40 gap.
    container.getBoundingClientRect = () => ({ width: 1200 } as DOMRect);
    document.querySelector<HTMLElement>(".drawer-toc")!.getBoundingClientRect =
      () => ({ width: 260 } as DOMRect);
    return document.querySelector<HTMLElement>(
      '.page-handle[data-side="right"]'
    )!;
  }

  test("drags and steps the column, not the widened container", () => {
    const right = mountDict();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1700 + 50);
    pointer("pointerup", right, 1700 + 50);
    expect(settingsStore.get().dictWidth).toBe(1000);
    expect(root.style.getPropertyValue("--dict-page-max")).toBe("1000px");

    key(right, "ArrowRight");
    // Mock still measures 1200 → column 900, + one step.
    expect(settingsStore.get().dictWidth).toBe(900 + KEY_STEP_PX);
  });
});
