// Register native custom elements for the UI V2 progressive enhancement
import "@/web/v2/client/morcus_dict_suggestions";
import "@/web/v2/client/morcus_dict_search";
import "@/web/v2/client/morcus_theme_toggle";
import "@/web/v2/client/morcus_report_dialog";

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

// Expand any ancestor <details> if initial page load has a hash
if (window.location.hash) {
  const initialTarget = document.getElementById(window.location.hash.slice(1));
  if (initialTarget) {
    let parent: HTMLElement | null = initialTarget;
    while (parent) {
      if (parent instanceof HTMLDetailsElement && !parent.open) {
        parent.open = true;
      }
      parent = parent.parentElement;
    }
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
    // Auto-expand any ancestor <details> cards (and target itself if a card)
    let parent: HTMLElement | null = targetEl;
    while (parent) {
      if (parent instanceof HTMLDetailsElement && !parent.open) {
        parent.open = true;
      }
      parent = parent.parentElement;
    }

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

console.log(
  "Morcus UI V2 Web Components initialized (Native Custom Elements)."
);
