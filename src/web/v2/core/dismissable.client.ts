import type { CleanupFn } from "@/web/v2/core/disposable.client";

/**
 * Dismissable overlay coordination (click/pointerdown outside + Escape key).
 */

/** Why a dismissable overlay closed: an outside pointer, or Escape. */
export type DismissReason = "pointer" | "escape";

export interface DismissableOptions {
  /** The container element whose outside clicks trigger dismissal. */
  container: HTMLElement | (() => HTMLElement | null);
  /** Predicate reporting whether the overlay is currently open. */
  isOpen: () => boolean;
  /**
   * Action to invoke on dismissal. Gets why it was dismissed, not the event:
   * these listeners bypass the activation gate in `LifetimeScope.listen` (an
   * outside click must still close the overlay when it lands in a failed
   * component), so callers must not be able to cancel the native action.
   */
  onDismiss: (reason: DismissReason) => void;
  /** Optional trigger element to return focus to on Escape key. */
  triggerEl?: HTMLElement | (() => HTMLElement | null) | null;
  /** Listen on pointerdown/mousedown (preferred for instant touch/mouse dismiss) or click. */
  listenPointerDown?: boolean;
  /** Optional predicate to ignore clicks on certain elements (e.g. trigger buttons). */
  ignore?: (target: Node) => boolean;
  /** Optional Document instance to bind listeners on (defaults to global document). */
  doc?: Document;
}

/**
 * Binds global outside-click and Escape key listeners for a popover, dropdown, or modal.
 * Returns an unbind cleanup function.
 */
export function bindDismissable(options: DismissableOptions): CleanupFn {
  const doc = options.doc ?? document;
  const getContainer = (): HTMLElement | null =>
    typeof options.container === "function"
      ? options.container()
      : options.container;

  const getTrigger = (): HTMLElement | null | undefined =>
    typeof options.triggerEl === "function"
      ? options.triggerEl()
      : options.triggerEl;

  const onPointer = (e: Event) => {
    if (!options.isOpen()) return;
    const target = e.target;
    if (!(target instanceof Node)) return;

    if (options.ignore && options.ignore(target)) return;

    const container = getContainer();
    if (container && !container.contains(target)) {
      options.onDismiss("pointer");
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && options.isOpen()) {
      // native-takeover(self): Escape dismisses this overlay (onDismiss) and
      // returns focus to its trigger; only while the overlay is open
      e.preventDefault();
      options.onDismiss("escape");
      const trigger = getTrigger();
      trigger?.focus();
    }
  };

  const pointerEvents = options.listenPointerDown
    ? ["pointerdown", "mousedown"]
    : ["click"];

  pointerEvents.forEach((evt) => doc.addEventListener(evt, onPointer));
  doc.addEventListener("keydown", onKey);

  return () => {
    pointerEvents.forEach((evt) => doc.removeEventListener(evt, onPointer));
    doc.removeEventListener("keydown", onKey);
  };
}
