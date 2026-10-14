/**
 * @jest-environment jsdom
 */

import {
  bindBackToTop,
  setupBackToTop,
} from "@/web/v2/core/widgets/back_to_top.client";

describe("setupBackToTop", () => {
  let cleanup: () => void;
  let rafCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    document.body.innerHTML = "";
    rafCallbacks = [];
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
    jest.restoreAllMocks();
  });

  function flushRaf() {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb(performance.now()));
  }

  test("returns a no-op cleanup when .back-to-top is missing", () => {
    cleanup = setupBackToTop(document, window);
    expect(() => cleanup()).not.toThrow();
  });

  test("initializes visibility from window.scrollY on the first frame", () => {
    document.body.innerHTML = `<a href="#top" class="back-to-top">Top</a>`;
    const btn = document.querySelector(".back-to-top") as HTMLAnchorElement;

    // Below 300px
    Object.defineProperty(window, "scrollY", {
      value: 100,
      configurable: true,
      writable: true,
    });
    cleanup = setupBackToTop(document, window);
    flushRaf();
    expect(btn.classList.contains("visible")).toBe(false);

    // Above 300px
    Object.defineProperty(window, "scrollY", {
      value: 450,
      configurable: true,
      writable: true,
    });
    cleanup = setupBackToTop(document, window);
    // Not read synchronously: setup runs in the page-load task, where reading
    // scroll position forces a full style and layout.
    expect(btn.classList.contains("visible")).toBe(false);
    flushRaf();
    expect(btn.classList.contains("visible")).toBe(true);
  });

  test("toggles visibility on scroll throttled via requestAnimationFrame", () => {
    document.body.innerHTML = `<a href="#top" class="back-to-top">Top</a>`;
    const btn = document.querySelector(".back-to-top") as HTMLAnchorElement;
    Object.defineProperty(window, "scrollY", {
      value: 0,
      configurable: true,
      writable: true,
    });

    cleanup = setupBackToTop(document, window);
    expect(btn.classList.contains("visible")).toBe(false);

    // Scroll past 300
    Object.defineProperty(window, "scrollY", {
      value: 400,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event("scroll"));

    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(btn.classList.contains("visible")).toBe(false); // Before rAF flush

    flushRaf();
    expect(btn.classList.contains("visible")).toBe(true);

    // Scroll back up
    Object.defineProperty(window, "scrollY", {
      value: 200,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event("scroll"));
    flushRaf();
    expect(btn.classList.contains("visible")).toBe(false);
  });

  test("scrolls to top instantly on click and strips URL hash if present", () => {
    document.body.innerHTML = `<a href="#top" class="back-to-top">Top</a>`;
    const btn = document.querySelector(".back-to-top") as HTMLAnchorElement;
    const scrollTo = jest.fn();
    const replaceState = jest.fn();

    const mockWin = {
      scrollY: 500,
      location: {
        hash: "#some-anchor",
        pathname: "/v2/dicts",
        search: "?q=test",
      },
      history: { replaceState },
      scrollTo,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      requestAnimationFrame: jest.fn(),
    } as unknown as Window;

    cleanup = setupBackToTop(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/v2/dicts?q=test");
  });

  test("does not call replaceState on click if hash is empty", () => {
    document.body.innerHTML = `<a href="#top" class="back-to-top">Top</a>`;
    const btn = document.querySelector(".back-to-top") as HTMLAnchorElement;
    const scrollTo = jest.fn();
    const replaceState = jest.fn();

    const mockWin = {
      scrollY: 500,
      location: { hash: "", pathname: "/v2/dicts", search: "?q=test" },
      history: { replaceState },
      scrollTo,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      requestAnimationFrame: jest.fn(),
    } as unknown as Window;

    cleanup = setupBackToTop(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("cleanup unbinds window scroll and button click listeners", () => {
    document.body.innerHTML = `<a href="#top" class="back-to-top">Top</a>`;
    const btn = document.querySelector(".back-to-top") as HTMLAnchorElement;
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo;

    cleanup = setupBackToTop(document, window);
    cleanup();

    Object.defineProperty(window, "scrollY", {
      value: 600,
      configurable: true,
      writable: true,
    });
    // The initial update queued by setup is a no-op once cleaned up.
    flushRaf();
    expect(btn.classList.contains("visible")).toBe(false);

    // Trigger scroll
    window.dispatchEvent(new Event("scroll"));
    expect(rafCallbacks.length).toBe(0);

    // Trigger click
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  describe("bindBackToTop with custom scroll container", () => {
    test("toggles visibility from container.scrollTop and scrolls container on click without clearing URL hash", () => {
      document.body.innerHTML = `
        <div id="panel">
          <button type="button" id="panel-top">Top</button>
        </div>
      `;
      const panel = document.getElementById("panel")!;
      const btn = document.getElementById("panel-top")!;
      const scrollToMock = jest.fn();
      panel.scrollTo = scrollToMock;
      const replaceStateSpy = jest.spyOn(window.history, "replaceState");
      window.location.hash = "#keep-me";

      Object.defineProperty(panel, "scrollTop", {
        value: 0,
        configurable: true,
        writable: true,
      });

      cleanup = bindBackToTop(btn, { container: panel });
      expect(btn.classList.contains("visible")).toBe(false);

      // Scroll container past 300px
      panel.scrollTop = 380;
      panel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(true);

      // Click scrolls container to top, hides button, preserves URL hash
      btn.click();
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        behavior: "instant",
      });
      expect(btn.classList.contains("visible")).toBe(false);
      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    test("supports custom threshold, getTargetTop, and scrollTop fallback when scrollTo is absent", () => {
      document.body.innerHTML = `
        <div id="panel">
          <button type="button" id="panel-top">Top</button>
        </div>
      `;
      const panel = document.getElementById("panel")!;
      const btn = document.getElementById("panel-top")!;
      // Remove scrollTo to exercise scrollTop assignment fallback
      // @ts-expect-error testing fallback when scrollTo is undefined
      panel.scrollTo = undefined;

      Object.defineProperty(panel, "scrollTop", {
        value: 150,
        configurable: true,
        writable: true,
      });

      cleanup = bindBackToTop(btn, {
        container: () => panel,
        scrollTargets: [panel],
        threshold: 100,
        getTargetTop: () => 24,
      });
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(true);

      btn.click();
      expect(panel.scrollTop).toBe(24);
      expect(btn.classList.contains("visible")).toBe(false);
    });
  });
});
