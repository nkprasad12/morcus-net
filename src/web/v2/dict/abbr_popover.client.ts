/**
 * Interactive abbreviation popover for expandable dictionary words (.lsHover).
 */

let activeCleanup: (() => void) | null = null;

export function setupAbbrPopover(
  doc: Document = document,
  win: Window = window
): () => void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const abbrPopover = doc.getElementById("abbr-popover");
  if (!abbrPopover) {
    return () => {};
  }

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
    const isOpen = supportsNativePopover
      ? abbrPopover.matches(":popover-open")
      : abbrPopover.style.display === "block";
    if (activeTarget === target && isOpen) {
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

  // Ensure touch dismisses immediately on tap outside
  const onPointerDown = (e: PointerEvent) => {
    if (!(e.target instanceof Node)) return;
    if (
      activeTarget &&
      !activeTarget.contains(e.target) &&
      !abbrPopover.contains(e.target)
    ) {
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
    } else if (e.key === "Escape") {
      closeAbbrPopover();
    }
  };

  const onResize = () => {
    if (activeTarget) {
      positionAbbrPopover(activeTarget);
    }
  };

  doc.addEventListener("click", onClick);
  doc.addEventListener("pointerdown", onPointerDown);
  doc.addEventListener("keydown", onKeyDown);
  win.addEventListener("resize", onResize, { passive: true });

  const unbind = () => {
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("pointerdown", onPointerDown);
    doc.removeEventListener("keydown", onKeyDown);
    win.removeEventListener("resize", onResize);
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
