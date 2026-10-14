/**
 * Unified modal dialog coordination utility.
 *
 * Handles:
 * - Native <dialog> invocation via showModal() / close()
 * - Backdrop click-to-dismiss (with cross-browser coordinate / target detection)
 * - Automatic binding of close triggers ([data-dialog-close])
 * - Escape key dismissal synchronization
 * - ARIA expanded state tracking on opening trigger buttons
 */

import { LifetimeScope } from "@/web/v2/core/dom/base_element.client";
import type { CleanupFn } from "@/web/v2/core/dom/disposable.client";

export interface ModalDialogOptions {
  /** Optional trigger element(s) that open this dialog. */
  trigger?: HTMLElement | HTMLElement[] | null;
  /** Optional callback fired when dialog opens. */
  onOpen?: () => void;
  /** Optional callback fired when dialog closes (via any method). */
  onClose?: () => void;
}

export interface ModalDialogController {
  open: (e?: Event) => void;
  close: (e?: Event) => void;
  dispose: CleanupFn;
}

export type ModalDialogHandle = CleanupFn & ModalDialogController;

/**
 * Attaches standardized modal lifecycle behavior to an HTML5 <dialog> element.
 * Returns a callable cleanup function augmented with open(), close(), and dispose() methods.
 */
export function setupModalDialog(
  dialog: HTMLDialogElement,
  options: ModalDialogOptions = {}
): ModalDialogHandle {
  const triggers = options.trigger
    ? Array.isArray(options.trigger)
      ? options.trigger
      : [options.trigger]
    : [];

  const openDialog = (e?: Event) => {
    // Opens this dialog via showModal() in place of the trigger's default
    // action
    e?.preventDefault();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    for (const t of triggers) {
      t.setAttribute("aria-expanded", "true");
    }
    options.onOpen?.();
  };

  const closeDialog = (e?: Event) => {
    // Closes this dialog via close() in place of the close button's / backdrop
    // click's default action
    e?.preventDefault();
    if (typeof dialog.close === "function") {
      dialog.close();
    } else if (dialog.hasAttribute("open")) {
      dialog.removeAttribute("open");
      // Native close() fires `close`; keep onClose working where it's missing (e.g. JSDOM).
      dialog.dispatchEvent(new Event("close"));
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === dialog) {
      // In Chromium / modern WebKit, clicking the ::backdrop reports e.target as the dialog itself.
      closeDialog(e);
      return;
    }
    // Coordinate bounding box fallback for older browsers
    const rect = dialog.getBoundingClientRect();
    const inDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width;
    if (!inDialog) {
      closeDialog(e);
    }
  };

  const handleNativeClose = () => {
    for (const t of triggers) {
      t.setAttribute("aria-expanded", "false");
    }
    options.onClose?.();
  };

  // A standalone scope, so the trigger and close-button clicks pass the
  // activation gate in `LifetimeScope.listen`.
  const scope = new LifetimeScope(dialog.ownerDocument);

  // Wire trigger button(s)
  for (const trigger of triggers) {
    trigger.removeAttribute("disabled");
    scope.listen(trigger, "click", openDialog);
  }

  // Backdrop click & native close event (Escape fires cancel then close)
  scope.listen(dialog, "click", handleBackdropClick);
  scope.listen(dialog, "close", handleNativeClose);

  // Wire all close buttons marked with [data-dialog-close]
  const closeBtns = Array.from(
    dialog.querySelectorAll<HTMLElement>("[data-dialog-close]")
  );
  for (const btn of closeBtns) {
    scope.listen(btn, "click", closeDialog);
  }

  const unbind: CleanupFn = () => {
    scope.dispose();
  };

  return Object.assign(unbind, {
    open: openDialog,
    close: closeDialog,
    dispose: unbind,
  });
}
