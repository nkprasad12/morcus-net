import { DisposableBag, type CleanupFn } from "@/web/v2/core/disposable.client";
import { bindDismissable } from "@/web/v2/core/dismissable.client";

/**
 * Interactive abbreviation popover for expandable dictionary words (.lsHover).
 *
 * Architecture Note (Item 6.6):
 * This utility uses a single shared top-layer container (`#abbr-popover`, rendered in page_shell.server.ts)
 * to service 1-to-N dynamic `.lsHover` abbreviation targets across dictionary entries.
 * Because targets are dynamic (frequently swapped via partial HTML updates), content is a tooltip
 * without interactive controls (no focus trap), and `#abbr-popover` uses top-layer Popover API
 * (`popover="auto"`), this component intentionally uses lightweight document delegation rather than
 * the 1-to-1 `AnchoredPopoverController`.
 *
 * It uses `DisposableBag` and `bindDismissable` for managed lifecycle and standardized outside-tap/Escape dismissal.
 */

let activeCleanup: CleanupFn | null = null;

export function setupAbbrPopover(
  doc: Document = document,
  win: Window = window
): CleanupFn {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const abbrPopover = doc.getElementById("abbr-popover");
  if (!abbrPopover) {
    return () => {};
  }

  const bag = new DisposableBag();
  let activeTarget: HTMLElement | null = null;
  const supportsNativePopover = typeof abbrPopover.showPopover === "function";

  const closeAbbrPopover = () => {
    if (supportsNativePopover) {
      if (abbrPopover.matches(":popover-open")) {
        abbrPopover.hidePopover();
      }
    } else {
      abbrPopover.style.display = "none";
    }
    activeTarget = null;
  };

  const isPopoverOpen = (): boolean =>
    supportsNativePopover
      ? abbrPopover.matches(":popover-open")
      : abbrPopover.style.display === "block";

  const positionAbbrPopover = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const popWidth = abbrPopover.offsetWidth || 200;
    const popHeight = abbrPopover.offsetHeight || 38;

    // Horizontally center over target word, strictly clamped to viewport padding
    const idealLeft = rect.left + rect.width / 2 - popWidth / 2;
    const clampedLeft = Math.max(
      8,
      Math.min(win.innerWidth - popWidth - 8, idealLeft)
    );

    // Place above if room, else place below
    const spaceAbove = rect.top;
    const spaceBelow = win.innerHeight - rect.bottom;
    let top = 0;
    if (spaceAbove >= popHeight + 8 || spaceAbove > spaceBelow) {
      top = rect.top + win.scrollY - popHeight - 6;
    } else {
      top = rect.bottom + win.scrollY + 6;
    }

    abbrPopover.style.position = "absolute";
    abbrPopover.style.left = `${Math.round(clampedLeft)}px`;
    abbrPopover.style.top = `${Math.round(top)}px`;
  };

  const openAbbrPopover = (target: HTMLElement) => {
    const titleText =
      target.getAttribute("title") || target.dataset.abbrExpansion;
    if (!titleText) return;

    // Cache expansion in dataset to suppress native delayed OS tooltip on hover
    if (!target.dataset.abbrExpansion) {
      target.dataset.abbrExpansion = titleText;
      target.removeAttribute("title");
    }

    // Toggle off if tapping the same active element
    if (activeTarget === target && isPopoverOpen()) {
      closeAbbrPopover();
      return;
    }

    activeTarget = target;
    abbrPopover.textContent = titleText;

    if (supportsNativePopover) {
      abbrPopover.showPopover();
    } else {
      abbrPopover.style.display = "block";
    }
    positionAbbrPopover(target);
  };

  const onClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;
    const abbr = e.target.closest<HTMLElement>(".lsHover");
    if (abbr) {
      e.preventDefault();
      openAbbrPopover(abbr);
    } else if (!abbrPopover.contains(e.target)) {
      closeAbbrPopover();
    }
  };

  // Keyboard accessibility: Enter or Space on focused .lsHover opens popover
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      const activeEl = doc.activeElement;
      if (
        activeEl instanceof HTMLElement &&
        activeEl.classList.contains("lsHover")
      ) {
        e.preventDefault();
        openAbbrPopover(activeEl);
      }
    }
  };

  const onResize = () => {
    if (activeTarget) {
      positionAbbrPopover(activeTarget);
    }
  };

  // Standardized dismiss coordination (pointerdown outside + Escape keydown)
  bag.add(
    bindDismissable({
      container: abbrPopover,
      isOpen: isPopoverOpen,
      onDismiss: closeAbbrPopover,
      listenPointerDown: true,
      ignore: (target) =>
        Boolean(
          activeTarget?.contains(target) ||
            (target instanceof Element && target.closest(".lsHover"))
        ),
    })
  );

  doc.addEventListener("click", onClick);
  bag.add(() => doc.removeEventListener("click", onClick));

  doc.addEventListener("keydown", onKeyDown);
  bag.add(() => doc.removeEventListener("keydown", onKeyDown));

  win.addEventListener("resize", onResize, { passive: true });
  bag.add(() => win.removeEventListener("resize", onResize));

  const unbind: CleanupFn = () => {
    bag.dispose();
    if (activeCleanup === unbind) {
      activeCleanup = null;
    }
  };
  activeCleanup = unbind;
  return unbind;
}

if (typeof document !== "undefined") {
  setupAbbrPopover();
}
