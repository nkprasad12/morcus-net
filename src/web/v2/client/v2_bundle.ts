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

// Smooth scroll and auto-expand target <details> card when clicking a jump pill
document.addEventListener("click", (e: MouseEvent) => {
  const pill = (e.target as Element)?.closest?.<HTMLAnchorElement>(".v2-jump-pill");
  if (!pill) return;
  const href = pill.getAttribute("href");
  if (!href || !href.startsWith("#")) return;
  const targetId = href.slice(1);
  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    e.preventDefault();
    if (targetEl instanceof HTMLDetailsElement && !targetEl.open) {
      targetEl.open = true;
    }
    targetEl.scrollIntoView({ behavior: "smooth" });
    history.replaceState(null, "", href);
  }
});

console.log(
  "Morcus UI V2 Web Components initialized (Native Custom Elements)."
);
