import {
  type CleanupFn,
  LifetimeScope,
  setupModalDialog,
} from "@/web/ui/core/index.client";
import { computeAnchoredPlacement } from "@/web/ui/core/widgets/anchored_position.client";

interface AnchoredDialogOptions {
  dialog: HTMLDialogElement;
  /** The button (or `<a role="button">`) that opens the dialog. */
  trigger: HTMLElement | null;
  /**
   * `"end"` aligns the right edges; `"center"` centres the dialog on the
   * trigger (CSS shifts it by `translateX(-50%)`).
   */
  align: "center" | "end";
  /** Fallback width (px) when layout is unavailable (jsdom). */
  defaultWidth: number;
  /** Focus on open; by default the dialog's first focusable (native). */
  getInitialFocus?: () => HTMLElement | null;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface AnchoredDialog {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  updatePosition(): void;
}

/**
 * A reader dialog (settings, contents) anchored under its trigger in the
 * sticky bar: a modal `<dialog>` via `setupModalDialog`, like the Appearance
 * menu. The browser handles Escape, focus containment, the top layer and the
 * inert page (so the dictionary iframe can't take clicks), and only one can
 * be open. A backdrop click closes it without reaching the page. While open,
 * it follows its trigger on resize and scroll.
 *
 * Everything is released with `scope`; disposing closes an open dialog.
 */
export function setupAnchoredDialog(
  scope: LifetimeScope,
  options: AnchoredDialogOptions
): AnchoredDialog {
  const { dialog, trigger, align, defaultWidth } = options;
  const doc = dialog.ownerDocument;
  const win = doc.defaultView ?? window;
  const centered = align === "center";
  // Standalone, so the trigger click passes the activation gate in
  // `LifetimeScope.listen` (the settings trigger is outside its component).
  const own = new LifetimeScope(doc);
  let openScope: LifetimeScope | null = null;

  const updatePosition = () => {
    if (!dialog.open) return;
    const viewport = {
      width: win.innerWidth || doc.documentElement.clientWidth || defaultWidth,
      height: win.innerHeight,
    };
    const width = dialog.offsetWidth || defaultWidth;
    const rect = trigger?.getBoundingClientRect();
    // A zero rect means layout isn't available (jsdom/headless) or the trigger
    // is hidden. Centred dialogs then keep their CSS fallback position; end
    // dialogs fall back to the top-right corner.
    const measured = rect !== undefined && (rect.width > 0 || rect.height > 0);
    if (!measured && centered) return;
    const anchor = measured
      ? rect
      : {
          top: 40,
          bottom: 40,
          left: viewport.width - 44,
          right: viewport.width - 12,
          width: 32,
        };
    const placement = computeAnchoredPlacement(
      anchor,
      { width, height: dialog.offsetHeight },
      viewport,
      {
        align,
        side: "below",
        gap: 8,
        margin: 12,
        // Bounds: left >= radius + 6 (14px), right >= radius + 8 (16px) for --radius-lg (8px).
        caretInset: 16,
      }
    );
    dialog.style.top = `${Math.round(placement.top)}px`;
    dialog.style.left = `${Math.round(
      centered ? placement.left + width / 2 : placement.left
    )}px`;
    dialog.style.setProperty(
      "--caret-left",
      `${Math.round(placement.caretLeft)}px`
    );
  };

  const modal = setupModalDialog(dialog, {
    onOpen: () => {
      trigger?.setAttribute("aria-expanded", "true");
      updatePosition();
      openScope = own.createScope();
      openScope.listen(win, "resize", updatePosition);
      openScope.listen(win, "scroll", updatePosition, { passive: true });
      options.onOpen?.();
    },
    onClose: () => {
      trigger?.setAttribute("aria-expanded", "false");
      openScope?.dispose();
      openScope = null;
      if (centered) {
        dialog.style.removeProperty("top");
        dialog.style.removeProperty("left");
        dialog.style.removeProperty("--caret-left");
      }
      options.onClose?.();
    },
  });

  const open = () => {
    if (dialog.open) return;
    // `autofocus` steers the dialog's own initial focus, so the first
    // focusable (e.g. a search field that raises a phone keyboard) never
    // takes it first.
    const focus = options.getInitialFocus?.() ?? null;
    if (focus) focus.autofocus = true;
    modal.open();
    if (focus) {
      focus.autofocus = false;
      focus.focus();
    }
  };
  const close = () => {
    if (dialog.open) modal.close();
  };

  own.listen(trigger, "click", (e: MouseEvent) => {
    // Opens its dialog in place of the trigger's native action (the TOC's
    // No-JS `#reader-toc-drawer` link)
    e.preventDefault();
    open();
  });

  const dispose: CleanupFn = () => {
    close();
    // The native `close` event is async, so don't wait for onClose.
    trigger?.setAttribute("aria-expanded", "false");
    modal.dispose();
    own.dispose();
  };
  scope.use(dispose);

  return {
    isOpen: () => dialog.open,
    open,
    close,
    toggle: () => (dialog.open ? close() : open()),
    updatePosition,
  };
}
