/**
 * @jest-environment jsdom
 */

import {
  expandAncestorDisclosures,
  triggerAnchorHighlight,
  setupAnchorScroll,
} from "@/web/v2/core/anchor_scroll.client";

describe("expandAncestorDisclosures", () => {
  test("expands all closed ancestor <details> elements", () => {
    document.body.innerHTML = `
      <details id="outer">
        <details id="inner">
          <div id="target">Content</div>
        </details>
      </details>
    `;
    const outer = document.getElementById("outer") as HTMLDetailsElement;
    const inner = document.getElementById("inner") as HTMLDetailsElement;
    const target = document.getElementById("target") as HTMLElement;

    expect(outer.open).toBe(false);
    expect(inner.open).toBe(false);

    expandAncestorDisclosures(target);

    expect(outer.open).toBe(true);
    expect(inner.open).toBe(true);
  });

  test("expands .v2-dict-toggle inside an ancestor .v2-dict-card", () => {
    document.body.innerHTML = `
      <div class="v2-dict-card">
        <details class="v2-dict-toggle">
          <summary>Toggle</summary>
          <div id="target">Sense text</div>
        </details>
      </div>
    `;
    const toggle = document.querySelector(
      ".v2-dict-toggle"
    ) as HTMLDetailsElement;
    const target = document.getElementById("target") as HTMLElement;

    expect(toggle.open).toBe(false);

    expandAncestorDisclosures(target);

    expect(toggle.open).toBe(true);
  });

  test("leaves already open <details> untouched and handles element with no <details> ancestors", () => {
    document.body.innerHTML = `
      <details id="already-open" open>
        <div id="target">Content</div>
      </details>
      <div id="standalone">No details</div>
    `;
    const details = document.getElementById(
      "already-open"
    ) as HTMLDetailsElement;
    const target = document.getElementById("target") as HTMLElement;
    const standalone = document.getElementById("standalone") as HTMLElement;

    expandAncestorDisclosures(target);
    expect(details.open).toBe(true);

    expect(() => expandAncestorDisclosures(standalone)).not.toThrow();
  });
});

describe("triggerAnchorHighlight", () => {
  test("ignores #top and .v2-dict-card elements", () => {
    document.body.innerHTML = `
      <div id="top">Top</div>
      <div id="card" class="v2-dict-card">Card</div>
    `;
    const top = document.getElementById("top") as HTMLElement;
    const card = document.getElementById("card") as HTMLElement;

    triggerAnchorHighlight(top);
    triggerAnchorHighlight(card);

    expect(top.classList.contains("v2-target-active")).toBe(false);
    expect(card.classList.contains("v2-target-active")).toBe(false);
  });

  test("adds v2-target-active and removes it upon animationend", () => {
    document.body.innerHTML = `<div id="sense-1">Sense</div>`;
    const el = document.getElementById("sense-1") as HTMLElement;

    triggerAnchorHighlight(el);
    expect(el.classList.contains("v2-target-active")).toBe(true);

    el.dispatchEvent(new Event("animationend"));
    expect(el.classList.contains("v2-target-active")).toBe(false);
  });

  test("re-triggers animation by resetting class and forcing reflow if already active", () => {
    document.body.innerHTML = `<div id="sense-1" class="v2-target-active">Sense</div>`;
    const el = document.getElementById("sense-1") as HTMLElement;

    triggerAnchorHighlight(el);
    expect(el.classList.contains("v2-target-active")).toBe(true);
  });
});

describe("setupAnchorScroll", () => {
  let cleanup: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
  });

  test("expands ancestor disclosures on initial load if window.location.hash matches an element", () => {
    document.body.innerHTML = `
      <details id="entry-details">
        <div id="section-1">Text</div>
      </details>
    `;
    const details = document.getElementById(
      "entry-details"
    ) as HTMLDetailsElement;
    const mockWin = {
      location: { hash: "#section-1", pathname: "/", search: "" },
      history: { replaceState: jest.fn() },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    expect(details.open).toBe(true);
  });

  test("ignores clicks when defaultPrevented is true (preserving permalink copy ordering)", () => {
    document.body.innerHTML = `
      <a id="link" href="#target">Jump</a>
      <div id="target">Target</div>
    `;
    const link = document.getElementById("link") as HTMLAnchorElement;
    const replaceState = jest.fn();
    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    event.preventDefault(); // Simulates a lower-level handler like permalink copy consuming the event
    link.dispatchEvent(event);

    expect(replaceState).not.toHaveBeenCalled();
  });

  test("ignores clicks on non-hash or excluded anchors (#, #top, .v2-back-to-top)", () => {
    document.body.innerHTML = `
      <a id="external" href="https://example.com">External</a>
      <a id="bare-hash" href="#">Bare</a>
      <a id="top-hash" href="#top">Top</a>
      <a id="back-to-top" class="v2-back-to-top" href="#top">Back to top</a>
    `;
    const replaceState = jest.fn();
    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    for (const id of ["external", "bare-hash", "top-hash", "back-to-top"]) {
      const a = document.getElementById(id) as HTMLAnchorElement;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      a.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(replaceState).not.toHaveBeenCalled();
    }
  });

  test("ignores clicks when target element does not exist in DOM", () => {
    document.body.innerHTML = `<a id="link" href="#nonexistent">Jump</a>`;
    const link = document.getElementById("link") as HTMLAnchorElement;
    const replaceState = jest.fn();
    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("handles valid in-page anchor jumps with smooth scroll and history update", () => {
    document.body.innerHTML = `
      <details id="details">
        <a id="link" href="#target">Jump</a>
        <div id="target">Target</div>
      </details>
    `;
    const link = document.getElementById("link") as HTMLAnchorElement;
    const target = document.getElementById("target") as HTMLElement;
    const scrollIntoView = jest.fn();
    target.scrollIntoView = scrollIntoView;

    const replaceState = jest.fn();
    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "#target");
    expect(target.classList.contains("v2-target-active")).toBe(true);
  });

  test("uses instant scroll for .v2-jump-pill and .v2-dict-card targets", () => {
    document.body.innerHTML = `
      <a id="pill-link" class="v2-jump-pill" href="#card-target">Jump Pill</a>
      <div id="card-target" class="v2-dict-card">Card Target</div>
    `;
    const link = document.getElementById("pill-link") as HTMLAnchorElement;
    const target = document.getElementById("card-target") as HTMLElement;
    const scrollIntoView = jest.fn();
    target.scrollIntoView = scrollIntoView;

    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState: jest.fn() },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant" });
  });

  test("cleanup removes document click listener", () => {
    document.body.innerHTML = `
      <a id="link" href="#target">Jump</a>
      <div id="target">Target</div>
    `;
    const link = document.getElementById("link") as HTMLAnchorElement;
    const target = document.getElementById("target") as HTMLElement;
    const scrollIntoView = jest.fn();
    target.scrollIntoView = scrollIntoView;

    const replaceState = jest.fn();
    const mockWin = {
      location: { hash: "", pathname: "/", search: "" },
      history: { replaceState },
    } as unknown as Window;

    cleanup = setupAnchorScroll(document, mockWin);
    cleanup(); // Unregister listener

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
