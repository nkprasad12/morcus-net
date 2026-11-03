/**
 * jsdom shims for layout, visibility, scrolling, media-query, dialog and
 * CSSOM APIs omitted by jsdom:
 *
 * - `HTMLElement.prototype.getClientRects` and `offsetParent`: attribute- and
 *   style-aware layout stubs so visibility checks work without user-agent
 *   branching in client code.
 * - `CSS.escape`: spec-compliant CSSOM identifier serializer.
 * - `HTMLDialogElement.prototype.showModal` / `close`: toggles the `open`
 *   attribute and dispatches `close` synchronously on `close()`. (Note:
 *   intentionally more lenient than browsers — `showModal()` does not throw
 *   `InvalidStateError` on disconnected or already-open `<dialog>` elements so
 *   isolated unit tests can exercise dialogs without full document scaffolding,
 *   and `close()` fires `close` synchronously rather than queuing a task.)
 * - `window.matchMedia`: returns a `MediaQueryList` EventTarget with
 *   `matches: false` by default.
 * - `window.scrollTo` / `scrollBy`, `Element.prototype.scrollTo` (updates
 *   `scrollTop` and `scrollLeft`), and `Element.prototype.scrollIntoView`.
 * - `HTMLIFrameElement.prototype.contentWindow`: tracks `location.replace` /
 *   `location.assign` navigations.
 */

class MockDOMRectList extends Array<DOMRect> implements DOMRectList {
  item(index: number): DOMRect | null {
    return this[index] ?? null;
  }
}

class MockMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches = false;
  readonly media: string;
  onchange:
    | ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown)
    | null = null;

  constructor(media: string) {
    super();
    this.media = media;
  }

  addListener(): void {}
  removeListener(): void {}
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

  // CSSOM §2.1 "Serialize an identifier" (https://drafts.csswg.org/cssom/#serialize-an-identifier).
  const escapeCssIdent = (value: string): string => {
    const str = String(value);
    const len = str.length;
    if (len === 0) return "";
    const firstCodeUnit = str.charCodeAt(0);
    if (len === 1 && firstCodeUnit === 0x002d) return "\\-";
    let result = "";
    for (let i = 0; i < len; i++) {
      const codeUnit = str.charCodeAt(i);
      if (codeUnit === 0x0000) {
        result += "\uFFFD";
      } else if (
        (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
        codeUnit === 0x007f ||
        (i === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (i === 1 &&
          codeUnit >= 0x0030 &&
          codeUnit <= 0x0039 &&
          firstCodeUnit === 0x002d)
      ) {
        result += `\\${codeUnit.toString(16)} `;
      } else if (
        codeUnit >= 0x0080 ||
        codeUnit === 0x002d ||
        codeUnit === 0x005f ||
        (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
        (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
        (codeUnit >= 0x0061 && codeUnit <= 0x007a)
      ) {
        result += str.charAt(i);
      } else {
        result += `\\${str.charAt(i)}`;
      }
    }
    return result;
  };
  if (typeof globalThis.CSS === "undefined") {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      writable: true,
      value: { escape: escapeCssIdent },
    });
  } else if (typeof CSS.escape !== "function") {
    CSS.escape = escapeCssIdent;
  }

  if (typeof HTMLDialogElement !== "undefined") {
    if (
      typeof Reflect.get(HTMLDialogElement.prototype, "showModal") !==
      "function"
    ) {
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
        configurable: true,
        writable: true,
        value: function (this: HTMLDialogElement): void {
          this.setAttribute("open", "");
        },
      });
    }
    if (
      typeof Reflect.get(HTMLDialogElement.prototype, "close") !== "function"
    ) {
      Object.defineProperty(HTMLDialogElement.prototype, "close", {
        configurable: true,
        writable: true,
        value: function (this: HTMLDialogElement): void {
          if (this.hasAttribute("open")) {
            this.removeAttribute("open");
            this.dispatchEvent(new Event("close"));
          }
        },
      });
    }
  }

  if (typeof window !== "undefined") {
    window.scrollTo = () => {};
    window.scrollBy = () => {};
    if (typeof window.matchMedia !== "function") {
      window.matchMedia = (query: string): MediaQueryList =>
        new MockMediaQueryList(query);
    }
    if (typeof Reflect.get(Element.prototype, "scrollTo") !== "function") {
      Object.defineProperty(Element.prototype, "scrollTo", {
        configurable: true,
        writable: true,
        value: function (
          this: Element,
          optionsOrX?: ScrollToOptions | number,
          y?: number
        ): void {
          if (typeof optionsOrX === "number") {
            this.scrollLeft = optionsOrX;
            if (typeof y === "number") this.scrollTop = y;
          } else if (optionsOrX && typeof optionsOrX === "object") {
            if (typeof optionsOrX.top === "number")
              this.scrollTop = optionsOrX.top;
            if (typeof optionsOrX.left === "number")
              this.scrollLeft = optionsOrX.left;
          }
        },
      });
    }
    if (
      typeof Reflect.get(Element.prototype, "scrollIntoView") !== "function"
    ) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: (): void => {},
      });
    }
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
