/**
 * jsdom shims for element layout and visibility APIs.
 *
 * jsdom does not implement a CSS layout or rendering engine, so `offsetParent`
 * is always `null` and `getClientRects()` always returns `[]` (`length === 0`).
 *
 * These shims provide lightweight, attribute- and style-aware fallback behavior
 * in jsdom tests so visibility checks (e.g. `el.offsetParent !== null || el.getClientRects().length > 0`)
 * work accurately without needing `navigator.userAgent.includes("jsdom")` checks
 * in shipped client code.
 */

class MockDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}

function createSingleRectList(): MockDOMRectList {
  const list = new MockDOMRectList();
  list.push({
    x: 0,
    y: 0,
    top: 0,
    bottom: 20,
    left: 0,
    right: 100,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  });
  return list;
}

export function installLayoutShims(): void {
  if (typeof HTMLElement === "undefined") return;

  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    writable: true,
    value: function (this: HTMLElement): DOMRectList {
      if (
        this.isConnected &&
        !this.hasAttribute("hidden") &&
        !this.closest("[hidden]") &&
        this.style.display !== "none" &&
        this.style.visibility !== "hidden"
      ) {
        return createSingleRectList();
      }
      return new MockDOMRectList();
    },
  });

  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement): Element | null {
      if (
        !this.isConnected ||
        this.hasAttribute("hidden") ||
        this.closest("[hidden]") ||
        this.style.display === "none" ||
        this.style.visibility === "hidden"
      ) {
        return null;
      }
      return this.parentElement ?? this.ownerDocument.body ?? null;
    },
  });
}
