import type { CleanupFn } from "@/web/ui/core/dom/disposable.client";

/**
 * Dismissable overlay coordination (click/pointerdown outside + Escape key).
 */

/** Why a dismissable overlay closed: an outside pointer, or Escape. */
type DismissReason = "pointer" | "escape";

interface DismissableOptions {
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
  /**
   * Optional predicate matching nodes outside `container` that belong to this
   * overlay (e.g. its trigger buttons): clicks on them are not outside clicks,
   * and focus on them is in scope for Escape dismissal.
   */
  ignore?: (target: Node) => boolean;
  /** Optional Document instance to bind listeners on (defaults to global document). */
  doc?: Document;
}

/**
 * Whether a `<dialog open>` outside `el` owns the keyboard.
 *
 * Assumes every open dialog is modal: V2 opens dialogs only via
 * `showModal()` (`setupModalDialog`). A non-modal `show()` dialog doesn't own
 * the keyboard and would wrongly match here. `:modal` would be exact, but
 * jsdom doesn't support it.
 */
export function hasForeignDialog(
  doc: Document,
  el: Node | null | undefined
): boolean {
  const dialog = doc.querySelector("dialog[open]");
  return dialog !== null && !el?.contains(dialog);
}

/**
 * Whether keyboard focus `active` is in a widget's context: nowhere
 * (`null` / `<body>` / `<html>`) or inside one of `owners`.
 */
export function isFocusIn(
  doc: Document,
  active: Element | null,
  owners: (Node | null | undefined)[]
): boolean {
  return (
    !active ||
    active === doc.body ||
    active === doc.documentElement ||
    owners.some((o) => o?.contains(active))
  );
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
    if (
      e.defaultPrevented ||
      e.isComposing ||
      e.key !== "Escape" ||
      !options.isOpen()
    ) {
      return;
    }
    const container = getContainer();
    // A modal dialog outside this overlay owns Escape. Otherwise only dismiss
    // when focus is in this overlay's context: Escape in an unrelated control
    // (e.g. the search input) belongs to that control.
    if (hasForeignDialog(doc, container)) return;
    const target = e.target;
    const active =
      target instanceof Element &&
      target !== doc.body &&
      target !== doc.documentElement
        ? target
        : doc.activeElement;
    if (
      !isFocusIn(doc, active, [container, getTrigger()]) &&
      !(active && options.ignore?.(active))
    ) {
      return;
    }
    // With focus on <body>, every open overlay is in context, so the first
    // registered listener takes Escape and the rest bail on defaultPrevented:
    // registration order decides. Today that's the right order (boot-time
    // singletons like the abbreviation popover bind before transient ones
    // like the section editor), so keep it in mind when changing bind order.
    //
    // Escape dismisses this overlay (onDismiss) and returns focus to its
    // trigger; only while the overlay is open
    e.preventDefault();
    options.onDismiss("escape");
    getTrigger()?.focus();
  };

  const pointerEvents = options.listenPointerDown
    ? ["pointerdown", "mousedown"]
    : ["click"];

  // Raw listeners, not a LifetimeScope: outside clicks must dismiss even when
  // they land in an owner that isn't running (the activation gate would skip
  // those). Neither cancels an activation: pointer events aren't gated, a
  // click is never cancelled here, and Escape isn't an activating key.
  pointerEvents.forEach((evt) =>
    // eslint-disable-next-line no-restricted-syntax
    doc.addEventListener(evt, onPointer)
  );
  // eslint-disable-next-line no-restricted-syntax
  doc.addEventListener("keydown", onKey);

  return () => {
    pointerEvents.forEach((evt) => doc.removeEventListener(evt, onPointer));
    doc.removeEventListener("keydown", onKey);
  };
}
