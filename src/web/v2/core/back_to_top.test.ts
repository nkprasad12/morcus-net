/**
 * @jest-environment jsdom
 */

import { setupBackToTop } from "@/web/v2/core/back_to_top.client";

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

  test("returns a no-op cleanup when .v2-back-to-top is missing", () => {
    cleanup = setupBackToTop(document, window);
    expect(() => cleanup()).not.toThrow();
  });

  test("initializes visibility based on initial window.scrollY", () => {
    document.body.innerHTML = `<a href="#top" class="v2-back-to-top">Top</a>`;
    const btn = document.querySelector(".v2-back-to-top") as HTMLAnchorElement;

    // Below 300px
    Object.defineProperty(window, "scrollY", {
      value: 100,
      configurable: true,
      writable: true,
    });
    cleanup = setupBackToTop(document, window);
    expect(btn.classList.contains("v2-visible")).toBe(false);

    // Above 300px
    Object.defineProperty(window, "scrollY", {
      value: 450,
      configurable: true,
      writable: true,
    });
    cleanup = setupBackToTop(document, window);
    expect(btn.classList.contains("v2-visible")).toBe(true);
  });

  test("toggles visibility on scroll throttled via requestAnimationFrame", () => {
    document.body.innerHTML = `<a href="#top" class="v2-back-to-top">Top</a>`;
    const btn = document.querySelector(".v2-back-to-top") as HTMLAnchorElement;
    Object.defineProperty(window, "scrollY", {
      value: 0,
      configurable: true,
      writable: true,
    });

    cleanup = setupBackToTop(document, window);
    expect(btn.classList.contains("v2-visible")).toBe(false);

    // Scroll past 300
    Object.defineProperty(window, "scrollY", {
      value: 400,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event("scroll"));

    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(btn.classList.contains("v2-visible")).toBe(false); // Before rAF flush

    flushRaf();
    expect(btn.classList.contains("v2-visible")).toBe(true);

    // Scroll back up
    Object.defineProperty(window, "scrollY", {
      value: 200,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event("scroll"));
    flushRaf();
    expect(btn.classList.contains("v2-visible")).toBe(false);
  });

  test("scrolls to top instantly on click and strips URL hash if present", () => {
    document.body.innerHTML = `<a href="#top" class="v2-back-to-top">Top</a>`;
    const btn = document.querySelector(".v2-back-to-top") as HTMLAnchorElement;
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
    document.body.innerHTML = `<a href="#top" class="v2-back-to-top">Top</a>`;
    const btn = document.querySelector(".v2-back-to-top") as HTMLAnchorElement;
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
    document.body.innerHTML = `<a href="#top" class="v2-back-to-top">Top</a>`;
    const btn = document.querySelector(".v2-back-to-top") as HTMLAnchorElement;
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo;

    cleanup = setupBackToTop(document, window);
    cleanup();

    // Trigger scroll
    Object.defineProperty(window, "scrollY", {
      value: 600,
      configurable: true,
      writable: true,
    });
    window.dispatchEvent(new Event("scroll"));
    expect(rafCallbacks.length).toBe(0);

    // Trigger click
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
