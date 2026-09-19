/**
 * @jest-environment jsdom
 */

import {
  AnchoredPopoverController,
  assertConnected,
  bindDismissable,
  trapFocus,
} from "@/web/v2/core/index.client";
import { allowDetachedDomWritesForTest } from "@/web/v2/testing/setup_tests";

describe("AnchoredPopoverController & trapFocus", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  function createPopoverFixture(prefix: string = "test") {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <button type="button" id="${prefix}-btn" aria-expanded="false">Open</button>
      <div id="${prefix}-backdrop" hidden></div>
      <div id="${prefix}-panel" hidden>
        <button type="button" id="${prefix}-close">&times;</button>
        <a href="#item1" id="${prefix}-item1">Item 1</a>
        <button type="button" id="${prefix}-action">Action</button>
      </div>
      <button type="button" id="${prefix}-outside">Outside</button>
    `;
    container.appendChild(wrapper);

    return {
      wrapper,
      trigger: wrapper.querySelector<HTMLButtonElement>(`#${prefix}-btn`)!,
      backdrop: wrapper.querySelector<HTMLElement>(`#${prefix}-backdrop`)!,
      panel: wrapper.querySelector<HTMLElement>(`#${prefix}-panel`)!,
      closeBtn: wrapper.querySelector<HTMLButtonElement>(`#${prefix}-close`)!,
      item1: wrapper.querySelector<HTMLAnchorElement>(`#${prefix}-item1`)!,
      actionBtn: wrapper.querySelector<HTMLButtonElement>(`#${prefix}-action`)!,
      outsideBtn: wrapper.querySelector<HTMLButtonElement>(
        `#${prefix}-outside`
      )!,
    };
  }

  test("preserves bindDismissable focus semantics: focuses trigger on Escape, does NOT steal focus on outside click", () => {
    const fix = createPopoverFixture("p1");
    const popover = new AnchoredPopoverController({
      root: fix.wrapper,
      getPanel: () => fix.panel,
      getTrigger: () => fix.trigger,
      getBackdrop: () => fix.backdrop,
      getCloseBtn: () => fix.closeBtn,
    });
    popover.connect();

    // 1. Escape focuses trigger
    popover.open();
    expect(popover.isOpen).toBe(true);
    expect(document.activeElement).toBe(fix.closeBtn);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(popover.isOpen).toBe(false);
    expect(document.activeElement).toBe(fix.trigger);

    // 2. Outside click closes popover WITHOUT yanking focus to trigger
    popover.open();
    expect(popover.isOpen).toBe(true);
    fix.outsideBtn.focus();
    expect(document.activeElement).toBe(fix.outsideBtn);

    fix.outsideBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(popover.isOpen).toBe(false);
    expect(document.activeElement).toBe(fix.outsideBtn);

    popover.dispose();
  });

  test("cleanly resets DOM state (hidden, backdrop, aria-expanded) on dispose/disconnect", () => {
    const fix = createPopoverFixture("p2");
    const popover = new AnchoredPopoverController({
      root: fix.wrapper,
      getPanel: () => fix.panel,
      getTrigger: () => fix.trigger,
      getBackdrop: () => fix.backdrop,
      getCloseBtn: () => fix.closeBtn,
    });
    popover.connect();
    popover.open();

    expect(popover.isOpen).toBe(true);
    expect(fix.panel.hidden).toBe(false);
    expect(fix.backdrop.hidden).toBe(false);
    expect(fix.trigger.getAttribute("aria-expanded")).toBe("true");

    popover.dispose();

    expect(popover.isOpen).toBe(false);
    expect(fix.panel.hidden).toBe(true);
    expect(fix.backdrop.hidden).toBe(true);
    expect(fix.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("enforces grouped mutual exclusion via morcus:popover-will-open while ignoring other groups", () => {
    const fixA = createPopoverFixture("a");
    const fixB = createPopoverFixture("b");
    const fixC = createPopoverFixture("c");

    const popoverA = new AnchoredPopoverController({
      root: fixA.wrapper,
      group: "reader-chrome",
      getPanel: () => fixA.panel,
      getTrigger: () => fixA.trigger,
      getBackdrop: () => fixA.backdrop,
      getCloseBtn: () => fixA.closeBtn,
    });
    const popoverB = new AnchoredPopoverController({
      root: fixB.wrapper,
      group: "reader-chrome",
      getPanel: () => fixB.panel,
      getTrigger: () => fixB.trigger,
      getBackdrop: () => fixB.backdrop,
      getCloseBtn: () => fixB.closeBtn,
    });
    const popoverC = new AnchoredPopoverController({
      root: fixC.wrapper,
      group: "independent-group",
      getPanel: () => fixC.panel,
      getTrigger: () => fixC.trigger,
      getBackdrop: () => fixC.backdrop,
      getCloseBtn: () => fixC.closeBtn,
    });

    popoverA.connect();
    popoverB.connect();
    popoverC.connect();

    popoverA.open();
    expect(popoverA.isOpen).toBe(true);

    // Opening C (different group) leaves A open
    popoverC.open();
    expect(popoverC.isOpen).toBe(true);
    expect(popoverA.isOpen).toBe(true);

    // Opening B (same "reader-chrome" group) closes A while leaving C open
    popoverB.open();
    expect(popoverB.isOpen).toBe(true);
    expect(popoverA.isOpen).toBe(false);
    expect(fixA.panel.hidden).toBe(true);
    expect(fixA.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(popoverC.isOpen).toBe(true);

    popoverA.dispose();
    popoverB.dispose();
    popoverC.dispose();
  });

  test("trapFocus cycles Tab and Shift+Tab within panel and unbinds cleanly", () => {
    const fix = createPopoverFixture("trap");
    fix.panel.hidden = false;
    const unbind = trapFocus(fix.panel);

    fix.actionBtn.focus();
    expect(document.activeElement).toBe(fix.actionBtn);

    // Tab from last wraps to first
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(fix.closeBtn);

    // Shift+Tab from first wraps to last
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(fix.actionBtn);

    unbind();
  });

  test("trapFocus skips hidden and display:none elements when cycling focus", () => {
    const fix = createPopoverFixture("trap-hidden");
    fix.panel.hidden = false;
    fix.item1.hidden = true;
    fix.actionBtn.style.display = "none";

    const unbind = trapFocus(fix.panel);
    fix.closeBtn.focus();
    expect(document.activeElement).toBe(fix.closeBtn);

    // Tab wraps directly back to closeBtn because it is the only visible focusable element
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(document.activeElement).toBe(fix.closeBtn);

    unbind();
  });

  test("trapFocus registers keydown on document and not on window", () => {
    const fix = createPopoverFixture("trap-listeners");
    fix.panel.hidden = false;

    const docSpy = jest.spyOn(document, "addEventListener");
    const winSpy = jest.spyOn(window, "addEventListener");

    const unbind = trapFocus(fix.panel);

    expect(docSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(winSpy).not.toHaveBeenCalledWith("keydown", expect.anything());

    unbind();
    docSpy.mockRestore();
    winSpy.mockRestore();
  });

  test("bindDismissable registers keydown on document and invokes onDismiss exactly once on Escape", () => {
    const fix = createPopoverFixture("dismiss-test");
    const onDismiss = jest.fn();

    const winSpy = jest.spyOn(window, "addEventListener");
    const docSpy = jest.spyOn(document, "addEventListener");

    const unbind = bindDismissable({
      container: fix.panel,
      triggerEl: fix.trigger,
      isOpen: () => true,
      onDismiss,
    });

    expect(docSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(winSpy).not.toHaveBeenCalledWith("keydown", expect.anything());

    // Dispatch Escape with bubbles: true so it bubbles document -> window
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);

    unbind();
    winSpy.mockRestore();
    docSpy.mockRestore();
  });

  test("assertConnected logs console.error when targeting detached element", () => {
    allowDetachedDomWritesForTest();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const connectedEl = document.createElement("div");
    connectedEl.id = "live-el";
    container.appendChild(connectedEl);

    assertConnected(connectedEl, container);
    expect(errorSpy).not.toHaveBeenCalled();

    const detachedEl = document.createElement("div");
    detachedEl.id = "detached-el";
    assertConnected(detachedEl, container);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("<div#detached-el>")
    );
  });
});
