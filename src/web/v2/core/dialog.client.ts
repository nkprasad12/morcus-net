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

export interface ModalDialogOptions {
  /** Optional trigger element(s) that open this dialog. */
  trigger?: HTMLElement | HTMLElement[] | null;
  /** Optional callback fired when dialog opens. */
  onOpen?: () => void;
  /** Optional callback fired when dialog closes (via any method). */
  onClose?: () => void;
}

/**
 * Attaches standardized modal lifecycle behavior to an HTML5 <dialog> element.
 * Returns an unbind / cleanup function.
 */
export function setupModalDialog(
  dialog: HTMLDialogElement,
  options: ModalDialogOptions = {}
): () => void {
  const triggers = options.trigger
    ? Array.isArray(options.trigger)
      ? options.trigger
      : [options.trigger]
    : [];

  const openDialog = (e?: Event) => {
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
    e?.preventDefault();
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
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

  const cleanups: (() => void)[] = [];

  // Wire trigger button(s)
  for (const trigger of triggers) {
    trigger.removeAttribute("disabled");
    trigger.addEventListener("click", openDialog);
    cleanups.push(() => trigger.removeEventListener("click", openDialog));
  }

  // Backdrop click & cancel/close events
  dialog.addEventListener("click", handleBackdropClick);
  cleanups.push(() => dialog.removeEventListener("click", handleBackdropClick));

  dialog.addEventListener("close", handleNativeClose);
  cleanups.push(() => dialog.removeEventListener("close", handleNativeClose));

  dialog.addEventListener("cancel", handleNativeClose);
  cleanups.push(() => dialog.removeEventListener("cancel", handleNativeClose));

  // Wire all close buttons marked with [data-dialog-close]
  const closeBtns = Array.from(
    dialog.querySelectorAll<HTMLElement>("[data-dialog-close]")
  );
  for (const btn of closeBtns) {
    btn.addEventListener("click", closeDialog);
    cleanups.push(() => btn.removeEventListener("click", closeDialog));
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
