/**
 * @jest-environment jsdom
 */

import {
  KEY_STEP_PX,
  liveContainerMaxWidth,
  pageWidthLabel,
} from "@/web/v2/shell/page_width_handles.client";
import { renderPageWidthHandles } from "@/web/v2/shell/page_width.server";
import {
  GLOBAL_SETTINGS_KEY,
  settingsStore,
} from "@/web/v2/core/state/settings.client";
import { PREPAINT_KEY } from "@/web/v2/core/dom/prepaint.client";
import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

const root = document.documentElement;
const VIEWPORT = 2000;

let columnWidth = 1400;
let rafQueue = new Map<number, FrameRequestCallback>();
let nextRafId = 1;

function flushFrames() {
  const queue = rafQueue;
  rafQueue = new Map();
  for (const cb of queue.values()) cb(0);
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

function key(el: HTMLElement, k: string, type = "keydown"): KeyboardEvent {
  const e = new KeyboardEvent(type, {
    key: k,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(e);
  return e;
}

/** A full key press: keydown, then keyup (which commits a step). */
function press(el: HTMLElement, k: string): KeyboardEvent {
  const e = key(el, k);
  key(el, k, "keyup");
  return e;
}

/** Every inline live value the handles may write, by element. */
function liveValues(host: HTMLElement) {
  const column = document.querySelector<HTMLElement>(".container")!;
  const appBar = document.querySelector<HTMLElement>(".app-bar-inner")!;
  return {
    columnMax: column.style.getPropertyValue("max-width"),
    columnVar: column.style.getPropertyValue("--page-max"),
    appBarMax: appBar.style.getPropertyValue("max-width"),
    appBarVar: appBar.style.getPropertyValue("--page-max"),
    hostVar: host.style.getPropertyValue("--page-max"),
  };
}

const NO_LIVE = {
  columnMax: "",
  columnVar: "",
  appBarMax: "",
  appBarVar: "",
  hostVar: "",
};

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
  rafQueue = new Map();
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    });
  jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id: number) => {
      rafQueue.delete(id);
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

describe("liveContainerMaxWidth", () => {
  // Mirrors `.container { max-width: var(--page-max) }` and, with the
  // dictionary rail, `calc(var(--page-max) + var(--dict-toc-w) + 40px)`,
  // where shell/page_width.css sets --page-extra to the added part. If this
  // fails, update those CSS rules and setLive together.
  test("adds --page-extra to the live width", () => {
    expect(liveContainerMaxWidth("1234px")).toBe(
      "calc(1234px + var(--page-extra, 0px))"
    );
    expect(liveContainerMaxWidth("100vw")).toBe(
      "calc(100vw + var(--page-extra, 0px))"
    );
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
    const { host, right } = mountPage();

    pointer("pointerdown", right, 1700);
    expect(document.body.classList.contains("resizing-page")).toBe(true);
    pointer("pointermove", right, 1750); // +50 → +100
    // rAF-throttled: nothing written until the frame.
    expect(liveValues(host)).toEqual(NO_LIVE);
    flushFrames();
    // Non-inherited max-width on the column and app bar row; the inherited
    // --page-max only on the handles' own element.
    expect(liveValues(host)).toEqual({
      columnMax: "calc(1500px + var(--page-extra, 0px))",
      columnVar: "",
      appBarMax: "1500px",
      appBarVar: "",
      hostVar: "1500px",
    });
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
    expect(liveValues(host)).toEqual(NO_LIVE);
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
    const { host, right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1800);
    flushFrames();
    expect(liveValues(host).columnMax).not.toBe("");
    pointer("pointercancel", right, 1800);
    expect(liveValues(host)).toEqual(NO_LIVE);
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("arrow keys step outward-grows / inward-shrinks per side", () => {
    const { left, right } = mountPage();
    const e = press(right, "ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    expect(settingsStore.get().readerWidth).toBe(1400 + KEY_STEP_PX);

    columnWidth = 1500;
    press(left, "ArrowRight"); // inward on the left edge shrinks
    expect(settingsStore.get().readerWidth).toBe(1500 - KEY_STEP_PX);

    columnWidth = 1500;
    press(left, "ArrowLeft");
    expect(settingsStore.get().readerWidth).toBe(1500 + KEY_STEP_PX);
  });

  test("Home goes to the minimum, End to full", () => {
    const { right } = mountPage();
    press(right, "Home");
    expect(settingsStore.get().readerWidth).toBe(720);
    expect(right.getAttribute("aria-valuenow")).toBe("720");
    press(right, "End");
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
      press(right, "Home");
      expect(settingsStore.get().readerWidth).toBe(720);
      reset();
      expect(settingsStore.get().readerWidth).toBeUndefined();
      expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
      expect(right.getAttribute("aria-valuenow")).toBe("1400");
    }
  });

  test("held keys step live and write :root only on keyup", () => {
    const { host, right } = mountPage();
    key(right, "ArrowRight");
    // Painted inline, ARIA updated, nothing on :root or saved yet.
    expect(liveValues(host)).toEqual({
      columnMax: `calc(${1400 + KEY_STEP_PX}px + var(--page-extra, 0px))`,
      columnVar: "",
      appBarMax: `${1400 + KEY_STEP_PX}px`,
      appBarVar: "",
      hostVar: `${1400 + KEY_STEP_PX}px`,
    });
    expect(right.getAttribute("aria-valuenow")).toBe(
      String(1400 + KEY_STEP_PX)
    );
    expect(right.getAttribute("aria-valuetext")).toBe(
      `${1400 + KEY_STEP_PX}px`
    );
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
    expect(settingsStore.get().readerWidth).toBeUndefined();

    // A key repeat measures the live column and steps again.
    columnWidth = 1400 + KEY_STEP_PX;
    key(right, "ArrowRight");
    expect(right.getAttribute("aria-valuenow")).toBe(
      String(1400 + 2 * KEY_STEP_PX)
    );
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");

    key(right, "ArrowRight", "keyup");
    expect(settingsStore.get().readerWidth).toBe(1400 + 2 * KEY_STEP_PX);
    expect(root.style.getPropertyValue("--reader-page-max")).toBe(
      `${1400 + 2 * KEY_STEP_PX}px`
    );
    expect(liveValues(host)).toEqual(NO_LIVE);
  });

  test("blur commits a step whose keyup never arrived", () => {
    const { host, right } = mountPage();
    key(right, "End");
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
    right.dispatchEvent(new FocusEvent("blur"));
    expect(settingsStore.get().readerWidth).toBe("full");
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("100vw");
    expect(liveValues(host)).toEqual(NO_LIVE);
  });

  test("a keyup or blur without a pending step saves nothing", () => {
    const { right } = mountPage();
    key(right, "Tab", "keyup");
    right.dispatchEvent(new FocusEvent("blur"));
    expect(localStorage.getItem(GLOBAL_SETTINGS_KEY)).toBeNull();
  });

  test("Escape mid-step resets at once and drops the pending step", () => {
    const { host, right } = mountPage();
    key(right, "Home");
    key(right, "Escape");
    expect(settingsStore.get().readerWidth).toBeUndefined();
    expect(liveValues(host)).toEqual(NO_LIVE);
    key(right, "Home", "keyup");
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("double-click mid-step resets and drops the pending step", () => {
    const { host, right } = mountPage();
    key(right, "Home");
    right.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(settingsStore.get().readerWidth).toBeUndefined();
    expect(liveValues(host)).toEqual(NO_LIVE);
    // The step's keyup and blur must not overwrite the reset.
    key(right, "Home", "keyup");
    right.dispatchEvent(new FocusEvent("blur"));
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("disconnecting mid-drag clears live values and drops the queued frame", () => {
    const { host, right } = mountPage();
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1750);
    flushFrames();
    expect(liveValues(host).columnMax).not.toBe("");
    pointer("pointermove", right, 1800); // queues another frame
    host.remove();
    expect(liveValues(host)).toEqual(NO_LIVE);
    flushFrames();
    expect(liveValues(host)).toEqual(NO_LIVE);
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("disconnecting mid-key-step clears live values and saves nothing", () => {
    const { host, right } = mountPage();
    key(right, "ArrowRight");
    expect(liveValues(host).columnMax).not.toBe("");
    host.remove();
    expect(liveValues(host)).toEqual(NO_LIVE);
    expect(settingsStore.get().readerWidth).toBeUndefined();
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
  /** Rail 260 + 40 gap: the container is 300px wider than the column. */
  const RAIL_EXTRA = 300;

  function mountDict(containerWidth = 1200) {
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
    // Column (containerWidth - 300) + rail 260 + 40 gap.
    container.getBoundingClientRect = () =>
      ({ width: containerWidth } as DOMRect);
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

    press(right, "ArrowRight");
    // Mock still measures 1200 → column 900, + one step.
    expect(settingsStore.get().dictWidth).toBe(900 + KEY_STEP_PX);
  });

  test("the max is the viewport less the rail", () => {
    const right = mountDict();
    // The element connected before the rail's width was mocked; focus
    // refreshes ARIA.
    right.dispatchEvent(new FocusEvent("focus"));
    expect(right.getAttribute("aria-valuemax")).toBe(
      String(VIEWPORT - RAIL_EXTRA)
    );
  });

  test("with the container viewport-bound, an outward step reaches full", () => {
    // The column can't grow past VIEWPORT - RAIL_EXTRA; stepping from there
    // used to save a width it could never reach, on every repeat.
    const right = mountDict(VIEWPORT);
    press(right, "ArrowRight");
    expect(settingsStore.get().dictWidth).toBe("full");
  });

  test("with the container viewport-bound, an outward drag reaches full", () => {
    const right = mountDict(VIEWPORT);
    pointer("pointerdown", right, 1700);
    pointer("pointermove", right, 1700 + 30);
    pointer("pointerup", right, 1700 + 30);
    expect(settingsStore.get().dictWidth).toBe("full");
  });
});
