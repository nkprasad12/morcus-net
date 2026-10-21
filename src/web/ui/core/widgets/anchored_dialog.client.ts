import type { CleanupFn } from "@/web/ui/core/dom/disposable.client";
import { LifetimeScope } from "@/web/ui/core/dom/lifetime_scope.client";
import { setupModalDialog } from "@/web/ui/core/widgets/dialog.client";
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
  /** Minimum gap (px) between the dialog and the viewport edges; default 12. */
  margin?: number;
  /** Focus on open; by default the dialog's first focusable (native). */
  getInitialFocus?: () => HTMLElement | null;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface AnchoredDialog {
  isOpen(): boolean;
  /**
   * Opens the dialog under `anchor` (by default its trigger). An anchor that
   * is off screen, like an app-bar button scrolled out of view on a phone,
   * falls back to the trigger, then to a fixed spot near the top.
   */
  open(anchor?: HTMLElement | null): void;
  close(): void;
  toggle(): void;
  updatePosition(): void;
}

type AnchorRect = Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width">;

/**
 * A dialog anchored under its trigger (the reader's settings and contents,
 * the app-bar Appearance menu): a modal `<dialog>` via `setupModalDialog`.
 * The browser handles Escape, focus containment, the top layer and the inert
 * page (so an iframe can't take clicks), and only one can be open. A backdrop
 * click closes it without reaching the page. While open, it follows its
 * anchor on resize and scroll.
 *
 * Everything is released with `scope`; disposing closes an open dialog.
 */
export function setupAnchoredDialog(
  scope: LifetimeScope,
  options: AnchoredDialogOptions
): AnchoredDialog {
  const { dialog, trigger, align, defaultWidth } = options;
  const margin = options.margin ?? 12;
  const doc = dialog.ownerDocument;
  const win = doc.defaultView ?? window;
  const centered = align === "center";
  // Standalone, so the trigger click passes the activation gate in
  // `LifetimeScope.listen` (the settings trigger is outside its component).
  const own = new LifetimeScope(doc);
  let openScope: LifetimeScope | null = null;
  let anchorEl: HTMLElement | null = null;

  /** The viewport, without a classic scrollbar (as `position: fixed` lays out). */
  const viewport = () => ({
    width: doc.documentElement.clientWidth || win.innerWidth || defaultWidth,
    height: win.innerHeight || doc.documentElement.clientHeight,
  });

  /**
   * The rect to anchor to, or `null` when no candidate is laid out and on
   * screen. A zero rect means layout isn't available (jsdom/headless) or the
   * element is hidden.
   */
  const anchorRect = (height: number): AnchorRect | null => {
    for (const el of [anchorEl, trigger]) {
      const rect = el?.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      // Without a known viewport height (jsdom), trust the rect.
      if (!height || (rect.bottom > 0 && rect.top < height)) return rect;
    }
    return null;
  };

  const updatePosition = () => {
    if (!dialog.open) return;
    const vp = viewport();
    const width = dialog.offsetWidth || defaultWidth;
    const rect = anchorRect(vp.height);
    // Centred dialogs then keep their CSS fallback position; end dialogs fall
    // back to the top-right corner.
    if (!rect && centered) return;
    const anchor = rect ?? {
      top: 40,
      bottom: 40,
      left: vp.width - 44,
      right: vp.width - 12,
      width: 32,
    };
    const placement = computeAnchoredPlacement(
      anchor,
      { width, height: dialog.offsetHeight },
      vp,
      {
        align,
        side: "below",
        gap: 8,
        margin,
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

  /**
   * Undoes everything `onOpen` set up. Runs from the native `close` event and,
   * because that event is async in browsers (a task queued by `close()`), from
   * `dispose` too, which removes the listener before it would fire. The
   * `wasOpen` guard keeps it to once per opening.
   */
  let wasOpen = false;
  const teardown = () => {
    if (!wasOpen) return;
    wasOpen = false;
    trigger?.setAttribute("aria-expanded", "false");
    openScope?.dispose();
    openScope = null;
    anchorEl = null;
    if (centered) {
      dialog.style.removeProperty("top");
      dialog.style.removeProperty("left");
      dialog.style.removeProperty("--caret-left");
    }
    options.onClose?.();
  };

  const modal = setupModalDialog(dialog, {
    onOpen: () => {
      wasOpen = true;
      trigger?.setAttribute("aria-expanded", "true");
      updatePosition();
      openScope = own.createScope();
      openScope.listen(win, "resize", updatePosition);
      openScope.listen(win, "scroll", updatePosition, { passive: true });
      options.onOpen?.();
    },
    onClose: teardown,
  });

  const open = (anchor?: HTMLElement | null) => {
    if (dialog.open) return;
    anchorEl = anchor ?? null;
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
    teardown();
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
