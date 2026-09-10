// Register native custom elements for the UI V2 progressive enhancement
import "@/web/v2/dict/dict_suggestions.client";
import "@/web/v2/dict/dict_search.client";
import "@/web/v2/dict/dict_settings.client";
import "@/web/v2/shell/theme_toggle.client";
import "@/web/v2/dialog/report_dialog.client";
import "@/web/v2/reader/reader_view.client";
import "@/web/v2/library/library_view.client";

// Mark document as JS-enhanced to disable static No-JS CSS fallbacks
document.documentElement.classList.add("v2-has-js");

// Close mobile <details> navigation menu when clicking outside or following a link
document.addEventListener("pointerdown", (e: PointerEvent) => {
  const mobileMenu =
    document.querySelector<HTMLDetailsElement>(".v2-mobile-menu");
  if (mobileMenu && mobileMenu.open) {
    if (e.target instanceof Node && !mobileMenu.contains(e.target)) {
      mobileMenu.open = false;
    }
  }
});

function triggerAnchorHighlight(targetEl: HTMLElement) {
  if (targetEl.id === "top" || targetEl.classList.contains("v2-dict-card")) {
    return;
  }
  targetEl.classList.remove("v2-target-active");
  // Force a reflow so browser restarts keyframe animation cleanly
  void targetEl.offsetWidth;
  targetEl.classList.add("v2-target-active");
  targetEl.addEventListener(
    "animationend",
    () => {
      targetEl.classList.remove("v2-target-active");
    },
    { once: true }
  );
}

function expandAncestorDisclosures(targetEl: HTMLElement) {
  let parent: HTMLElement | null = targetEl;
  while (parent) {
    if (parent instanceof HTMLDetailsElement && !parent.open) {
      parent.open = true;
    }
    if (parent.classList?.contains("v2-dict-card")) {
      const toggle =
        parent.querySelector<HTMLDetailsElement>(".v2-dict-toggle");
      if (toggle && !toggle.open) {
        toggle.open = true;
      }
    }
    parent = parent.parentElement;
  }
}

// Expand any ancestor <details> if initial page load has a hash
if (window.location.hash) {
  const initialTarget = document.getElementById(window.location.hash.slice(1));
  if (initialTarget) {
    expandAncestorDisclosures(initialTarget);
  }
}

// Smooth scroll, auto-expand parent cards, and animate highlight on in-page anchor links
document.addEventListener("click", (e: MouseEvent) => {
  if (!(e.target instanceof Element)) return;
  const anchor = e.target.closest<HTMLAnchorElement>("a[href^='#']");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (
    !href ||
    href === "#" ||
    href === "#top" ||
    anchor.classList.contains("v2-back-to-top")
  ) {
    return;
  }

  const targetId = href.slice(1);
  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    e.preventDefault();
    expandAncestorDisclosures(targetEl);

    const isJumpPill =
      anchor.classList.contains("v2-jump-pill") ||
      targetEl.classList.contains("v2-dict-card");
    targetEl.scrollIntoView({ behavior: isJumpPill ? "instant" : "smooth" });
    history.replaceState(null, "", href);
    triggerAnchorHighlight(targetEl);
  }
});

// Floating "Jump to top" button visibility & instant scroll
const backToTopBtn =
  document.querySelector<HTMLAnchorElement>(".v2-back-to-top");
if (backToTopBtn) {
  let ticking = false;
  const updateBackToTop = () => {
    const shouldShow = window.scrollY > 300;
    backToTopBtn.classList.toggle("v2-visible", shouldShow);
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateBackToTop);
        ticking = true;
      }
    },
    { passive: true }
  );

  updateBackToTop();

  backToTopBtn.addEventListener("click", (e: MouseEvent) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "instant" });
    if (window.location.hash) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  });
}

declare global {
  interface HTMLElement {
    showPopover(): void;
    hidePopover(): void;
  }
}

// Interactive abbreviation popover for expandable dictionary words
const abbrPopover = document.getElementById("v2-abbr-popover");
if (abbrPopover) {
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
      Math.min(window.innerWidth - popWidth - 8, idealLeft)
    );

    // Place above if room, else place below
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let top = 0;
    if (spaceAbove >= popHeight + 8 || spaceAbove > spaceBelow) {
      top = rect.top + window.scrollY - popHeight - 6;
    } else {
      top = rect.bottom + window.scrollY + 6;
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

  document.addEventListener("click", (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;
    const abbr = e.target.closest<HTMLElement>(".lsHover");
    if (abbr) {
      e.preventDefault();
      openAbbrPopover(abbr);
    } else if (!abbrPopover.contains(e.target)) {
      closeAbbrPopover();
    }
  });

  // Ensure touch dismisses immediately on tap outside
  document.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!(e.target instanceof Node)) return;
    if (
      activeTarget &&
      !activeTarget.contains(e.target) &&
      !abbrPopover.contains(e.target)
    ) {
      closeAbbrPopover();
    }
  });

  // Keyboard accessibility: Enter or Space on focused .lsHover opens popover
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      const activeEl = document.activeElement;
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
  });

  // Reposition on viewport resize if active
  window.addEventListener(
    "resize",
    () => {
      if (activeTarget) {
        positionAbbrPopover(activeTarget);
      }
    },
    { passive: true }
  );
}

console.log(
  "Morcus UI V2 Web Components initialized (Native Custom Elements)."
);
