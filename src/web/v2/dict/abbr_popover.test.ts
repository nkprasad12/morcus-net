/**
 * @jest-environment jsdom
 */

import { setupAbbrPopover } from "@/web/v2/dict/abbr_popover.client";

describe("setupAbbrPopover", () => {
  let cleanup: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
  });

  test("returns no-op cleanup when #abbr-popover is absent", () => {
    cleanup = setupAbbrPopover(document, window);
    expect(() => cleanup()).not.toThrow();
  });

  test("opens popover on .lsHover click, caches title into dataset, and positions over target", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Cicero, Marcus Tullius">Cic.</span>
      <div id="outside">Outside</div>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    // Provide mock geometry
    abbr.getBoundingClientRect = () => ({
      left: 100,
      right: 150,
      top: 200,
      bottom: 220,
      width: 50,
      height: 20,
      x: 100,
      y: 200,
      toJSON: () => {},
    });

    cleanup = setupAbbrPopover(document, window);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    abbr.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(abbr.dataset.abbrExpansion).toBe("Cicero, Marcus Tullius");
    expect(abbr.hasAttribute("title")).toBe(false);
    expect(popover.textContent).toBe("Cicero, Marcus Tullius");
    expect(popover.style.display).toBe("block");
    expect(popover.style.position).toBe("absolute");
    expect(popover.style.left).toMatch(/\d+px/);
    expect(popover.style.top).toMatch(/\d+px/);
  });

  test("toggles off when clicking the same active element again", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Vergil">Verg.</span>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);

    // First click: opens
    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("block");

    // Second click: closes
    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("none");
  });

  test("supports native showPopover / hidePopover when available", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Horace">Hor.</span>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    const showPopover = jest.fn();
    const hidePopover = jest.fn();
    let isOpen = false;

    popover.showPopover = () => {
      isOpen = true;
      showPopover();
    };
    popover.hidePopover = () => {
      isOpen = false;
      hidePopover();
    };
    popover.matches = (selector: string) => {
      if (selector === ":popover-open") return isOpen;
      return false;
    };

    cleanup = setupAbbrPopover(document, window);

    // Open
    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(showPopover).toHaveBeenCalled();

    // Toggle off
    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(hidePopover).toHaveBeenCalled();
  });

  test("dismisses on outside click", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Ovid">Ov.</span>
      <div id="outside">Outside</div>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);

    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("block");

    // Clicking outside closes it
    outside.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("none");
  });

  test("dismisses on outside pointerdown (touch tap outside)", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Tacitus">Tac.</span>
      <div id="outside">Outside</div>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);

    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("block");

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popover.style.display).toBe("none");
  });

  test("dismisses on Escape keydown", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Livy">Liv.</span>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);

    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(popover.style.display).toBe("block");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(popover.style.display).toBe("none");
  });

  test("keyboard activation: Enter and Space on focused .lsHover opens popover", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <button class="lsHover" title="Caesar">Caes.</button>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);

    abbr.focus();

    // Enter
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(popover.style.display).toBe("block");

    // Close with Escape
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(popover.style.display).toBe("none");

    // Space
    const spaceEvent = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(popover.style.display).toBe("block");
  });

  test("repositions popover on window resize if active", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Sallust">Sall.</span>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    let targetLeft = 100;
    abbr.getBoundingClientRect = () => ({
      left: targetLeft,
      right: targetLeft + 50,
      top: 200,
      bottom: 220,
      width: 50,
      height: 20,
      x: targetLeft,
      y: 200,
      toJSON: () => {},
    });

    cleanup = setupAbbrPopover(document, window);

    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    const initialLeft = popover.style.left;

    targetLeft = 300;
    window.dispatchEvent(new Event("resize"));
    expect(popover.style.left).not.toBe(initialLeft);
  });

  test("clamps position to viewport padding when near left or right edge", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Pliny">Plin.</span>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;

    // Near left edge (e.g. left = 0)
    abbr.getBoundingClientRect = () => ({
      left: 0,
      right: 20,
      top: 100,
      bottom: 120,
      width: 20,
      height: 20,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    cleanup = setupAbbrPopover(document, window);
    abbr.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );

    // Left should be clamped to at least 8px
    expect(popover.style.left).toBe("8px");
  });

  test("cleanup removes all document and window event listeners", () => {
    document.body.innerHTML = `
      <div id="abbr-popover"></div>
      <span class="lsHover" title="Juvenal">Juv.</span>
      <div id="outside">Outside</div>
    `;
    const popover = document.getElementById("abbr-popover") as HTMLElement;
    const abbr = document.querySelector(".lsHover") as HTMLElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupAbbrPopover(document, window);
    cleanup();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    abbr.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(popover.style.display).toBe("");

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    window.dispatchEvent(new Event("resize"));
  });
});
