/**
 * @jest-environment jsdom
 */
import { isPlainLeftClick } from "@/web/ui/core/dom/lifetime_scope.client";
import {
  setHtml,
  replaceWithHtml,
  assertConnected,
  currentIframeSrc,
  escapeId,
  flashElement,
  isShortcutBlocked,
  navigateFrameReplace,
  prefersReducedMotion,
  scrollToElement,
} from "@/web/ui/core/dom/dom.client";
import { detachedDomWrites } from "@/web/ui/core/dom/dom_invariants.client";
import { swapElementContent } from "@/web/ui/core/nav/partial.client";
import { html } from "@/web/ui/core/dom/html.common";
import { allowDetachedDomWritesForTest } from "@/web/ui/testing/setup_tests";

describe("core/dom.client", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("setHtml", () => {
    it("replaces element children with SafeHtml content", () => {
      const container = document.createElement("div");
      container.innerHTML = "<span>original</span>";
      document.body.appendChild(container);

      setHtml(container, html`<p class="test">updated</p>`);

      expect(container.innerHTML).toBe('<p class="test">updated</p>');
      expect(container.querySelector(".test")?.textContent).toBe("updated");
    });
  });

  describe("replaceWithHtml", () => {
    it("replaces target element in DOM with SafeHtml content", () => {
      const parent = document.createElement("div");
      parent.innerHTML = '<span id="target">old</span>';
      document.body.appendChild(parent);

      const target = document.getElementById("target")!;
      replaceWithHtml(target, html`<section id="replaced">new</section>`);

      expect(document.getElementById("target")).toBeNull();
      expect(document.getElementById("replaced")?.textContent).toBe("new");
    });
  });

  describe("jsdom selector engine :has() evaluation", () => {
    it("evaluates querySelector with :has() without throwing", () => {
      document.body.innerHTML = `
        <div id="parent-match" class="parent">
          <span class="child">Matched</span>
        </div>
        <div id="parent-no-match" class="parent">
          <span class="other">Unmatched</span>
        </div>
      `;

      const matched = document.querySelector(".parent:has(.child)");
      expect(matched).not.toBeNull();
      expect(matched?.id).toBe("parent-match");

      const unmatched = document.querySelector(".parent:has(.nonexistent)");
      expect(unmatched).toBeNull();
    });

    it("evaluates element.matches() with :has()", () => {
      document.body.innerHTML = `
        <div id="box" class="container">
          <button class="active-btn">Click</button>
        </div>
      `;

      const box = document.getElementById("box")!;
      expect(box.matches(":has(.active-btn)")).toBe(true);
      expect(box.matches(":has(.disabled-btn)")).toBe(false);
    });

    it("evaluates querySelectorAll with :has()", () => {
      document.body.innerHTML = `
        <ul class="list">
          <li class="item" id="item-1"><span class="badge">1</span></li>
          <li class="item" id="item-2"><span class="plain">2</span></li>
          <li class="item" id="item-3"><span class="badge">3</span></li>
        </ul>
      `;

      const itemsWithBadge = document.querySelectorAll(".item:has(.badge)");
      expect(itemsWithBadge).toHaveLength(2);
      expect(Array.from(itemsWithBadge).map((el) => el.id)).toEqual([
        "item-1",
        "item-3",
      ]);
    });

    it("evaluates load-bearing UI V2 app_bar.css :has() selectors", () => {
      // app_bar.css L310: body:has(.reader-dict-panel.drawer-minimized) .back-to-top
      // app_bar.css L321: body:has(.drawer-dismissed) .back-to-top
      document.body.innerHTML = `
        <div id="reader-layout" class="reader-split-layout reader-layout-active drawer-dismissed">
          <section id="text-panel" class="reader-text-panel">Content</section>
          <aside id="dict-panel" class="reader-dict-panel drawer drawer-minimized">
            <div id="handle" class="drawer-bar">Handle</div>
          </aside>
        </div>
        <a id="back-to-top" href="#top" class="back-to-top">Top</a>
      `;

      // 1. Minimized drawer rule: positions back-to-top button above collapsed drawer bar
      expect(
        document.body.matches(":has(.reader-dict-panel.drawer-minimized)")
      ).toBe(true);
      const backToTopMinimized = document.querySelector(
        "body:has(.reader-dict-panel.drawer-minimized) .back-to-top"
      );
      expect(backToTopMinimized?.id).toBe("back-to-top");

      // 2. Dismissed drawer rule: positions back-to-top button above restore FAB
      expect(document.body.matches(":has(.drawer-dismissed)")).toBe(true);
      const backToTopDismissed = document.querySelector(
        "body:has(.drawer-dismissed) .back-to-top"
      );
      expect(backToTopDismissed?.id).toBe("back-to-top");

      // 3. Negative controls: when state classes are removed
      document
        .getElementById("dict-panel")!
        .classList.remove("drawer-minimized");
      document
        .getElementById("reader-layout")!
        .classList.remove("drawer-dismissed");

      expect(
        document.body.matches(":has(.reader-dict-panel.drawer-minimized)")
      ).toBe(false);
      expect(document.body.matches(":has(.drawer-dismissed)")).toBe(false);
      expect(
        document.querySelector(
          "body:has(.reader-dict-panel.drawer-minimized) .back-to-top"
        )
      ).toBeNull();
      expect(
        document.querySelector("body:has(.drawer-dismissed) .back-to-top")
      ).toBeNull();
    });
  });

  describe("HTML sink assertConnected invariant enforcement", () => {
    it("assertConnected records detached writes on disconnected elements", () => {
      allowDetachedDomWritesForTest();
      const detached = document.createElement("div");
      detached.id = "direct-assert-detached";

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      assertConnected(detached);

      expect(
        detachedDomWrites.some((w) =>
          w.includes("<div#direct-assert-detached>")
        )
      ).toBe(true);
      errSpy.mockRestore();
    });

    it("setHtml reports detached write when target is not connected", () => {
      allowDetachedDomWritesForTest();
      const detached = document.createElement("div");
      detached.id = "sink-detached-set";

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      setHtml(detached, html`<span>should flag</span>`);

      expect(
        detachedDomWrites.some((w) => w.includes("<div#sink-detached-set>"))
      ).toBe(true);
      errSpy.mockRestore();
    });

    it("replaceWithHtml reports detached write when target is not connected", () => {
      allowDetachedDomWritesForTest();
      const detached = document.createElement("div");
      detached.id = "sink-detached-replace";

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      replaceWithHtml(detached, html`<span>should flag</span>`);

      expect(
        detachedDomWrites.some((w) => w.includes("<div#sink-detached-replace>"))
      ).toBe(true);
      errSpy.mockRestore();
    });

    it("swapElementContent reports detached write when container is not connected", () => {
      allowDetachedDomWritesForTest();
      const detached = document.createElement("div");
      detached.id = "sink-detached-swap";

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      swapElementContent(detached, "<p>should flag</p>");

      expect(
        detachedDomWrites.some((w) => w.includes("<div#sink-detached-swap>"))
      ).toBe(true);
      errSpy.mockRestore();
    });

    it("does not report detached write when target is connected to document", () => {
      const live = document.createElement("div");
      live.id = "live-container";
      document.body.appendChild(live);

      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      setHtml(live, html`<span>valid write</span>`);

      expect(detachedDomWrites.length).toBe(0);
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe("escapeId", () => {
    it("escapes special characters using CSS.escape or regex fallback", () => {
      expect(escapeId("sec-1.2.3")).toBe("sec-1\\.2\\.3");
      expect(escapeId("item:4")).toBe("item\\:4");
      expect(escapeId("entry#1")).toBe("entry\\#1");
    });
  });

  describe("flashElement", () => {
    it("adds target class and removes it after animationend", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      flashElement(el, "target-active");
      expect(el.classList.contains("target-active")).toBe(true);

      el.dispatchEvent(new Event("animationend"));
      expect(el.classList.contains("target-active")).toBe(false);
    });

    it("re-triggers class when invoked repeatedly", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);

      flashElement(el, "target-active");
      expect(el.classList.contains("target-active")).toBe(true);

      // Flash again before animationend
      flashElement(el, "target-active");
      expect(el.classList.contains("target-active")).toBe(true);

      el.dispatchEvent(new Event("animationend"));
      expect(el.classList.contains("target-active")).toBe(false);
    });
  });

  describe("isPlainLeftClick", () => {
    it("returns true for primary click with no modifier keys", () => {
      const event = new MouseEvent("click", {
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      });
      expect(isPlainLeftClick(event)).toBe(true);
    });

    it("returns false for non-primary buttons", () => {
      const middleClick = new MouseEvent("click", { button: 1 });
      const rightClick = new MouseEvent("click", { button: 2 });
      expect(isPlainLeftClick(middleClick)).toBe(false);
      expect(isPlainLeftClick(rightClick)).toBe(false);
    });

    it("returns false when modifier keys are pressed", () => {
      expect(
        isPlainLeftClick(new MouseEvent("click", { button: 0, ctrlKey: true }))
      ).toBe(false);
      expect(
        isPlainLeftClick(new MouseEvent("click", { button: 0, metaKey: true }))
      ).toBe(false);
      expect(
        isPlainLeftClick(new MouseEvent("click", { button: 0, shiftKey: true }))
      ).toBe(false);
      expect(
        isPlainLeftClick(new MouseEvent("click", { button: 0, altKey: true }))
      ).toBe(false);
    });
  });

  describe("currentIframeSrc", () => {
    it("prefers contentWindow.location when the iframe has navigated to a path", () => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("src", "/dicts?q=arma&lang=La&o=1&embedded=1");
      Object.defineProperty(iframe, "contentWindow", {
        value: {
          location: {
            pathname: "/dicts",
            search: "?q=love&o=1&embedded=1",
          },
        },
      });
      expect(currentIframeSrc(iframe)).toBe("/dicts?q=love&o=1&embedded=1");
    });

    it("falls back to the src attribute for about:blank or cross-origin iframes", () => {
      const blankFrame = document.createElement("iframe");
      blankFrame.setAttribute("src", "/dicts?embedded=1");
      document.body.appendChild(blankFrame);
      expect(currentIframeSrc(blankFrame)).toBe("/dicts?embedded=1");

      const crossOriginFrame = document.createElement("iframe");
      crossOriginFrame.setAttribute("src", "https://example.com");
      Object.defineProperty(crossOriginFrame, "contentWindow", {
        get() {
          throw new DOMException(
            "Cross-origin security barrier",
            "SecurityError"
          );
        },
      });
      expect(currentIframeSrc(crossOriginFrame)).toBe("https://example.com");
    });
  });

  describe("navigateFrameReplace", () => {
    it("replaces contentWindow.location without mutating the iframe src attribute once a document is loaded", () => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("src", "/dicts?embedded=1");
      const replaceSpy = jest.fn();
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: {
          location: {
            pathname: "/dicts",
            replace: replaceSpy,
          },
        },
      });

      navigateFrameReplace(iframe, "/dicts?q=arma&lang=La&o=1&embedded=1");

      expect(replaceSpy).toHaveBeenCalledWith(
        "/dicts?q=arma&lang=La&o=1&embedded=1"
      );
      expect(iframe.getAttribute("src")).toBe("/dicts?embedded=1");
    });

    it("assigns iframe.src when the frame is still on about:blank (e.g. deferred lazy load)", () => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("src", "/dicts?embedded=1");
      const replaceSpy = jest.fn();
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        value: {
          location: {
            pathname: "blank",
            replace: replaceSpy,
          },
        },
      });

      navigateFrameReplace(iframe, "/dicts?q=arma&lang=La&o=1&embedded=1");

      expect(replaceSpy).not.toHaveBeenCalled();
      expect(iframe.getAttribute("src")).toBe(
        "/dicts?q=arma&lang=La&o=1&embedded=1"
      );
    });

    it("falls back to assigning iframe.src when contentWindow is null or throws", () => {
      const detachedFrame = document.createElement("iframe");
      navigateFrameReplace(
        detachedFrame,
        "/dicts?q=arma&lang=La&o=1&embedded=1"
      );
      expect(detachedFrame.getAttribute("src")).toBe(
        "/dicts?q=arma&lang=La&o=1&embedded=1"
      );

      const crossOriginFrame = document.createElement("iframe");
      Object.defineProperty(crossOriginFrame, "contentWindow", {
        configurable: true,
        get() {
          throw new DOMException(
            "Cross-origin security barrier",
            "SecurityError"
          );
        },
      });
      navigateFrameReplace(
        crossOriginFrame,
        "/dicts?q=virum&lang=La&o=1&embedded=1"
      );
      expect(crossOriginFrame.getAttribute("src")).toBe(
        "/dicts?q=virum&lang=La&o=1&embedded=1"
      );
    });
  });

  describe("isShortcutBlocked", () => {
    it("allows plain keydown events outside inputs and overlays", () => {
      const ev = new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(ev);
      expect(isShortcutBlocked(ev)).toBe(false);
    });

    it("blocks events with modifiers, defaultPrevented, or isComposing", () => {
      expect(
        isShortcutBlocked(
          new KeyboardEvent("keydown", { key: "/", ctrlKey: true })
        )
      ).toBe(true);
      expect(
        isShortcutBlocked(
          new KeyboardEvent("keydown", { key: "/", metaKey: true })
        )
      ).toBe(true);
      expect(
        isShortcutBlocked(
          new KeyboardEvent("keydown", { key: "/", altKey: true })
        )
      ).toBe(true);
      expect(
        isShortcutBlocked(
          new KeyboardEvent("keydown", { key: "/", isComposing: true })
        )
      ).toBe(true);

      const cancelled = new KeyboardEvent("keydown", {
        key: "/",
        cancelable: true,
      });
      cancelled.preventDefault();
      expect(isShortcutBlocked(cancelled)).toBe(true);
    });

    it("blocks events inside inputs, contenteditable, or open dialogs", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const inputEv = new KeyboardEvent("keydown", { key: "/", bubbles: true });
      input.dispatchEvent(inputEv);
      expect(isShortcutBlocked(inputEv)).toBe(true);
      input.remove();

      const dialog = document.createElement("dialog");
      dialog.setAttribute("open", "");
      document.body.appendChild(dialog);
      const bodyEv = new KeyboardEvent("keydown", { key: "/", bubbles: true });
      document.body.dispatchEvent(bodyEv);
      expect(isShortcutBlocked(bodyEv)).toBe(true);
      dialog.remove();
    });
  });

  describe("scrollToElement", () => {
    it("subtracts numeric scrollMarginTop from scrollY + rect.top and forwards behavior", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 150,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 50,
        x: 0,
        y: 150,
        toJSON: () => ({}),
      });
      const scrollToSpy = jest
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      const getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ scrollMarginTop: "24px" } as CSSStyleDeclaration);

      Object.defineProperty(window, "scrollY", {
        value: 100,
        configurable: true,
      });

      scrollToElement(el, "smooth");

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 226,
        behavior: "smooth",
      });

      scrollToSpy.mockRestore();
      getComputedStyleSpy.mockRestore();
    });

    it("advances past top padding when scrollMarginTop is negative", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 150,
        bottom: 200,
        left: 0,
        right: 100,
        width: 100,
        height: 50,
        x: 0,
        y: 150,
        toJSON: () => ({}),
      });
      const scrollToSpy = jest
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      const getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ scrollMarginTop: "-8px" } as CSSStyleDeclaration);

      Object.defineProperty(window, "scrollY", {
        value: 100,
        configurable: true,
      });

      scrollToElement(el, "instant");

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 258,
        behavior: "instant",
      });

      scrollToSpy.mockRestore();
      getComputedStyleSpy.mockRestore();
    });

    it("falls back to 0 margin when scrollMarginTop is empty or non-numeric", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 80,
        bottom: 120,
        left: 0,
        right: 100,
        width: 100,
        height: 40,
        x: 0,
        y: 80,
        toJSON: () => ({}),
      });
      const scrollToSpy = jest
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      const getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ scrollMarginTop: "auto" } as CSSStyleDeclaration);

      Object.defineProperty(window, "scrollY", {
        value: 50,
        configurable: true,
      });

      scrollToElement(el);

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 130,
        behavior: "instant",
      });

      scrollToSpy.mockRestore();
      getComputedStyleSpy.mockRestore();
    });

    it("clamps scroll destination to 0 when offset would be negative", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 10,
        bottom: 30,
        left: 0,
        right: 100,
        width: 100,
        height: 20,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      });
      const scrollToSpy = jest
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      const getComputedStyleSpy = jest
        .spyOn(window, "getComputedStyle")
        .mockReturnValue({ scrollMarginTop: "100px" } as CSSStyleDeclaration);

      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true,
      });

      scrollToElement(el);

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        behavior: "instant",
      });

      scrollToSpy.mockRestore();
      getComputedStyleSpy.mockRestore();
    });

    it("supports passing an explicit Window object (e.g. iframe context)", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      jest.spyOn(el, "getBoundingClientRect").mockReturnValue({
        top: 60,
        bottom: 100,
        left: 0,
        right: 100,
        width: 100,
        height: 40,
        x: 0,
        y: 60,
        toJSON: () => ({}),
      });

      const mockWin = {
        scrollTo: jest.fn(),
        getComputedStyle: jest
          .fn()
          .mockReturnValue({ scrollMarginTop: "10px" }),
        scrollY: 20,
      } as unknown as Window;

      scrollToElement(el, "smooth", mockWin);

      expect(mockWin.scrollTo).toHaveBeenCalledWith({
        top: 70,
        behavior: "smooth",
      });
    });
  });

  describe("prefersReducedMotion", () => {
    const origMatchMedia = window.matchMedia;

    afterEach(() => {
      Object.defineProperty(window, "matchMedia", {
        value: origMatchMedia,
        configurable: true,
        writable: true,
      });
    });

    it("returns true only when (prefers-reduced-motion: reduce) matches", () => {
      Object.defineProperty(window, "matchMedia", {
        value: jest.fn((query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
        })),
        configurable: true,
        writable: true,
      });
      expect(prefersReducedMotion()).toBe(true);

      Object.defineProperty(window, "matchMedia", {
        value: jest.fn(() => ({ matches: false })),
        configurable: true,
        writable: true,
      });
      expect(prefersReducedMotion()).toBe(false);

      Object.defineProperty(window, "matchMedia", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      expect(prefersReducedMotion()).toBe(false);
    });
  });
});
