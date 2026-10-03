/**
 * @jest-environment jsdom
 */

import {
  SWIPE_SLOP_PX,
  trackHorizontalSwipe,
  trackPointerDrag,
} from "@/web/v2/core/gesture.client";

/** Dispatches a touch event whose `touches` list holds `points`. */
function touch(el: Element, type: string, points: Array<[number, number]>) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  el.dispatchEvent(e);
}

describe("trackHorizontalSwipe", () => {
  let el: HTMLElement;
  let onMove: jest.Mock;
  let onEnd: jest.Mock;
  let cleanup: () => void;

  beforeEach(() => {
    el = document.createElement("div");
    document.body.appendChild(el);
    onMove = jest.fn();
    onEnd = jest.fn();
    cleanup = trackHorizontalSwipe(el, { onMove, onEnd });
  });

  afterEach(() => {
    cleanup();
    el.remove();
  });

  it("locks horizontal after the slop and reports dx on move and end", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[100 - (SWIPE_SLOP_PX - 1), 100]]);
    expect(onMove).not.toHaveBeenCalled();

    touch(el, "touchmove", [[40, 104]]);
    expect(onMove).toHaveBeenLastCalledWith(-60);
    touch(el, "touchmove", [[20, 110]]);
    expect(onMove).toHaveBeenLastCalledWith(-80);

    touch(el, "touchend", []);
    expect(onEnd).toHaveBeenCalledWith(-80, false);
  });

  it("leaves a vertical scroll alone for the rest of the touch", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[102, 140]]);
    touch(el, "touchmove", [[250, 140]]);
    touch(el, "touchend", []);
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("discards diagonal touches that are not clearly horizontal", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[120, 118]]);
    touch(el, "touchend", []);
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("cancels when a second finger lands", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[150, 100]]);
    touch(el, "touchstart", [
      [150, 100],
      [300, 300],
    ]);
    expect(onEnd).toHaveBeenCalledWith(50, true);

    touch(el, "touchmove", [[200, 100]]);
    touch(el, "touchend", []);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("cancels when a move reports a second finger that started elsewhere", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[150, 100]]);
    touch(el, "touchmove", [
      [160, 100],
      [300, 300],
    ]);
    expect(onEnd).toHaveBeenCalledWith(50, true);
  });

  it("reports touchcancel as cancelled", () => {
    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[150, 100]]);
    touch(el, "touchcancel", []);
    expect(onEnd).toHaveBeenCalledWith(50, true);
  });

  it("ignores touches rejected by the filter", () => {
    cleanup();
    const filter = jest.fn(() => false);
    cleanup = trackHorizontalSwipe(el, { filter, onMove, onEnd });

    touch(el, "touchstart", [[100, 100]]);
    touch(el, "touchmove", [[200, 100]]);
    touch(el, "touchend", []);
    expect(filter).toHaveBeenCalledWith({ clientX: 100, clientY: 100 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("registers passive listeners and removes them on cleanup", () => {
    const add = jest.spyOn(el, "addEventListener");
    const remove = jest.spyOn(el, "removeEventListener");
    const unbind = trackHorizontalSwipe(el, { onMove, onEnd });
    expect(add).toHaveBeenCalledTimes(4);
    for (const call of add.mock.calls) {
      expect(call[2]).toEqual({ passive: true });
    }
    unbind();
    expect(remove).toHaveBeenCalledTimes(4);
  });
});

describe("trackPointerDrag", () => {
  function pointer(el: Element, type: string, button = 0): Event {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { button, pointerId: 1, clientX: 0, clientY: 0 });
    el.dispatchEvent(e);
    return e;
  }

  /** Dispatches a selectstart on a text node, as a browser would, and reports if it was cancelled. */
  function selectionBlocked(): boolean {
    const text = document.body.appendChild(document.createTextNode("x"));
    const e = new Event("selectstart", { bubbles: true, cancelable: true });
    text.dispatchEvent(e);
    text.remove();
    return e.defaultPrevented;
  }

  it("does not cancel the pointerdown, so the handle can still take focus", () => {
    const el = document.createElement("div");
    const cleanup = trackPointerDrag(el, {});
    expect(pointer(el, "pointerdown").defaultPrevented).toBe(false);
    cleanup();
  });

  it("blocks text selection only while a drag is active", () => {
    const el = document.createElement("div");
    const cleanup = trackPointerDrag(el, {});
    expect(selectionBlocked()).toBe(false);
    pointer(el, "pointerdown");
    expect(selectionBlocked()).toBe(true);
    cleanup();
  });

  it.each(["pointerup", "pointercancel"])(
    "stops blocking text selection after %s",
    (type) => {
      const el = document.createElement("div");
      const cleanup = trackPointerDrag(el, {});
      pointer(el, "pointerdown");
      pointer(el, type);
      expect(selectionBlocked()).toBe(false);
      cleanup();
    }
  );

  it("stops blocking text selection when unbound mid-drag", () => {
    const el = document.createElement("div");
    const cleanup = trackPointerDrag(el, {});
    pointer(el, "pointerdown");
    cleanup();
    expect(selectionBlocked()).toBe(false);
  });

  it("leaves ignored pointerdowns alone", () => {
    const el = document.createElement("div");
    const filtered = trackPointerDrag(el, { filter: () => false });
    pointer(el, "pointerdown");
    pointer(el, "pointerdown", 2);
    expect(selectionBlocked()).toBe(false);
    filtered();

    const refused = trackPointerDrag(el, { onStart: () => false });
    pointer(el, "pointerdown");
    expect(selectionBlocked()).toBe(false);
    refused();
  });
});
