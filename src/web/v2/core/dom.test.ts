/**
 * @jest-environment jsdom
 */
import { setHtml, replaceWithHtml } from "@/web/v2/core/dom.client";
import { html } from "@/web/v2/core/html.common";

describe("core/dom.client", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("setHtml", () => {
    it("replaces element children with SafeHtml content", () => {
      const container = document.createElement("div");
      container.innerHTML = "<span>original</span>";
      document.body.appendChild(container);

      setHtml(container, html`<p class="v2-test">updated</p>`);

      expect(container.innerHTML).toBe('<p class="v2-test">updated</p>');
      expect(container.querySelector(".v2-test")?.textContent).toBe("updated");
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
      // reader.css L368: .v2-reader-layout-active:has(.v2-drawer-minimized) .v2-reader-text-panel
      // reader.css L385: .v2-reader-split-layout:has(.v2-is-dragging) .v2-reader-text-panel
      document.body.innerHTML = `
        <div id="reader-layout" class="v2-reader-split-layout v2-reader-layout-active">
          <section id="text-panel" class="v2-reader-text-panel">Content</section>
          <aside id="dict-panel" class="v2-reader-dict-panel v2-drawer-minimized">
            <div id="handle" class="v2-drawer-bar v2-is-dragging">Handle</div>
          </aside>
        </div>
      `;

      const layout = document.getElementById("reader-layout")!;

      // 1. Minimized drawer rule: drives text panel bottom padding
      expect(layout.matches(":has(.v2-drawer-minimized)")).toBe(true);
      const textPanelWithMinimized = document.querySelector(
        ".v2-reader-layout-active:has(.v2-drawer-minimized) .v2-reader-text-panel"
      );
      expect(textPanelWithMinimized?.id).toBe("text-panel");

      // 2. Drag transition suppression rule: suppresses transition mid-drag
      expect(layout.matches(":has(.v2-is-dragging)")).toBe(true);
      const textPanelDragging = document.querySelector(
        ".v2-reader-split-layout:has(.v2-is-dragging) .v2-reader-text-panel"
      );
      expect(textPanelDragging?.id).toBe("text-panel");

      // 3. Negative controls: when state classes are removed
      document
        .getElementById("dict-panel")!
        .classList.remove("v2-drawer-minimized");
      document.getElementById("handle")!.classList.remove("v2-is-dragging");

      expect(layout.matches(":has(.v2-drawer-minimized)")).toBe(false);
      expect(layout.matches(":has(.v2-is-dragging)")).toBe(false);
      expect(
        document.querySelector(
          ".v2-reader-layout-active:has(.v2-drawer-minimized) .v2-reader-text-panel"
        )
      ).toBeNull();
      expect(
        document.querySelector(
          ".v2-reader-split-layout:has(.v2-is-dragging) .v2-reader-text-panel"
        )
      ).toBeNull();
    });
  });
});
