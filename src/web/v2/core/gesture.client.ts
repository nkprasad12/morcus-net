/**
 * Gesture and Pointer Event utilities.
 */

export interface DragMoveEvent {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  dx: number;
  dy: number;
  pointerEvent: PointerEvent;
}

export interface DragEndEvent extends DragMoveEvent {
  elapsedMs: number;
  velocityX: number;
  velocityY: number;
  isCancelled: boolean;
}

export interface TrackPointerDragOptions {
  /** Optional filter callback; return false to ignore pointerdown (e.g. clicking child buttons). */
  filter?: (e: PointerEvent) => boolean;
  /** Callback fired when drag begins. Return false to cancel dragging. */
  onStart?: (e: PointerEvent) => boolean | void;
  /** Callback fired on each pointermove while dragging. */
  onMove?: (e: DragMoveEvent) => void;
  /** Callback fired when dragging finishes (pointerup or pointercancel). */
  onEnd?: (e: DragEndEvent) => void;
  /** Optional CSS class toggled on handle during active drag. */
  handleActiveClass?: string;
  /** Optional CSS class toggled on document.body during active drag. */
  bodyActiveClass?: string;
}

/**
 * Tracks pointer dragging on a target handle element with pointer capture,
 * delta calculation, velocity measurement, and automatic body/handle class toggling.
 *
 * Returns an unbind cleanup function.
 */
export function trackPointerDrag(
  handle: HTMLElement,
  options: TrackPointerDragOptions
): () => void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let startTime = 0;
  let activePointerId = -1;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return; // Primary pointer only
    if (options.filter && !options.filter(e)) return;
    if (options.onStart && options.onStart(e) === false) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
    startTime = performance.now();
    activePointerId = e.pointerId;

    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}

    if (options.handleActiveClass) {
      handle.classList.add(options.handleActiveClass);
    }
    if (options.bodyActiveClass) {
      document.body.classList.add(options.bodyActiveClass);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    currentX = e.clientX;
    currentY = e.clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;

    options.onMove?.({
      startX,
      startY,
      currentX,
      currentY,
      dx,
      dy,
      pointerEvent: e,
    });
  };

  const finishDrag = (e: PointerEvent, isCancelled: boolean) => {
    if (!isDragging) return;
    isDragging = false;

    try {
      if (activePointerId >= 0 && handle.hasPointerCapture(activePointerId)) {
        handle.releasePointerCapture(activePointerId);
      }
    } catch {}
    activePointerId = -1;

    if (options.handleActiveClass) {
      handle.classList.remove(options.handleActiveClass);
    }
    if (options.bodyActiveClass) {
      document.body.classList.remove(options.bodyActiveClass);
    }

    currentX = e.clientX;
    currentY = e.clientY;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const elapsedMs = Math.max(1, performance.now() - startTime);
    const velocityX = dx / elapsedMs;
    const velocityY = dy / elapsedMs;

    options.onEnd?.({
      startX,
      startY,
      currentX,
      currentY,
      dx,
      dy,
      elapsedMs,
      velocityX,
      velocityY,
      isCancelled,
      pointerEvent: e,
    });
  };

  const onPointerUp = (e: PointerEvent) => finishDrag(e, false);
  const onPointerCancel = (e: PointerEvent) => finishDrag(e, true);

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", onPointerUp);
  handle.addEventListener("pointercancel", onPointerCancel);

  return () => {
    if (isDragging) {
      if (options.handleActiveClass) {
        handle.classList.remove(options.handleActiveClass);
      }
      if (options.bodyActiveClass) {
        document.body.classList.remove(options.bodyActiveClass);
      }
    }
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerCancel);
  };
}
