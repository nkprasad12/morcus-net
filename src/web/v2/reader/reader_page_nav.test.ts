/**
 * @jest-environment jsdom
 */

import {
  EDGE_GUARD_PX,
  RESISTANCE,
  ReaderPageNavController,
  SLIDE_MS,
  type PageDir,
} from "@/web/v2/reader/reader_page_nav.client";
import { SWIPE_NAV_KEY } from "@/web/v2/reader/reader_settings.client";

// jsdom viewport: 1024 x 768, so a swipe commits at 0.2 * 768 = 153.6px.
const W = window.innerWidth;

function touch(el: Element, type: string, points: Array<[number, number]>) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  el.dispatchEvent(e);
}

/** A single-finger horizontal drag from `fromX` by `dx`, optionally released. */
function swipe(el: Element, fromX: number, dx: number, release = true) {
  touch(el, "touchstart", [[fromX, 300]]);
  touch(el, "touchmove", [[fromX + dx / 2, 302]]);
  touch(el, "touchmove", [[fromX + dx, 304]]);
  if (release) touch(el, "touchend", []);
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Runs every slide phase (out, turn, in) to completion. */
async function finishSlides() {
  for (let i = 0; i < 3; i++) {
    jest.advanceTimersByTime(SLIDE_MS);
    await flush();
  }
}

describe("ReaderPageNavController", () => {
  let root: HTMLElement;
  let panel: HTMLElement;
  let canTurn: jest.Mock<boolean, [PageDir]>;
  let turn: jest.Mock<Promise<boolean>, [PageDir]>;
  let controller: ReaderPageNavController;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = `
      <div id="root">
        <section class="reader-text-panel">
          <p id="text">Gallia est omnis divisa in partes tres</p>
        </section>
      </div>`;
    root = document.getElementById("root")!;
    panel = root.querySelector(".reader-text-panel")!;
    canTurn = jest.fn((_dir: PageDir) => true);
    turn = jest.fn((_dir: PageDir) => Promise.resolve(true));
    controller = new ReaderPageNavController({ root, canTurn, turn });
    controller.connect();
  });

  afterEach(() => {
    controller.dispose();
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("tracks the finger, then turns and slides the new page in", async () => {
    swipe(panel, 600, -200, false);
    expect(panel.dataset.swipe).toBe("drag");
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("-200px");
    // Armed past the commit distance: faded to half.
    expect(panel.style.getPropertyValue("--swipe-fade")).toBe("0.5");

    touch(panel, "touchend", []);
    expect(turn).toHaveBeenCalledWith("next");
    expect(panel.dataset.swipe).toBe("anim");
    expect(panel.style.getPropertyValue("--swipe-x")).toBe(`${-W}px`);

    jest.advanceTimersByTime(SLIDE_MS);
    await flush();
    // New page enters from the opposite side.
    expect(panel.dataset.swipe).toBe("anim");
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("0px");

    await finishSlides();
    expect(panel.dataset.swipe).toBeUndefined();
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("");
    expect(panel.style.getPropertyValue("--swipe-fade")).toBe("");
  });

  it("swiping right turns to the previous page", async () => {
    swipe(panel, 300, 200);
    expect(turn).toHaveBeenCalledWith("prev");
    await finishSlides();
  });

  it("springs back without turning when released short", async () => {
    swipe(panel, 600, -100);
    expect(turn).not.toHaveBeenCalled();
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("0px");
    await finishSlides();
    expect(panel.dataset.swipe).toBeUndefined();
  });

  it("resists and never turns toward a missing page", async () => {
    canTurn.mockImplementation((dir) => dir !== "prev");
    swipe(panel, 300, 400, false);
    expect(panel.style.getPropertyValue("--swipe-x")).toBe(
      `${400 * RESISTANCE}px`
    );
    touch(panel, "touchend", []);
    expect(turn).not.toHaveBeenCalled();
    await finishSlides();
  });

  it("springs back if the turn fails", async () => {
    turn.mockResolvedValue(false);
    swipe(panel, 600, -200);
    jest.advanceTimersByTime(SLIDE_MS);
    await flush();
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("0px");
    expect(panel.style.getPropertyValue("--swipe-fade")).toBe("1");
    await finishSlides();
    expect(panel.dataset.swipe).toBeUndefined();
  });

  it("does not turn on a cancelled touch", async () => {
    swipe(panel, 600, -200, false);
    touch(panel, "touchcancel", []);
    expect(turn).not.toHaveBeenCalled();
    await finishSlides();
  });

  it("ignores swipes that start in the system back-gesture margins", () => {
    swipe(panel, EDGE_GUARD_PX - 1, 300);
    swipe(panel, W - EDGE_GUARD_PX + 1, -300);
    expect(panel.dataset.swipe).toBeUndefined();
    expect(turn).not.toHaveBeenCalled();
  });

  it("ignores swipes while text is selected", () => {
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("#text")!);
    window.getSelection()!.addRange(range);
    swipe(panel, 600, -200);
    expect(turn).not.toHaveBeenCalled();
    window.getSelection()!.removeAllRanges();
  });

  it("honours the setting, including V1's stored format", () => {
    localStorage.setItem(SWIPE_NAV_KEY, '{"w":false}');
    swipe(panel, 600, -200);
    expect(turn).not.toHaveBeenCalled();
  });

  it("ignores new gestures until the current slide finishes", () => {
    turn.mockReturnValue(new Promise(() => {}));
    swipe(panel, 600, -200);
    swipe(panel, 600, -200);
    expect(turn).toHaveBeenCalledTimes(1);
  });

  it("clears slide state on disconnect", () => {
    swipe(panel, 600, -200, false);
    controller.dispose();
    expect(panel.dataset.swipe).toBeUndefined();
    expect(panel.style.getPropertyValue("--swipe-x")).toBe("");
  });
});
