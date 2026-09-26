/**
 * jsdom shims for the Pointer Events API, which jsdom does not implement.
 *
 * Any test that drives `trackPointerDrag` (the drawer, the reader's desktop
 * splitter) needs these: without them `new PointerEvent(...)` throws a
 * ReferenceError, and the capture methods are missing from `Element`.
 *
 * Call once at module scope, before the tests run.
 */
export function installPointerEventShims(): void {
  if (typeof window.PointerEvent === "undefined") {
    class MockPointerEvent extends MouseEvent {
      readonly pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    }
    // Defined rather than assigned: the mock only implements the slice of
    // `PointerEvent` the drag helper reads, so it is not assignable to the
    // real constructor type, and this file is linted as production code (no
    // type assertions).
    for (const target of [window, globalThis]) {
      Object.defineProperty(target, "PointerEvent", {
        configurable: true,
        writable: true,
        value: MockPointerEvent,
      });
    }
  }

  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => true;
  }
}
