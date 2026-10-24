/**
 * @jest-environment jsdom
 */
import { DrawerController } from "@/web/ui/core/widgets/drawer.client";
import {
  closeActiveSectionUI,
  openSectionActionMenu,
} from "@/web/ui/core/widgets/section_edit.client";

describe("section_edit drawer minimization and scroll clearance (CORE-03)", () => {
  const origScrollBy = window.scrollBy;
  const origInnerHeight = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight"
  );

  beforeEach(() => {
    window.scrollBy = jest.fn();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    closeActiveSectionUI();
    document.body.innerHTML = "";
    window.scrollBy = origScrollBy;
    if (origInnerHeight) {
      Object.defineProperty(window, "innerHeight", origInnerHeight);
    }
    jest.restoreAllMocks();
  });

  function triggerSuggestCorrection(anchor: HTMLAnchorElement) {
    const passage = anchor.parentElement?.querySelector(".section-content");
    openSectionActionMenu({
      anchor,
      sectionId: "1.1",
      label: "§ 1.1",
      reportUrl: "http://localhost/work/caesar/bg/1#sec-1.1",
      onCopy: jest.fn(),
      getContentNodes: () => (passage ? [passage] : []),
    });
    const editBtn = document.querySelector<HTMLButtonElement>(
      '.section-action-menu [data-action="edit"]'
    )!;
    editBtn.click();
  }

  test("dispatches morcus:section-edit-open and minimizes an active DrawerController outside the editor", () => {
    document.body.innerHTML = `
      <div id="passage">
        <div class="reader-section">
          <a id="anchor" href="#sec-1.1" class="section-anchor">1.1</a>
          <div class="section-content">Gallia est omnis divisa in partes tres.</div>
        </div>
      </div>
      <aside id="drawer" class="drawer">
        <details id="details" open>
          <summary id="handle" class="drawer-bar">Contents</summary>
          <div>Drawer body</div>
        </details>
      </aside>
    `;

    const drawer = document.getElementById("drawer")!;
    const handle = document.getElementById("handle")!;
    const details = document.getElementById("details") as HTMLDetailsElement;
    const anchor = document.getElementById("anchor") as HTMLAnchorElement;
    const onMinimize = jest.fn();

    const controller = new DrawerController({
      drawer,
      handle,
      detailsElement: details,
      minHeight: 28,
      onMinimize,
    });
    controller.connect();
    controller.restore(48);

    expect(controller.isMinimized()).toBe(false);
    expect(drawer.classList.contains("drawer-minimized")).toBe(false);
    expect(details.open).toBe(true);

    const eventSpy = jest.fn();
    document.addEventListener("morcus:section-edit-open", eventSpy);

    triggerSuggestCorrection(anchor);

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(controller.isMinimized()).toBe(true);
    expect(drawer.classList.contains("drawer-minimized")).toBe(true);
    expect(details.open).toBe(false);
    expect(drawer.style.getPropertyValue("--drawer-height")).toBe("28px");
    expect(onMinimize).toHaveBeenCalledTimes(1);

    document.removeEventListener("morcus:section-edit-open", eventSpy);
    controller.dispose();
  });

  test("does NOT minimize a drawer when the editor is opened inside that drawer", () => {
    document.body.innerHTML = `
      <aside id="drawer" class="drawer">
        <div id="handle" class="drawer-bar" tabindex="0"></div>
        <div class="drawer-body">
          <div class="sense-row">
            <a id="anchor" href="#sense-1" class="section-anchor">I.</a>
            <span class="section-content">Sense text inside drawer</span>
          </div>
        </div>
      </aside>
    `;

    const drawer = document.getElementById("drawer")!;
    const handle = document.getElementById("handle")!;
    const anchor = document.getElementById("anchor") as HTMLAnchorElement;
    const onMinimize = jest.fn();

    const controller = new DrawerController({
      drawer,
      handle,
      onMinimize,
    });
    controller.connect();
    controller.restore(60);

    triggerSuggestCorrection(anchor);

    expect(controller.isMinimized()).toBe(false);
    expect(drawer.classList.contains("drawer-minimized")).toBe(false);
    expect(onMinimize).not.toHaveBeenCalled();
    expect(window.scrollBy).not.toHaveBeenCalled();

    controller.dispose();
  });

  test("nudges window.scrollBy with behavior: 'instant' when editor bottom is covered by the minimized peek bar", () => {
    document.body.innerHTML = `
      <div id="passage">
        <div class="reader-section">
          <a id="anchor" href="#sec-1.1" class="section-anchor">1.1</a>
          <div class="section-content">Gallia est omnis divisa in partes tres.</div>
        </div>
      </div>
      <aside id="drawer" class="drawer" style="position: fixed;">
        <div id="handle" class="drawer-bar" tabindex="0"></div>
      </aside>
    `;

    const drawer = document.getElementById("drawer")!;
    const handle = document.getElementById("handle")!;
    const anchor = document.getElementById("anchor") as HTMLAnchorElement;

    const controller = new DrawerController({
      drawer,
      handle,
      minHeight: 40,
    });
    controller.connect();
    controller.restore(48);

    // Once minimized to 40px peek bar in an 800px viewport, drawer top is at 760px
    drawer.getBoundingClientRect = jest.fn(
      () =>
        ({
          top: controller.isMinimized() ? 760 : 416,
          bottom: 800,
          height: controller.isMinimized() ? 40 : 384,
        } as DOMRect)
    );

    const origGetBCR = Element.prototype.getBoundingClientRect;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.classList.contains("section-edit-box")) {
          return { top: 670, bottom: 790, height: 120 } as DOMRect;
        }
        return origGetBCR.call(this);
      });

    triggerSuggestCorrection(anchor);

    expect(controller.isMinimized()).toBe(true);
    expect(window.scrollBy).toHaveBeenCalledWith({
      top: 30,
      behavior: "instant",
    });

    controller.dispose();
  });

  test("does not scroll when editor bottom is already above the minimized peek bar or when drawer is static (desktop)", () => {
    document.body.innerHTML = `
      <div id="passage">
        <div class="reader-section">
          <a id="anchor" href="#sec-1.1" class="section-anchor">1.1</a>
          <div class="section-content">Gallia est omnis divisa in partes tres.</div>
        </div>
      </div>
      <aside id="drawer" class="drawer" style="position: relative;">
        <div id="handle" class="drawer-bar" tabindex="0"></div>
      </aside>
    `;

    const drawer = document.getElementById("drawer")!;
    const anchor = document.getElementById("anchor") as HTMLAnchorElement;

    // Desktop side panel has top: 65, height: 735, but position: relative
    drawer.getBoundingClientRect = jest.fn(
      () => ({ top: 65, bottom: 800, height: 735 } as DOMRect)
    );

    const origGetBCR = Element.prototype.getBoundingClientRect;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this.classList.contains("section-edit-box")) {
          return { top: 300, bottom: 420, height: 120 } as DOMRect;
        }
        return origGetBCR.call(this);
      });

    triggerSuggestCorrection(anchor);

    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
