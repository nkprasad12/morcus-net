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

  if (typeof window !== "undefined") {
    window.scrollTo = () => {};
    window.scrollBy = () => {};
  }

  if (typeof HTMLIFrameElement !== "undefined") {
    const origContentWindowDesc = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      "contentWindow"
    );
    if (origContentWindowDesc?.get) {
      const shimmedWindows = new WeakMap<HTMLIFrameElement, object>();

      Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        configurable: true,
        get(this: HTMLIFrameElement): object | null {
          const rawWin: unknown = origContentWindowDesc.get?.call(this);
          if (typeof rawWin !== "object" || rawWin === null) return null;

          let shimmed = shimmedWindows.get(this);
          if (!shimmed) {
            let replacedUrl: URL | null = null;

            const locShim = {
              replace(url: string): void {
                replacedUrl = new URL(url, window.location.origin);
              },
              assign(url: string): void {
                replacedUrl = new URL(url, window.location.origin);
              },
              get href(): string {
                return replacedUrl?.href ?? "about:blank";
              },
              get pathname(): string {
                return replacedUrl?.pathname ?? "blank";
              },
              get search(): string {
                return replacedUrl?.search ?? "";
              },
              get hash(): string {
                return replacedUrl?.hash ?? "";
              },
              get origin(): string {
                return replacedUrl?.origin ?? "null";
              },
            };

            shimmed = new Proxy(rawWin, {
              get(target, prop): unknown {
                if (prop === "location") return locShim;
                const val: unknown = Reflect.get(target, prop, target);
                return typeof val === "function" ? val.bind(target) : val;
              },
            });
            shimmedWindows.set(this, shimmed);
          }
          return shimmed;
        },
      });
    }
  }
}
