/**
 * Mobile navigation menu outside-click dismissal.
 */

let activeCleanup: (() => void) | null = null;

export function setupMobileMenu(doc: Document = document): () => void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const onPointerDown = (e: PointerEvent) => {
    const mobileMenu = doc.querySelector<HTMLDetailsElement>(".v2-mobile-menu");
    if (mobileMenu && mobileMenu.open) {
      if (e.target instanceof Node && !mobileMenu.contains(e.target)) {
        mobileMenu.open = false;
      }
    }
  };

  doc.addEventListener("pointerdown", onPointerDown);

  const unbind = () => {
    doc.removeEventListener("pointerdown", onPointerDown);
    if (activeCleanup === unbind) {
      activeCleanup = null;
    }
  };
  activeCleanup = unbind;
  return unbind;
}

if (typeof document !== "undefined") {
  setupMobileMenu();
}
