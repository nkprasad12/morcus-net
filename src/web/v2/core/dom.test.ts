/**
 * @jest-environment jsdom
 */
import {
  setHtml,
  replaceWithHtml,
  assertConnected,
  escapeId,
  flashElement,
  isPlainLeftClick,
  syncIframeTheme,
} from "@/web/v2/core/dom.client";
import { detachedDomWrites } from "@/web/v2/core/dom_invariants.client";
import { swapElementContent } from "@/web/v2/core/partial.client";
import { html } from "@/web/v2/core/html.common";
import { allowDetachedDomWritesForTest } from "@/web/v2/testing/setup_tests";

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

    it("evaluates load-bearing UI V2 reader.css :has() selectors", () => {
      // reader.css L368: .reader-layout-active:has(.drawer-minimized) .reader-text-panel
      // reader.css L385: .reader-split-layout:has(.is-dragging) .reader-text-panel
      document.body.innerHTML = `
        <div id="reader-layout" class="reader-split-layout reader-layout-active">
          <section id="text-panel" class="reader-text-panel">Content</section>
          <aside id="dict-panel" class="reader-dict-panel drawer-minimized">
            <div id="handle" class="drawer-bar is-dragging">Handle</div>
          </aside>
        </div>
      `;

      const layout = document.getElementById("reader-layout")!;

      // 1. Minimized drawer rule: drives text panel bottom padding
      expect(layout.matches(":has(.drawer-minimized)")).toBe(true);
      const textPanelWithMinimized = document.querySelector(
        ".reader-layout-active:has(.drawer-minimized) .reader-text-panel"
      );
      expect(textPanelWithMinimized?.id).toBe("text-panel");

      // 2. Drag transition suppression rule: suppresses transition mid-drag
      expect(layout.matches(":has(.is-dragging)")).toBe(true);
      const textPanelDragging = document.querySelector(
        ".reader-split-layout:has(.is-dragging) .reader-text-panel"
      );
      expect(textPanelDragging?.id).toBe("text-panel");

      // 3. Negative controls: when state classes are removed
      document
        .getElementById("dict-panel")!
        .classList.remove("drawer-minimized");
      document.getElementById("handle")!.classList.remove("is-dragging");

      expect(layout.matches(":has(.drawer-minimized)")).toBe(false);
      expect(layout.matches(":has(.is-dragging)")).toBe(false);
      expect(
        document.querySelector(
          ".reader-layout-active:has(.drawer-minimized) .reader-text-panel"
        )
      ).toBeNull();
      expect(
        document.querySelector(
          ".reader-split-layout:has(.is-dragging) .reader-text-panel"
        )
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

  describe("syncIframeTheme", () => {
    it("synchronizes data-theme to same-origin iframe contentDocument", () => {
      const iframe = document.createElement("iframe");
      document.body.appendChild(iframe);
      iframe.contentDocument!.write("<html><body></body></html>");
      iframe.contentDocument!.close();

      syncIframeTheme(iframe, "dark");
      expect(
        iframe.contentDocument!.documentElement.getAttribute("data-theme")
      ).toBe("dark");

      syncIframeTheme(iframe, "light");
      expect(
        iframe.contentDocument!.documentElement.getAttribute("data-theme")
      ).toBe("light");
    });

    it("safely ignores cross-origin access exceptions without throwing", () => {
      const iframe = document.createElement("iframe");
      Object.defineProperty(iframe, "contentDocument", {
        get() {
          throw new DOMException(
            "Cross-origin security barrier",
            "SecurityError"
          );
        },
      });

      expect(() => syncIframeTheme(iframe, "dark")).not.toThrow();
    });
  });
});
