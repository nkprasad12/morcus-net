/**
 * @jest-environment jsdom
 */

import {
  SWIPE_SLOP_PX,
  trackHorizontalSwipe,
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
