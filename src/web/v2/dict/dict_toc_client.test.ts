/**
 * @jest-environment jsdom
 */

import { MorcusDictToc } from "@/web/v2/dict/dict_toc.client";

describe("MorcusDictToc custom element", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let matchesMobile = true;

  beforeEach(() => {
    matchesMobile = true;
    originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => {
      const listeners: Array<(e: MediaQueryListEvent) => void> = [];
      return {
        matches: matchesMobile,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn((event, cb) => {
          if (event === "change") listeners.push(cb);
        }),
        removeEventListener: jest.fn((event, cb) => {
          if (event === "change") {
            const idx = listeners.indexOf(cb);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        }),
        dispatchEvent: jest.fn((e) => {
          listeners.forEach((cb) => cb(e));
          return true;
        }),
      };
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = "";
  });

  test("initializes DrawerController on mobile viewport (< 1080px)", () => {
    matchesMobile = true;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details" open>
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    expect(tocEl).toBeInstanceOf(MorcusDictToc);
    expect(tocEl.getDrawerController()).not.toBeNull();
  });

  test("does not initialize DrawerController on desktop viewport (>= 1080px)", () => {
    matchesMobile = false;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details" open>
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    expect(tocEl).toBeInstanceOf(MorcusDictToc);
    expect(tocEl.getDrawerController()).toBeNull();
  });

  test("cleans up DrawerController when disconnected from DOM", () => {
    matchesMobile = true;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details" open>
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    expect(tocEl.getDrawerController()).not.toBeNull();

    tocEl.remove();
    expect(tocEl.getDrawerController()).toBeNull();
  });

  test("unregisters mediaQuery listener when disconnected from DOM", () => {
    matchesMobile = true;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details" open>
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    const mql = (window.matchMedia as jest.Mock).mock.results[0].value;
    expect(mql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
      undefined
    );

    tocEl.remove();
    expect(mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
      undefined
    );
  });

  test("recreates DrawerController when re-attached to DOM", () => {
    matchesMobile = true;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details" open>
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    expect(tocEl.getDrawerController()).not.toBeNull();

    tocEl.remove();
    expect(tocEl.getDrawerController()).toBeNull();

    document.body.appendChild(tocEl);
    expect(tocEl.getDrawerController()).not.toBeNull();
  });

  test("dynamically adapts DrawerController when mediaQuery changes", () => {
    matchesMobile = true;
    document.body.innerHTML = `
      <morcus-dict-toc class="v2-drawer v2-drawer-toc">
        <details class="v2-toc-details">
          <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
          <div class="v2-toc-body">Outline items</div>
        </details>
      </morcus-dict-toc>
    `;

    const tocEl = document.querySelector<MorcusDictToc>("morcus-dict-toc")!;
    const mql = (window.matchMedia as jest.Mock).mock.results[0].value;
    expect(tocEl.getDrawerController()).not.toBeNull();

    // Transition to desktop viewport
    mql.matches = false;
    mql.dispatchEvent(new Event("change"));

    expect(tocEl.getDrawerController()).toBeNull();
    const details = tocEl.querySelector<HTMLDetailsElement>(".v2-toc-details");
    expect(details?.open).toBe(true);

    // Transition back to mobile viewport
    mql.matches = true;
    mql.dispatchEvent(new Event("change"));

    expect(tocEl.getDrawerController()).not.toBeNull();
  });
});
