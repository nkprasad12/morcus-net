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
  /**
   * Optional second element that also receives `handleActiveClass` for the duration of
   * the drag, typically the panel the handle resizes.
   *
   * The handle is usually a child of the thing being dragged, so a rule written as
   * `.panel.is-dragging` would never match without this. The canonical use is
   * suppressing the panel's own height transition mid-drag: while it is live, every
   * pointermove re-targets a fresh eased interpolation and the panel chases the
   * pointer instead of tracking it.
   */
  activeClassTarget?: HTMLElement | null;
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

  /**
   * Toggles every drag-state class at once.
   *
   * Centralized because these classes have three separate removal paths (pointerup,
   * pointercancel, and unbind while still dragging); toggling them individually at
   * each one invites a state that is set but never cleared.
   */
  const setDragClasses = (active: boolean) => {
    const { handleActiveClass, activeClassTarget, bodyActiveClass } = options;
    if (handleActiveClass) {
      handle.classList.toggle(handleActiveClass, active);
      activeClassTarget?.classList.toggle(handleActiveClass, active);
    }
    if (bodyActiveClass) {
      document.body.classList.toggle(bodyActiveClass, active);
    }
  };

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

    setDragClasses(true);
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

    setDragClasses(false);

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
      setDragClasses(false);
    }
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", onPointerUp);
    handle.removeEventListener("pointercancel", onPointerCancel);
  };
}
