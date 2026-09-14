/**
 * @jest-environment jsdom
 */

import { setupMobileMenu } from "@/web/v2/shell/mobile_menu.client";

describe("setupMobileMenu", () => {
  let cleanup: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
  });

  test("closes open mobile menu when pointerdown is outside", () => {
    document.body.innerHTML = `
      <details class="v2-mobile-menu" open>
        <summary>Menu</summary>
        <nav><a href="/v2/dicts">Dict</a></nav>
      </details>
      <div id="outside">Outside</div>
    `;
    const menu = document.querySelector(
      ".v2-mobile-menu"
    ) as HTMLDetailsElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupMobileMenu(document);
    expect(menu.open).toBe(true);

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.open).toBe(false);
  });

  test("leaves open mobile menu open when pointerdown is inside", () => {
    document.body.innerHTML = `
      <details class="v2-mobile-menu" open>
        <summary>Menu</summary>
        <nav><a id="inside-link" href="/v2/dicts">Dict</a></nav>
      </details>
    `;
    const menu = document.querySelector(
      ".v2-mobile-menu"
    ) as HTMLDetailsElement;
    const inside = document.getElementById("inside-link") as HTMLElement;

    cleanup = setupMobileMenu(document);
    expect(menu.open).toBe(true);

    inside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.open).toBe(true);
  });

  test("does nothing if mobile menu is already closed", () => {
    document.body.innerHTML = `
      <details class="v2-mobile-menu">
        <summary>Menu</summary>
      </details>
      <div id="outside">Outside</div>
    `;
    const menu = document.querySelector(
      ".v2-mobile-menu"
    ) as HTMLDetailsElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupMobileMenu(document);
    expect(menu.open).toBe(false);

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.open).toBe(false);
  });

  test("handles missing mobile menu gracefully", () => {
    document.body.innerHTML = `<div>No menu here</div>`;
    cleanup = setupMobileMenu(document);
    expect(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    }).not.toThrow();
  });

  test("cleanup removes pointerdown listener", () => {
    document.body.innerHTML = `
      <details class="v2-mobile-menu" open>
        <summary>Menu</summary>
      </details>
      <div id="outside">Outside</div>
    `;
    const menu = document.querySelector(
      ".v2-mobile-menu"
    ) as HTMLDetailsElement;
    const outside = document.getElementById("outside") as HTMLElement;

    cleanup = setupMobileMenu(document);
    cleanup();

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.open).toBe(true);
  });
});
