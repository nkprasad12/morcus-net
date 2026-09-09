/**
 * Dismissable overlay coordination (click/pointerdown outside + Escape key).
 */

export interface DismissableOptions {
  /** The container element whose outside clicks trigger dismissal. */
  container: HTMLElement | (() => HTMLElement | null);
  /** Predicate reporting whether the overlay is currently open. */
  isOpen: () => boolean;
  /** Action to invoke on dismissal. */
  onDismiss: () => void;
  /** Optional trigger element to return focus to on Escape key. */
  triggerEl?: HTMLElement | (() => HTMLElement | null) | null;
  /** Listen on pointerdown/mousedown (preferred for instant touch/mouse dismiss) or click. */
  listenPointerDown?: boolean;
  /** Optional predicate to ignore clicks on certain elements (e.g. trigger buttons). */
  ignore?: (target: Node) => boolean;
}

/**
 * Binds global outside-click and Escape key listeners for a popover, dropdown, or modal.
 * Returns an unbind function.
 */
export function bindDismissable(options: DismissableOptions): () => void {
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
      options.onDismiss();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && options.isOpen()) {
      options.onDismiss();
      const trigger = getTrigger();
      trigger?.focus();
    }
  };

  const pointerEvents = options.listenPointerDown
    ? ["pointerdown", "mousedown"]
    : ["click"];

  pointerEvents.forEach((evt) => document.addEventListener(evt, onPointer));
  document.addEventListener("keydown", onKey);

  return () => {
    pointerEvents.forEach((evt) =>
      document.removeEventListener(evt, onPointer)
    );
    document.removeEventListener("keydown", onKey);
  };
}
